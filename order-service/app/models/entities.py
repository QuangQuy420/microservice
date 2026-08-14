from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.time_utils import now_vn


class Base(DeclarativeBase):
    pass


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(19, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    payment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    transaction_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(30), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(30), nullable=False, default="UNPAID")
    receiver_name: Mapped[str] = mapped_column(String(150), nullable=False)
    receiver_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    shipping_address: Mapped[str] = mapped_column(String(500), nullable=False)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=now_vn)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_vn, onupdate=now_vn
    )
    reconciliation_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_reconciliation_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reconciliation_exhausted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stock_release_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    status_histories: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="OrderStatusHistory.changed_at",
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku_variant: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color_hex: Mapped[str | None] = mapped_column(String(7), nullable=True)
    size: Mapped[str | None] = mapped_column(String(100), nullable=True)
    product_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(19, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(19, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_histories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=now_vn)

    order: Mapped[Order] = relationship(back_populates="status_histories")


class OrderSagaLog(Base):
    __tablename__ = "order_saga_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[str] = mapped_column(String(40), nullable=False)
    level: Mapped[str] = mapped_column(String(10), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_service: Mapped[str] = mapped_column(String(20), nullable=False)
    target_service: Mapped[str | None] = mapped_column(String(20), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    retry_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_vn, index=True
    )


class ReconciliationSettings(Base):
    __tablename__ = "reconciliation_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    interval_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    stuck_threshold_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_vn, onupdate=now_vn
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)


class OutboxEvent(Base):
    """Transactional outbox — saga events written in the same transaction as the
    order change, published to RabbitMQ later by the background relay."""

    __tablename__ = "outbox_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    routing_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)  # JSON body, ready to send
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_vn, index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
