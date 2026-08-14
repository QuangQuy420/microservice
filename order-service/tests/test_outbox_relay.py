"""Outbox relay unit tests with a fake publisher — no broker needed."""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import select

from app.messaging.outbox_relay import OutboxRelay
from app.models import OutboxEvent
from app.repositories import outbox_repository
from tests.conftest import create_order


class FakePublisher:
    def __init__(self, fail=False):
        self.fail = fail
        self.published: list[tuple[str, str]] = []

    async def publish(self, routing_key: str, body: str) -> None:
        if self.fail:
            raise ConnectionError("broker down")
        self.published.append((routing_key, body))


def _seed_event(session, routing_key="stock.reserve.requested"):
    order = create_order(session)
    event = outbox_repository.add_event(
        session, order.id, routing_key, {"orderId": str(order.id), "occurredAt": "2026-08-13T10:00:00"}
    )
    session.commit()
    return event


class TestRelay:
    def test_publishes_pending_events_and_marks_published(self, session, session_factory):
        event = _seed_event(session)
        publisher = FakePublisher()
        relay = OutboxRelay(session_factory, publisher.publish)

        handled = asyncio.run(relay.process_once())
        assert handled == 1
        assert len(publisher.published) == 1
        routing_key, body = publisher.published[0]
        assert routing_key == "stock.reserve.requested"
        assert "orderId" in body

        session.expire_all()
        stored = session.get(OutboxEvent, event.id)
        assert stored.published_at is not None

    def test_published_events_are_not_resent(self, session, session_factory):
        _seed_event(session)
        publisher = FakePublisher()
        relay = OutboxRelay(session_factory, publisher.publish)
        asyncio.run(relay.process_once())
        asyncio.run(relay.process_once())
        assert len(publisher.published) == 1

    def test_failure_schedules_retry_with_backoff(self, session, session_factory):
        event = _seed_event(session)
        publisher = FakePublisher(fail=True)
        relay = OutboxRelay(session_factory, publisher.publish)

        handled = asyncio.run(relay.process_once())
        assert handled == 0
        session.expire_all()
        stored = session.get(OutboxEvent, event.id)
        assert stored.published_at is None
        assert stored.attempts == 1
        assert stored.next_attempt_at is not None
        # backed off → not due right now, so a second pass sends nothing
        publisher.fail = False
        asyncio.run(relay.process_once())
        assert publisher.published == []

    def test_recovers_after_backoff(self, session, session_factory):
        event = _seed_event(session)
        publisher = FakePublisher(fail=True)
        relay = OutboxRelay(session_factory, publisher.publish)
        asyncio.run(relay.process_once())

        # simulate the backoff window having passed
        session.expire_all()
        stored = session.get(OutboxEvent, event.id)
        stored.next_attempt_at = None
        session.commit()

        publisher.fail = False
        handled = asyncio.run(relay.process_once())
        assert handled == 1
        session.expire_all()
        assert session.get(OutboxEvent, event.id).published_at is not None

    def test_events_processed_in_creation_order(self, session, session_factory):
        _seed_event(session, "stock.reserve.requested")
        _seed_event(session, "payment.create.requested")
        publisher = FakePublisher()
        relay = OutboxRelay(session_factory, publisher.publish)
        asyncio.run(relay.process_once())
        assert [rk for rk, _ in publisher.published] == [
            "stock.reserve.requested",
            "payment.create.requested",
        ]


class TestChaosModes:
    def test_stuck_stock_reserve_skips_publish_but_marks_published(
        self, session, session_factory
    ):
        event = _seed_event(session, "stock.reserve.requested")
        publisher = FakePublisher()
        relay = OutboxRelay(session_factory, publisher.publish, chaos_mode="STUCK_STOCK_RESERVE")
        asyncio.run(relay.process_once())
        assert publisher.published == []  # message silently lost
        session.expire_all()
        assert session.get(OutboxEvent, event.id).published_at is not None

    def test_stuck_stock_reserve_still_sends_other_keys(self, session, session_factory):
        _seed_event(session, "payment.create.requested")
        publisher = FakePublisher()
        relay = OutboxRelay(session_factory, publisher.publish, chaos_mode="STUCK_STOCK_RESERVE")
        asyncio.run(relay.process_once())
        assert [rk for rk, _ in publisher.published] == ["payment.create.requested"]

    def test_stuck_payment_skips_payment_create(self, session, session_factory):
        _seed_event(session, "payment.create.requested")
        publisher = FakePublisher()
        relay = OutboxRelay(session_factory, publisher.publish, chaos_mode="STUCK_PAYMENT")
        asyncio.run(relay.process_once())
        assert publisher.published == []
