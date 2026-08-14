"""aio-pika consumers: the saga reply queue and the dead-letter queue.

Queue `order-saga-events.order-service` is a durable quorum queue with
`x-dead-letter-exchange: order-saga-events.dlx` and
`x-delivery-limit: ${SAGA_QUEUE_DELIVERY_LIMIT}`. Bindings: stock.reserved,
stock.reserve.rejected, payment.completed, payment.failed.

Handlers are idempotent via order-status guards (see app.services.saga_events).
SAGA_CHAOS_MODE=FORCE_DEAD_LETTER makes every handler raise so the broker
redelivers until the delivery limit routes the message to the DLQ.
"""
from __future__ import annotations

import asyncio
import json
import logging

import aio_pika
from sqlalchemy.orm import Session, sessionmaker

from app.messaging import topology
from app.repositories.cart_repository import CartRepository
from app.services import saga_events

logger = logging.getLogger(__name__)


class SagaConsumer:
    def __init__(
        self,
        url: str,
        session_factory: sessionmaker[Session],
        cart_repo: CartRepository,
        delivery_limit: int = 10,
        chaos_mode: str = "NONE",
    ):
        self._url = url
        self._session_factory = session_factory
        self._cart_repo = cart_repo
        self._delivery_limit = delivery_limit
        self._chaos_mode = chaos_mode
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None

    async def start(self) -> None:
        self._connection = await aio_pika.connect_robust(self._url)
        channel = await self._connection.channel()
        await channel.set_qos(prefetch_count=1)

        exchange = await channel.declare_exchange(
            topology.EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
        )
        dlx = await channel.declare_exchange(
            topology.DLX, aio_pika.ExchangeType.FANOUT, durable=True
        )
        queue = await channel.declare_queue(
            topology.QUEUE,
            durable=True,
            arguments={
                "x-queue-type": "quorum",
                "x-dead-letter-exchange": topology.DLX,
                "x-delivery-limit": self._delivery_limit,
            },
        )
        for key in topology.CONSUMED_KEYS:
            await queue.bind(exchange, key)
        await queue.consume(self._on_message)

        # DLQ — owned/declared by order-service, consumed here for audit logs.
        dlq = await channel.declare_queue(topology.DLQ, durable=True)
        await dlq.bind(dlx)
        await dlq.consume(self._on_dead_letter)
        logger.info("Saga consumer started (queue=%s)", topology.QUEUE)

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()

    # ---------- main queue ----------

    async def _on_message(self, message: aio_pika.abc.AbstractIncomingMessage) -> None:
        routing_key = message.routing_key or ""
        try:
            payload = json.loads(message.body.decode("utf-8"))
            if not isinstance(payload, dict) or not payload.get("orderId"):
                raise ValueError("missing orderId")
        except Exception:
            logger.error(
                "Dropping malformed %s message — nacking without requeue", routing_key
            )
            await message.nack(requeue=False)
            return

        try:
            if self._chaos_mode == "FORCE_DEAD_LETTER":
                raise RuntimeError(
                    "SAGA_CHAOS_MODE=FORCE_DEAD_LETTER — simulated consumer failure"
                )
            await asyncio.to_thread(self._dispatch, routing_key, payload)
            await message.ack()
        except Exception:
            logger.exception(
                "Failed to handle %s message — nacking for redelivery", routing_key
            )
            await message.nack(requeue=True)

    def _dispatch(self, routing_key: str, payload: dict) -> None:
        order_id = payload.get("orderId")
        with self._session_factory() as session:
            if routing_key == topology.STOCK_RESERVED:
                saga_events.handle_stock_reserved(session, order_id)
            elif routing_key == topology.STOCK_RESERVE_REJECTED:
                saga_events.handle_stock_reserve_rejected(
                    session, order_id, payload.get("reason")
                )
            elif routing_key == topology.PAYMENT_COMPLETED:
                saga_events.handle_payment_completed(
                    session,
                    self._cart_repo,
                    order_id,
                    payload.get("paymentId"),
                    payload.get("transactionCode"),
                )
            elif routing_key == topology.PAYMENT_FAILED:
                saga_events.handle_payment_failed(session, order_id, payload.get("reason"))
            else:
                logger.warning("Ignoring unexpected routing key %r", routing_key)

    # ---------- dead-letter queue ----------

    async def _on_dead_letter(
        self, message: aio_pika.abc.AbstractIncomingMessage
    ) -> None:
        try:
            headers = message.headers or {}
            deaths = headers.get("x-death") or []
            routing_key = message.routing_key or ""
            count = self._delivery_limit
            if deaths:
                first = deaths[0]
                keys = first.get("routing-keys") or []
                if keys:
                    routing_key = str(keys[0])
                raw_count = first.get("count")
                if raw_count is not None:
                    count = int(raw_count)
            logger.warning(
                "Dead-lettered saga message: routing_key=%s redelivered=%s",
                routing_key,
                count,
            )
            order_id = None
            try:
                body = json.loads(message.body.decode("utf-8"))
                if isinstance(body, dict):
                    order_id = body.get("orderId")
            except Exception:
                pass
            # best-effort audit log
            try:
                await asyncio.to_thread(self._record_dead_letter, order_id, routing_key, count)
            except Exception:
                logger.exception("Failed to write DEAD_LETTERED saga log")
        finally:
            await message.ack()

    def _record_dead_letter(self, order_id, routing_key: str, count: int) -> None:
        with self._session_factory() as session:
            saga_events.record_dead_letter(session, order_id, routing_key, count)
