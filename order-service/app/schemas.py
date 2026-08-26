"""Request bodies (pydantic v2).

Fields are declared Optional with `validate_default=True` so that a missing
field runs the same validator as a present-but-invalid one.
Validators raise the exact English messages; the RequestValidationError
handler collects them into `error.details` (all errors per field).
"""
from __future__ import annotations

import re
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app import messages

_PHONE_RE = re.compile(r"^(0|\+84)[0-9]{9,10}$")


class _Request(BaseModel):
    model_config = ConfigDict(validate_default=True)


def _require_text(value: str | None, message: str, max_len: int, max_message: str) -> str:
    if value is None or not value.strip():
        raise ValueError(message)
    if len(value) > max_len:
        raise ValueError(max_message)
    return value


class AddCartItemRequest(_Request):
    productId: UUID | None = None
    variantId: UUID | None = None
    quantity: int | None = None

    @field_validator("productId")
    @classmethod
    def _product_id(cls, v):
        if v is None:
            raise ValueError("productId is required")
        return v

    @field_validator("variantId")
    @classmethod
    def _variant_id(cls, v):
        if v is None:
            raise ValueError("variantId is required")
        return v

    @field_validator("quantity")
    @classmethod
    def _quantity(cls, v):
        if v is None or v < 1:
            raise ValueError(messages.QUANTITY_BOUNDS)
        return v


class UpdateCartItemRequest(_Request):
    quantity: int | None = None

    @field_validator("quantity")
    @classmethod
    def _quantity(cls, v):
        if v is None or v < 1:
            raise ValueError(messages.QUANTITY_BOUNDS)
        return v


class CheckoutRequest(_Request):
    receiverName: str | None = None
    receiverPhone: str | None = None
    shippingAddress: str | None = None
    note: str | None = None
    paymentMethod: str | None = None
    variantIds: list[UUID] | None = None

    @field_validator("receiverName")
    @classmethod
    def _receiver_name(cls, v):
        return _require_text(
            v,
            "Receiver name is required",
            150,
            "Receiver name must not exceed 150 characters",
        )

    @field_validator("receiverPhone")
    @classmethod
    def _receiver_phone(cls, v):
        if v is None or not v.strip():
            raise ValueError("Phone number is required")
        if not _PHONE_RE.fullmatch(v):
            raise ValueError(messages.PHONE_INVALID)
        return v

    @field_validator("shippingAddress")
    @classmethod
    def _shipping_address(cls, v):
        return _require_text(
            v,
            "Shipping address is required",
            500,
            "Shipping address must not exceed 500 characters",
        )

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        if v is not None and len(v) > 1000:
            raise ValueError("Note must not exceed 1000 characters")
        return v

    @field_validator("paymentMethod")
    @classmethod
    def _payment_method(cls, v):
        if v is None or not v.strip():
            raise ValueError("Payment method is required")
        return v

    @field_validator("variantIds")
    @classmethod
    def _variant_ids(cls, v):
        if not v:
            raise ValueError(messages.VARIANT_IDS_EMPTY)
        return v


class CancelOrderRequest(_Request):
    reason: str | None = None

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        return _require_text(
            v,
            "Cancellation reason is required",
            1000,
            "Cancellation reason must not exceed 1000 characters",
        )


class UpdateOrderStatusRequest(_Request):
    status: str | None = None
    note: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        from app.enums import OrderStatus

        if v is None or v not in {s.value for s in OrderStatus}:
            raise ValueError(messages.ORDER_STATUS_INVALID)
        return v

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        if v is not None and len(v) > 1000:
            raise ValueError("Note must not exceed 1000 characters")
        return v


class UpdateSagaSettingsRequest(_Request):
    intervalMs: int | None = None
    stuckThresholdMinutes: int | None = None
    maxAttempts: int | None = None

    @field_validator("intervalMs")
    @classmethod
    def _interval(cls, v):
        if v is None or v < 10000:
            raise ValueError("Interval must be at least 10000 ms")
        return v

    @field_validator("stuckThresholdMinutes")
    @classmethod
    def _threshold(cls, v):
        if v is None or v < 1:
            raise ValueError("Stuck-order threshold must be at least 1 minute")
        return v

    @field_validator("maxAttempts")
    @classmethod
    def _max_attempts(cls, v):
        if v is None or v < 1 or v > 20:
            raise ValueError("Max attempts must be between 1 and 20")
        return v
