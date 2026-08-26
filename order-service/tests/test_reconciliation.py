from __future__ import annotations

import uuid

from sqlalchemy import select

from app.jobs.reconciliation import run_once
from app.json_utils import loads
from app.models import OrderSagaLog, OutboxEvent
from tests.conftest import create_order, minutes_ago, seed_settings


def _outbox_keys(session):
    return [e.routing_key for e in session.scalars(select(OutboxEvent)).all()]


def _stages(session, order_id):
    return [
        log.stage
        for log in session.scalars(
            select(OrderSagaLog)
            .where(OrderSagaLog.order_id == order_id)
            .order_by(OrderSagaLog.occurred_at)
        ).all()
    ]


class TestStuckOrderResend:
    def test_no_settings_row_does_nothing(self, session):
        create_order(session, status="PENDING", updated_at=minutes_ago(30))
        assert run_once(session) == 0

    def test_stuck_pending_resends_stock_reserve(self, session):
        seed_settings(session, stuck_threshold_minutes=2, max_attempts=3)
        vid = uuid.uuid4()
        order = create_order(
            session,
            status="PENDING",
            updated_at=minutes_ago(10),
            items=[(vid, 2, "100000.00")],
        )
        acted = run_once(session)
        assert acted == 1
        session.refresh(order)
        assert order.reconciliation_attempts == 1
        assert order.last_reconciliation_attempt_at is not None
        assert _outbox_keys(session) == ["stock.reserve.requested"]
        logs = session.scalars(select(OrderSagaLog)).all()
        assert logs[0].stage == "RECONCILIATION_RESENT"
        assert logs[0].message == "Saga command resent (attempt 1)"
        assert logs[0].retry_count == 1

    def test_stuck_awaiting_payment_resends_payment_create(self, session):
        seed_settings(session)
        order = create_order(
            session, status="AWAITING_PAYMENT", updated_at=minutes_ago(10), total="99000.00"
        )
        run_once(session)
        events = session.scalars(select(OutboxEvent)).all()
        assert [e.routing_key for e in events] == ["payment.create.requested"]
        payload = loads(events[0].payload)
        assert payload["orderCode"] == order.order_code
        assert payload["amount"] == 99000.00
        assert payload["paymentMethod"] == "CARD"

    def test_fresh_orders_are_not_touched(self, session):
        seed_settings(session, stuck_threshold_minutes=2)
        create_order(session, status="PENDING", updated_at=minutes_ago(1))
        assert run_once(session) == 0
        assert _outbox_keys(session) == []

    def test_non_stuck_statuses_ignored(self, session):
        seed_settings(session)
        for status in ["CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"]:
            create_order(session, status=status, updated_at=minutes_ago(60))
        assert run_once(session) == 0

    def test_exhausted_orders_skipped(self, session):
        seed_settings(session)
        create_order(
            session,
            status="PENDING",
            updated_at=minutes_ago(60),
            reconciliation_exhausted=True,
        )
        assert run_once(session) == 0

    def test_last_attempt_at_takes_precedence_over_updated_at(self, session):
        seed_settings(session, stuck_threshold_minutes=2)
        order = create_order(session, status="PENDING", updated_at=minutes_ago(60))
        order.last_reconciliation_attempt_at = minutes_ago(1)  # just retried
        session.commit()
        assert run_once(session) == 0


class TestExhaustion:
    def test_exhaust_cancels_and_releases(self, session):
        seed_settings(session, max_attempts=3)
        vid = uuid.uuid4()
        order = create_order(
            session,
            status="PENDING",
            updated_at=minutes_ago(30),
            reconciliation_attempts=3,
            items=[(vid, 1, "50000.00")],
        )
        order.last_reconciliation_attempt_at = minutes_ago(10)
        session.commit()

        run_once(session)
        session.refresh(order)
        assert order.reconciliation_exhausted is True
        assert order.status == "CANCELLED"
        assert (
            order.status_histories[-1].note
            == "Auto-cancelled: exceeded the automatic saga retry limit"
        )
        assert _outbox_keys(session) == ["stock.release.requested"]
        stages = _stages(session, order.id)
        assert stages == ["RECONCILIATION_EXHAUSTED", "STOCK_RELEASE_REQUESTED"]
        warn = session.scalars(
            select(OrderSagaLog).where(OrderSagaLog.stage == "RECONCILIATION_EXHAUSTED")
        ).one()
        assert warn.level == "WARN"

    def test_exhausted_order_not_reprocessed(self, session):
        seed_settings(session, max_attempts=3)
        order = create_order(
            session,
            status="PENDING",
            updated_at=minutes_ago(30),
            reconciliation_attempts=3,
        )
        order.last_reconciliation_attempt_at = minutes_ago(10)
        session.commit()
        run_once(session)
        assert run_once(session) == 0  # second pass: nothing left to do


class TestPendingStockRelease:
    def test_legacy_flag_republishes_release_and_clears(self, session):
        seed_settings(session)
        order = create_order(session, status="CANCELLED", stock_release_pending=True)
        acted = run_once(session)
        assert acted == 1
        session.refresh(order)
        assert order.stock_release_pending is False
        assert _outbox_keys(session) == ["stock.release.requested"]
        assert _stages(session, order.id) == ["STOCK_RELEASE_REQUESTED"]
