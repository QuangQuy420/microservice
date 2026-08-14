from __future__ import annotations

from enum import Enum


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    CONFIRMED = "CONFIRMED"
    PROCESSING = "PROCESSING"
    SHIPPING = "SHIPPING"
    DELIVERED = "DELIVERED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, Enum):
    UNPAID = "UNPAID"
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class SagaLogStage(str, Enum):
    CREATED = "CREATED"
    STOCK_RESERVE_REQUESTED = "STOCK_RESERVE_REQUESTED"
    STOCK_RESERVED = "STOCK_RESERVED"
    STOCK_RESERVE_REJECTED = "STOCK_RESERVE_REJECTED"
    PAYMENT_CREATE_REQUESTED = "PAYMENT_CREATE_REQUESTED"
    PAYMENT_COMPLETED = "PAYMENT_COMPLETED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    STOCK_RELEASE_REQUESTED = "STOCK_RELEASE_REQUESTED"
    RECONCILIATION_RESENT = "RECONCILIATION_RESENT"
    RECONCILIATION_EXHAUSTED = "RECONCILIATION_EXHAUSTED"
    DEAD_LETTERED = "DEAD_LETTERED"


class SagaLogLevel(str, Enum):
    INFO = "INFO"
    WARN = "WARN"


class SagaLogService(str, Enum):
    ORDER_SERVICE = "ORDER_SERVICE"
    PRODUCT_SERVICE = "PRODUCT_SERVICE"
    PAYMENT_SERVICE = "PAYMENT_SERVICE"
    MESSAGE_BROKER = "MESSAGE_BROKER"


# Admin state machine — target statuses allowed from each current status.
# Same-status transitions are always rejected.
STATUS_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING.value: {OrderStatus.AWAITING_PAYMENT.value, OrderStatus.CANCELLED.value},
    OrderStatus.AWAITING_PAYMENT.value: {OrderStatus.CONFIRMED.value, OrderStatus.CANCELLED.value},
    OrderStatus.CONFIRMED.value: {OrderStatus.PROCESSING.value, OrderStatus.CANCELLED.value},
    OrderStatus.PROCESSING.value: {OrderStatus.SHIPPING.value},
    OrderStatus.SHIPPING.value: {OrderStatus.DELIVERED.value},
    OrderStatus.DELIVERED.value: {OrderStatus.COMPLETED.value},
    OrderStatus.COMPLETED.value: set(),
    OrderStatus.CANCELLED.value: set(),
}

# User-cancellable statuses (POST .../cancel)
CANCELLABLE_STATUSES = {
    OrderStatus.PENDING.value,
    OrderStatus.AWAITING_PAYMENT.value,
    OrderStatus.CONFIRMED.value,
}

# Statuses for which cancelling publishes stock.release.requested
# (CONFIRMED means already paid — no refund flow, so no release).
RELEASE_ON_CANCEL_STATUSES = {
    OrderStatus.PENDING.value,
    OrderStatus.AWAITING_PAYMENT.value,
}
