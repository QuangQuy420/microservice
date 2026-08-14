"""Domain logic for consumed saga events.

Pure sync functions over a Session — called by the AMQP consumer (in a worker
thread) and directly by tests. Every handler is idempotent through an
order-status guard: an event arriving when the order is not in the expected
state is logged and ignored (the message is still acked by the caller).
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import messages
from app.enums import (
    OrderStatus,
    PaymentStatus,
    SagaLogLevel,
    SagaLogService,
    SagaLogStage,
)
from app.models import Order, OrderStatusHistory
from app.repositories import outbox_repository, saga_log_repository
from app.repositories.cart_repository import CartRepository
from app.time_utils import now_vn

logger = logging.getLogger(__name__)


def _find_order(session: Session, order_id: str) -> Order | None:
    try:
        oid = uuid.UUID(str(order_id))
    except (ValueError, TypeError):
        return None
    return session.scalars(select(Order).where(Order.id == oid)).first()


def _history(order: Order, status: str, note: str | None) -> None:
    order.status_histories.append(
        OrderStatusHistory(
            order_id=order.id,
            status=status,
            changed_by=None,
            note=note[:1000] if note else None,
            changed_at=now_vn(),
        )
    )


def _emit_stock_release(session: Session, order: Order) -> None:
    outbox_repository.add_stock_release_requested(session, order)
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.STOCK_RELEASE_REQUESTED,
        messages.SAGA_STOCK_RELEASE_REQUESTED,
        target=SagaLogService.PRODUCT_SERVICE,
    )


def handle_stock_reserved(session: Session, order_id: str) -> None:
    order = _find_order(session, order_id)
    if order is None:
        logger.warning("stock.reserved for unknown order %s — ignoring", order_id)
        return
    if order.status == OrderStatus.CANCELLED.value:
        # Late reservation for an already-cancelled order → compensate.
        _emit_stock_release(session, order)
        session.commit()
        return
    if order.status != OrderStatus.PENDING.value:
        logger.info(
            "stock.reserved ignored for order %s in status %s", order_id, order.status
        )
        return
    order.status = OrderStatus.AWAITING_PAYMENT.value
    order.updated_at = now_vn()
    _history(order, OrderStatus.AWAITING_PAYMENT.value, messages.HISTORY_STOCK_RESERVED)
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.STOCK_RESERVED,
        messages.SAGA_STOCK_RESERVED,
        source=SagaLogService.PRODUCT_SERVICE,
    )
    outbox_repository.add_payment_create_requested(session, order)
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.PAYMENT_CREATE_REQUESTED,
        messages.SAGA_PAYMENT_CREATE_REQUESTED,
        target=SagaLogService.PAYMENT_SERVICE,
    )
    session.commit()


def handle_stock_reserve_rejected(
    session: Session, order_id: str, reason: str | None
) -> None:
    order = _find_order(session, order_id)
    if order is None:
        logger.warning("stock.reserve.rejected for unknown order %s — ignoring", order_id)
        return
    if order.status != OrderStatus.PENDING.value:
        logger.info(
            "stock.reserve.rejected ignored for order %s in status %s",
            order_id,
            order.status,
        )
        return
    note = reason or messages.HISTORY_STOCK_REJECTED_DEFAULT
    order.status = OrderStatus.CANCELLED.value
    order.updated_at = now_vn()
    _history(order, OrderStatus.CANCELLED.value, note)
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.STOCK_RESERVE_REJECTED,
        note,
        level=SagaLogLevel.WARN,
        source=SagaLogService.PRODUCT_SERVICE,
        error_detail=reason,
    )
    # Nothing was reserved — no stock release.
    session.commit()


def handle_payment_completed(
    session: Session,
    cart_repo: CartRepository,
    order_id: str,
    payment_id: str | None,
    transaction_code: str | None,
) -> None:
    order = _find_order(session, order_id)
    if order is None:
        logger.warning("payment.completed for unknown order %s — ignoring", order_id)
        return
    if order.status != OrderStatus.AWAITING_PAYMENT.value:
        logger.info(
            "payment.completed ignored for order %s in status %s", order_id, order.status
        )
        return
    order.status = OrderStatus.CONFIRMED.value
    order.payment_status = PaymentStatus.PAID.value
    if payment_id:
        try:
            order.payment_id = uuid.UUID(str(payment_id))
        except ValueError:
            logger.warning("payment.completed with non-UUID paymentId %r", payment_id)
    order.transaction_code = transaction_code
    order.updated_at = now_vn()
    _history(order, OrderStatus.CONFIRMED.value, messages.HISTORY_PAYMENT_COMPLETED)
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.PAYMENT_COMPLETED,
        messages.SAGA_PAYMENT_COMPLETED,
        source=SagaLogService.PAYMENT_SERVICE,
    )
    variant_ids = [str(item.variant_id) for item in order.items]
    session.commit()
    # Cart cleanup is best-effort and happens after the commit — a Redis blip
    # must not roll back the confirmed order.
    try:
        from app.services.cart_service import CartService

        CartService(cart_repo, product_client=None).remove_variants_after_payment(  # type: ignore[arg-type]
            str(order.user_id), variant_ids
        )
    except Exception:
        logger.exception("Failed to remove paid items from cart for order %s", order_id)


def handle_payment_failed(session: Session, order_id: str, reason: str | None) -> None:
    order = _find_order(session, order_id)
    if order is None:
        logger.warning("payment.failed for unknown order %s — ignoring", order_id)
        return
    if order.status != OrderStatus.AWAITING_PAYMENT.value:
        logger.info(
            "payment.failed ignored for order %s in status %s", order_id, order.status
        )
        return
    note = reason or messages.HISTORY_PAYMENT_FAILED_DEFAULT
    order.status = OrderStatus.CANCELLED.value
    order.payment_status = PaymentStatus.FAILED.value
    order.updated_at = now_vn()
    _history(order, OrderStatus.CANCELLED.value, note)
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.PAYMENT_FAILED,
        note,
        level=SagaLogLevel.WARN,
        source=SagaLogService.PAYMENT_SERVICE,
        error_detail=reason,
    )
    _emit_stock_release(session, order)
    session.commit()


def record_dead_letter(
    session: Session, order_id: str | None, routing_key: str, redeliver_count: int
) -> None:
    """Best-effort DEAD_LETTERED saga log written by the DLQ consumer."""
    if not order_id:
        return
    order = _find_order(session, order_id)
    if order is None:
        return
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.DEAD_LETTERED,
        messages.SAGA_DEAD_LETTERED.format(rk=routing_key, n=redeliver_count),
        level=SagaLogLevel.WARN,
        source=SagaLogService.MESSAGE_BROKER,
    )
    session.commit()
