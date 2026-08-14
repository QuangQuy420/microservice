"""Transactional outbox writes + saga event payload builders.

Events are appended to `outbox_events` inside the caller's open DB session, so
they commit (or roll back) atomically with the order change. The background
relay (`app.messaging.outbox_relay`) publishes them to RabbitMQ.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.json_utils import dumps
from app.models import Order, OutboxEvent
from app.time_utils import now_vn

STOCK_RESERVE_REQUESTED = "stock.reserve.requested"
STOCK_RELEASE_REQUESTED = "stock.release.requested"
PAYMENT_CREATE_REQUESTED = "payment.create.requested"


def _items_payload(order: Order) -> list[dict]:
    return [
        {"variantId": str(item.variant_id), "quantity": item.quantity}
        for item in order.items
    ]


def add_event(session: Session, order_id, routing_key: str, payload: dict) -> OutboxEvent:
    event = OutboxEvent(
        order_id=order_id,
        routing_key=routing_key,
        payload=dumps(payload),
        created_at=now_vn(),
    )
    session.add(event)
    return event


def add_stock_reserve_requested(session: Session, order: Order) -> OutboxEvent:
    return add_event(
        session,
        order.id,
        STOCK_RESERVE_REQUESTED,
        {
            "orderId": str(order.id),
            "occurredAt": now_vn().isoformat(),
            "items": _items_payload(order),
        },
    )


def add_stock_release_requested(session: Session, order: Order) -> OutboxEvent:
    return add_event(
        session,
        order.id,
        STOCK_RELEASE_REQUESTED,
        {
            "orderId": str(order.id),
            "occurredAt": now_vn().isoformat(),
            "items": _items_payload(order),
        },
    )


def add_payment_create_requested(session: Session, order: Order) -> OutboxEvent:
    return add_event(
        session,
        order.id,
        PAYMENT_CREATE_REQUESTED,
        {
            "orderId": str(order.id),
            "occurredAt": now_vn().isoformat(),
            "userId": str(order.user_id),
            "orderCode": order.order_code,
            "amount": Decimal(order.total_amount),
            "paymentMethod": order.payment_method,
        },
    )


def fetch_due_events(session: Session, now: datetime, limit: int = 50) -> Sequence[OutboxEvent]:
    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.published_at.is_(None))
        .where(
            (OutboxEvent.next_attempt_at.is_(None))
            | (OutboxEvent.next_attempt_at <= now)
        )
        .order_by(OutboxEvent.created_at)
        .limit(limit)
    )
    return session.scalars(stmt).all()
