"""Background relay: reads pending `outbox_events` rows and publishes them to
RabbitMQ with retry + exponential backoff.

Chaos modes STUCK_STOCK_RESERVE / STUCK_PAYMENT reproduce the original
publisher behavior: the matching event silently "succeeds" without being sent
(marked published, message lost) so the order gets stuck and the
reconciliation job / dead-letter tooling can be observed.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import Awaitable, Callable

from sqlalchemy.orm import Session, sessionmaker

from app.repositories import outbox_repository
from app.time_utils import now_vn

logger = logging.getLogger(__name__)

MAX_BACKOFF_SECONDS = 60

CHAOS_SKIPPED_KEYS = {
    "STUCK_STOCK_RESERVE": outbox_repository.STOCK_RESERVE_REQUESTED,
    "STUCK_PAYMENT": outbox_repository.PAYMENT_CREATE_REQUESTED,
}


class OutboxRelay:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        publish: Callable[[str, str], Awaitable[None]],
        chaos_mode: str = "NONE",
        poll_interval: float = 1.0,
    ):
        self._session_factory = session_factory
        self._publish = publish
        self._chaos_mode = chaos_mode
        self._poll_interval = poll_interval

    def _fetch_due(self) -> list:
        with self._session_factory() as session:
            rows = outbox_repository.fetch_due_events(session, now_vn())
            return [
                (row.id, row.routing_key, row.payload, row.attempts) for row in rows
            ]

    def _mark_published(self, event_id) -> None:
        with self._session_factory() as session:
            event = session.get(outbox_repository.OutboxEvent, event_id)
            if event is not None:
                event.published_at = now_vn()
                session.commit()

    def _mark_failed(self, event_id, attempts: int) -> None:
        backoff = min(2 ** min(attempts, 10), MAX_BACKOFF_SECONDS)
        with self._session_factory() as session:
            event = session.get(outbox_repository.OutboxEvent, event_id)
            if event is not None:
                event.attempts = attempts + 1
                event.next_attempt_at = now_vn() + timedelta(seconds=backoff)
                session.commit()

    async def process_once(self) -> int:
        """Publish all currently-due events. Returns how many were handled."""
        due = await asyncio.to_thread(self._fetch_due)
        handled = 0
        for event_id, routing_key, payload, attempts in due:
            if CHAOS_SKIPPED_KEYS.get(self._chaos_mode) == routing_key:
                logger.warning(
                    "SAGA_CHAOS_MODE=%s — silently skipping publish of %s",
                    self._chaos_mode,
                    routing_key,
                )
                await asyncio.to_thread(self._mark_published, event_id)
                handled += 1
                continue
            try:
                await self._publish(routing_key, payload)
            except Exception:
                logger.exception(
                    "Failed to publish outbox event %s (%s) — will retry",
                    event_id,
                    routing_key,
                )
                await asyncio.to_thread(self._mark_failed, event_id, attempts)
                continue
            await asyncio.to_thread(self._mark_published, event_id)
            handled += 1
        return handled

    async def run_forever(self) -> None:
        while True:
            try:
                await self.process_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Outbox relay tick failed")
            await asyncio.sleep(self._poll_interval)
