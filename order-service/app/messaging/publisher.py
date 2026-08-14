"""aio-pika publisher for the `order-saga-events` topic exchange."""
from __future__ import annotations

import logging

import aio_pika

from app.messaging import topology

logger = logging.getLogger(__name__)


class RabbitMqPublisher:
    def __init__(self, url: str):
        self._url = url
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._channel: aio_pika.abc.AbstractChannel | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def connect(self) -> None:
        self._connection = await aio_pika.connect_robust(self._url)
        self._channel = await self._connection.channel()
        self._exchange = await self._channel.declare_exchange(
            topology.EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
        )

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()

    async def publish(self, routing_key: str, body: str) -> None:
        if self._exchange is None:
            raise RuntimeError("RabbitMQ publisher is not connected")
        await self._exchange.publish(
            aio_pika.Message(
                body=body.encode("utf-8"),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=routing_key,
        )
