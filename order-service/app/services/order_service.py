"""Order use-cases: checkout, listing, detail, cancel, admin status updates."""
from __future__ import annotations

import time
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import messages
from app.enums import (
    CANCELLABLE_STATUSES,
    RELEASE_ON_CANCEL_STATUSES,
    STATUS_TRANSITIONS,
    OrderStatus,
    PaymentStatus,
    SagaLogService,
    SagaLogStage,
)
from app.errors import BadRequestError, NotFoundError
from app.models import Order, OrderItem, OrderStatusHistory
from app.repositories import outbox_repository, saga_log_repository
from app.repositories.cart_repository import CartRepository
from app.schemas import CancelOrderRequest, CheckoutRequest, UpdateOrderStatusRequest
from app.services import serializers
from app.services.cart_service import _as_decimal, _find_variant
from app.services.product_client import ProductClient
from app.time_utils import now_vn


def generate_order_code() -> str:
    return f"ORD-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6].upper()}"


def _parse_uuid(value, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        raise BadRequestError(
            messages.MALFORMED_REQUEST,
            code="MALFORMED_REQUEST",
            details={field: [f"{field} must be a valid UUID"]},
        )


def _validate_paging(page: int, page_size: int) -> None:
    if page < 1:
        raise BadRequestError(messages.PAGE_NEGATIVE, code="PAGE_INVALID")
    if page_size < 1 or page_size > 100:
        raise BadRequestError(messages.PAGE_SIZE_RANGE, code="PAGE_SIZE_INVALID")


def _add_history(
    order: Order, status: str, changed_by=None, note: str | None = None
) -> OrderStatusHistory:
    history = OrderStatusHistory(
        order_id=order.id,
        status=status,
        changed_by=changed_by,
        note=note[:1000] if note else None,
        changed_at=now_vn(),
    )
    order.status_histories.append(history)
    return history


class OrderService:
    def __init__(self, session: Session, cart_repo: CartRepository, product_client: ProductClient):
        self._session = session
        self._carts = cart_repo
        self._products = product_client

    # ---------- checkout ----------

    def checkout(self, user_id: str, request: CheckoutRequest) -> dict:
        cart = self._carts.load(user_id)
        if cart is None or not cart.get("items"):
            raise NotFoundError(messages.CART_NOT_FOUND, code="CART_EMPTY")

        cart_items_by_variant = {str(i["variantId"]): i for i in cart["items"]}
        selected_ids = [str(v) for v in request.variantIds]
        if any(v not in cart_items_by_variant for v in selected_ids):
            raise BadRequestError(
                messages.CHECKOUT_ITEMS_NOT_IN_CART, code="CHECKOUT_ITEMS_NOT_IN_CART"
            )

        order_id = uuid.uuid4()
        items: list[OrderItem] = []
        total = Decimal("0")
        # De-duplicate while keeping order (same variant listed twice is one line)
        seen: set[str] = set()
        for variant_id in selected_ids:
            if variant_id in seen:
                continue
            seen.add(variant_id)
            cart_item = cart_items_by_variant[variant_id]
            # Live re-fetch: the cart price is NOT trusted at checkout.
            product = self._products.get_product(str(cart_item["productId"]))
            variant = _find_variant(product, variant_id)
            base = product.get("basePrice")
            if base is None:
                raise BadRequestError(messages.PRODUCT_NO_PRICE, code="PRODUCT_NO_PRICE")
            unit_price = _as_decimal(base) + _as_decimal(variant.get("extraPrice") or 0)
            if unit_price < 0:
                raise BadRequestError(
                    messages.PRODUCT_INVALID_PRICE, code="PRODUCT_INVALID_PRICE"
                )
            quantity = int(cart_item["quantity"])
            subtotal = unit_price * quantity
            total += subtotal
            items.append(
                OrderItem(
                    order_id=order_id,
                    product_id=uuid.UUID(str(cart_item["productId"])),
                    variant_id=uuid.UUID(variant_id),
                    product_name=product.get("name"),
                    sku_variant=variant.get("skuVariant"),
                    color=variant.get("color"),
                    color_hex=variant.get("colorHex"),
                    size=variant.get("size"),
                    # image comes from the cart snapshot, not re-derived
                    product_image_url=cart_item.get("productImageUrl"),
                    unit_price=unit_price,
                    quantity=quantity,
                    subtotal=subtotal,
                )
            )

        order = Order(
            id=order_id,
            order_code=generate_order_code(),
            user_id=_parse_uuid(user_id, "userId"),
            total_amount=total,
            status=OrderStatus.PENDING.value,
            payment_status=PaymentStatus.UNPAID.value,
            payment_method=request.paymentMethod,
            receiver_name=request.receiverName,
            receiver_phone=request.receiverPhone,
            shipping_address=request.shippingAddress,
            note=request.note,
        )
        order.items.extend(items)
        self._session.add(order)
        _add_history(
            order,
            OrderStatus.PENDING.value,
            changed_by=order.user_id,
            note=messages.HISTORY_ORDER_CREATED,
        )
        saga_log_repository.add_log(
            self._session, order.id, SagaLogStage.CREATED, messages.SAGA_ORDER_CREATED
        )
        # Transactional outbox: the reserve request commits atomically with the
        # order — checkout never fails because the broker is down.
        outbox_repository.add_stock_reserve_requested(self._session, order)
        saga_log_repository.add_log(
            self._session,
            order.id,
            SagaLogStage.STOCK_RESERVE_REQUESTED,
            messages.SAGA_STOCK_RESERVE_REQUESTED,
            target=SagaLogService.PRODUCT_SERVICE,
        )
        self._session.commit()
        # NOTE: the cart is intentionally NOT cleared here — items are removed
        # per-variant when payment.completed arrives.
        return {
            "orderId": str(order.id),
            "orderCode": order.order_code,
            "totalAmount": order.total_amount,
            "orderStatus": order.status,
            "paymentId": None,
            "paymentStatus": order.payment_status,
            "paymentUrl": None,
        }

    # ---------- queries ----------

    def _page_orders(
        self, page: int, page_size: int, status: str | None, user_id: str | None
    ) -> dict:
        _validate_paging(page, page_size)
        conditions = []
        if user_id is not None:
            conditions.append(Order.user_id == _parse_uuid(user_id, "userId"))
        if status:
            if status not in {s.value for s in OrderStatus}:
                raise BadRequestError(
                    messages.ORDER_STATUS_INVALID,
                    code="INVALID_ORDER_STATUS",
                    details={"status": [messages.ORDER_STATUS_INVALID]},
                )
            conditions.append(Order.status == status)
        base = select(Order)
        count_stmt = select(func.count()).select_from(Order)
        for cond in conditions:
            base = base.where(cond)
            count_stmt = count_stmt.where(cond)
        total = self._session.scalar(count_stmt) or 0
        rows = self._session.scalars(
            base.order_by(Order.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        content = [serializers.order_summary_response(o) for o in rows]
        return serializers.page_response(content, page, page_size, total)

    def list_user_orders(
        self, user_id: str, status: str | None, page: int, page_size: int
    ) -> dict:
        return self._page_orders(page, page_size, status, user_id)

    def list_admin_orders(self, status: str | None, page: int, page_size: int) -> dict:
        return self._page_orders(page, page_size, status, None)

    def get_user_order(self, user_id: str, order_id: str) -> dict:
        order = self._find_order(order_id, user_id=user_id)
        return serializers.order_response(order)

    def get_admin_order(self, order_id: str) -> dict:
        order = self._find_order(order_id)
        return serializers.order_response(order)

    def admin_summary(self) -> dict:
        rows = self._session.execute(
            select(Order.status, func.count()).group_by(Order.status)
        ).all()
        by_status = {status: count for status, count in rows}
        return {
            "totalOrders": sum(by_status.values()),
            "ordersByStatus": by_status,
        }

    def _find_order(self, order_id: str, user_id: str | None = None) -> Order:
        try:
            oid = uuid.UUID(str(order_id))
        except (ValueError, TypeError):
            raise NotFoundError(messages.ORDER_NOT_FOUND, code="ORDER_NOT_FOUND")
        stmt = select(Order).where(Order.id == oid)
        if user_id is not None:
            stmt = stmt.where(Order.user_id == _parse_uuid(user_id, "userId"))
        order = self._session.scalars(stmt).first()
        if order is None:
            raise NotFoundError(messages.ORDER_NOT_FOUND, code="ORDER_NOT_FOUND")
        return order

    # ---------- cancel (user) ----------

    def cancel_order(self, user_id: str, order_id: str, request: CancelOrderRequest) -> dict:
        order = self._find_order(order_id, user_id=user_id)
        if order.status not in CANCELLABLE_STATUSES:
            raise BadRequestError(
                messages.CANCEL_NOT_ALLOWED.format(status=order.status),
                code="CANCEL_NOT_ALLOWED",
            )
        release = order.status in RELEASE_ON_CANCEL_STATUSES
        order.status = OrderStatus.CANCELLED.value
        order.updated_at = now_vn()
        _add_history(
            order, OrderStatus.CANCELLED.value, changed_by=order.user_id, note=request.reason
        )
        if release:
            outbox_repository.add_stock_release_requested(self._session, order)
            saga_log_repository.add_log(
                self._session,
                order.id,
                SagaLogStage.STOCK_RELEASE_REQUESTED,
                messages.SAGA_STOCK_RELEASE_REQUESTED,
                target=SagaLogService.PRODUCT_SERVICE,
            )
        self._session.commit()
        return serializers.order_response(order)

    # ---------- admin status update ----------

    def update_status_admin(
        self, order_id: str, changed_by: str, request: UpdateOrderStatusRequest
    ) -> dict:
        order = self._find_order(order_id)
        target = request.status
        allowed = STATUS_TRANSITIONS.get(order.status, set())
        if target == order.status or target not in allowed:
            raise BadRequestError(
                messages.TRANSITION_NOT_ALLOWED.format(cur=order.status, target=target),
                code="INVALID_STATUS_TRANSITION",
            )
        previous = order.status
        order.status = target
        order.updated_at = now_vn()
        _add_history(
            order, target, changed_by=_parse_uuid(changed_by, "X-User-Id"), note=request.note
        )
        # Cancelling from PENDING/AWAITING_PAYMENT via the admin endpoint
        # also releases stock — same as the user cancel flow.
        if (
            target == OrderStatus.CANCELLED.value
            and previous in RELEASE_ON_CANCEL_STATUSES
        ):
            outbox_repository.add_stock_release_requested(self._session, order)
            saga_log_repository.add_log(
                self._session,
                order.id,
                SagaLogStage.STOCK_RELEASE_REQUESTED,
                messages.SAGA_STOCK_RELEASE_REQUESTED,
                target=SagaLogService.PRODUCT_SERVICE,
            )
        self._session.commit()
        return serializers.order_response(order)
