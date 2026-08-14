"""Saga reconciliation job.

Asyncio background loop with a ~10 s tick. Settings (interval, stuck
threshold, max attempts) are re-read from the DB on every tick, so admin
changes apply without a restart; the effective run cadence is `interval_ms`.
Single-instance assumption — no leader election.

- Stuck orders (PENDING / AWAITING_PAYMENT, not exhausted, last activity older
  than the threshold): resend the missing saga command through the outbox, or
  exhaust when max attempts is reached.
- Pending stock releases (legacy `stock_release_pending` flag): republished via
  the outbox and the flag cleared. The outbox made this flag unnecessary for
  new writes, but the job still honors it (e.g. legacy rows written before
  the outbox existed).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app import messages
from app.enums import (
    OrderStatus,
    SagaLogLevel,
    SagaLogService,
    SagaLogStage,
)
from app.models import Order, OrderStatusHistory
from app.repositories import outbox_repository, saga_log_repository
from app.services.settings_service import get_settings_row
from app.time_utils import now_vn

logger = logging.getLogger(__name__)

TICK_SECONDS = 10.0
STUCK_STATUSES = (OrderStatus.PENDING.value, OrderStatus.AWAITING_PAYMENT.value)


def _resend_command(session: Session, order: Order) -> None:
    if order.status == OrderStatus.PENDING.value:
        outbox_repository.add_stock_reserve_requested(session, order)
    else:  # AWAITING_PAYMENT
        outbox_repository.add_payment_create_requested(session, order)
    order.reconciliation_attempts = (order.reconciliation_attempts or 0) + 1
    order.last_reconciliation_attempt_at = now_vn()
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.RECONCILIATION_RESENT,
        messages.SAGA_RECONCILIATION_RESENT.format(n=order.reconciliation_attempts),
        retry_count=order.reconciliation_attempts,
    )


def _exhaust(session: Session, order: Order) -> None:
    order.reconciliation_exhausted = True
    order.last_reconciliation_attempt_at = now_vn()
    if order.status != OrderStatus.CANCELLED.value:
        order.status = OrderStatus.CANCELLED.value
        order.updated_at = now_vn()
        order.status_histories.append(
            OrderStatusHistory(
                order_id=order.id,
                status=OrderStatus.CANCELLED.value,
                changed_by=None,
                note=messages.HISTORY_AUTO_CANCELLED,
                changed_at=now_vn(),
            )
        )
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.RECONCILIATION_EXHAUSTED,
        messages.SAGA_RECONCILIATION_EXHAUSTED,
        level=SagaLogLevel.WARN,
    )
    outbox_repository.add_stock_release_requested(session, order)
    saga_log_repository.add_log(
        session,
        order.id,
        SagaLogStage.STOCK_RELEASE_REQUESTED,
        messages.SAGA_STOCK_RELEASE_REQUESTED,
        target=SagaLogService.PRODUCT_SERVICE,
    )


def run_once(session: Session, now: datetime | None = None) -> int:
    """One reconciliation pass. Returns the number of orders acted on."""
    settings = get_settings_row(session)
    if settings is None:
        return 0
    now = now or now_vn()
    threshold = now - timedelta(minutes=settings.stuck_threshold_minutes)
    acted = 0

    stuck_orders = session.scalars(
        select(Order)
        .where(Order.status.in_(STUCK_STATUSES))
        .where(Order.reconciliation_exhausted.is_(False))
    ).all()
    for order in stuck_orders:
        last_activity = order.last_reconciliation_attempt_at or order.updated_at
        if last_activity >= threshold:
            continue
        if (order.reconciliation_attempts or 0) >= settings.max_attempts:
            _exhaust(session, order)
        else:
            _resend_command(session, order)
        acted += 1

    pending_releases = session.scalars(
        select(Order)
        .where(Order.stock_release_pending.is_(True))
        .where(Order.reconciliation_exhausted.is_(False))
    ).all()
    for order in pending_releases:
        outbox_repository.add_stock_release_requested(session, order)
        saga_log_repository.add_log(
            session,
            order.id,
            SagaLogStage.STOCK_RELEASE_REQUESTED,
            messages.SAGA_STOCK_RELEASE_REQUESTED,
            target=SagaLogService.PRODUCT_SERVICE,
        )
        order.stock_release_pending = False
        order.reconciliation_attempts = (order.reconciliation_attempts or 0) + 1
        order.last_reconciliation_attempt_at = now_vn()
        acted += 1

    session.commit()
    return acted


class ReconciliationJob:
    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory
        self._last_run: datetime | None = None

    def _tick(self) -> None:
        with self._session_factory() as session:
            settings = get_settings_row(session)
            if settings is None:
                return
            now = now_vn()
            if self._last_run is not None:
                elapsed_ms = (now - self._last_run).total_seconds() * 1000
                if elapsed_ms < settings.interval_ms:
                    return
            self._last_run = now
            run_once(session, now)

    async def run_forever(self) -> None:
        while True:
            try:
                await asyncio.to_thread(self._tick)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Reconciliation tick failed")
            await asyncio.sleep(TICK_SECONDS)
