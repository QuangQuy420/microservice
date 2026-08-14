"""Request bodies (pydantic v2).

Fields are declared Optional with `validate_default=True` so that a missing
field runs the same validator as a present-but-invalid one.
Validators raise the exact Vietnamese messages; the RequestValidationError
handler collects them into `validationErrors` (first error per field).
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
            raise ValueError("productId không được để trống")
        return v

    @field_validator("variantId")
    @classmethod
    def _variant_id(cls, v):
        if v is None:
            raise ValueError("variantId không được để trống")
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
            "Tên người nhận không được để trống",
            150,
            "Tên người nhận không được vượt quá 150 ký tự",
        )

    @field_validator("receiverPhone")
    @classmethod
    def _receiver_phone(cls, v):
        if v is None or not v.strip():
            raise ValueError("Số điện thoại không được để trống")
        if not _PHONE_RE.fullmatch(v):
            raise ValueError(messages.PHONE_INVALID)
        return v

    @field_validator("shippingAddress")
    @classmethod
    def _shipping_address(cls, v):
        return _require_text(
            v,
            "Địa chỉ giao hàng không được để trống",
            500,
            "Địa chỉ giao hàng không được vượt quá 500 ký tự",
        )

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        if v is not None and len(v) > 1000:
            raise ValueError("Ghi chú không được vượt quá 1000 ký tự")
        return v

    @field_validator("paymentMethod")
    @classmethod
    def _payment_method(cls, v):
        if v is None or not v.strip():
            raise ValueError("Phương thức thanh toán không được để trống")
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
            "Lý do hủy đơn không được để trống",
            1000,
            "Lý do hủy đơn không được vượt quá 1000 ký tự",
        )


class UpdateOrderStatusRequest(_Request):
    status: str | None = None
    note: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        from app.enums import OrderStatus

        if v is None or v not in {s.value for s in OrderStatus}:
            raise ValueError("Trạng thái đơn hàng không hợp lệ")
        return v

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        if v is not None and len(v) > 1000:
            raise ValueError("Ghi chú không được vượt quá 1000 ký tự")
        return v


class UpdateSagaSettingsRequest(_Request):
    intervalMs: int | None = None
    stuckThresholdMinutes: int | None = None
    maxAttempts: int | None = None

    @field_validator("intervalMs")
    @classmethod
    def _interval(cls, v):
        if v is None or v < 10000:
            raise ValueError("Chu kỳ chạy phải tối thiểu 10000 ms")
        return v

    @field_validator("stuckThresholdMinutes")
    @classmethod
    def _threshold(cls, v):
        if v is None or v < 1:
            raise ValueError("Ngưỡng phát hiện đơn kẹt phải tối thiểu 1 phút")
        return v

    @field_validator("maxAttempts")
    @classmethod
    def _max_attempts(cls, v):
        if v is None or v < 1 or v > 20:
            raise ValueError("Số lần thử tối đa phải từ 1 đến 20")
        return v
