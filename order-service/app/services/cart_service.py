"""Cart business logic (Redis-backed, product data fetched live)."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from app import messages
from app.errors import BadRequestError, NotFoundError
from app.repositories.cart_repository import CartRepository
from app.services.product_client import ProductClient
from app.time_utils import now_vn

MIN_QUANTITY = 1
MAX_QUANTITY = 99


def select_image_url(product: dict, variant_id: str) -> str | None:
    """5-step priority chain:
    1. image of this variant with isThumbnail
    2. image of this variant with lowest sortOrder (null sorts last)
    3. any isThumbnail image
    4. first image
    5. None
    """
    images = product.get("images") or []
    variant_images = [img for img in images if str(img.get("variantId")) == str(variant_id)]

    for img in variant_images:
        if img.get("isThumbnail"):
            return img.get("imageUrl")
    if variant_images:
        best = min(
            variant_images,
            key=lambda img: (img.get("sortOrder") is None, img.get("sortOrder") or 0),
        )
        return best.get("imageUrl")
    for img in images:
        if img.get("isThumbnail"):
            return img.get("imageUrl")
    if images:
        return images[0].get("imageUrl")
    return None


def _as_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _find_variant(product: dict, variant_id: str) -> dict:
    variants = product.get("variants")
    if not variants:
        raise NotFoundError(messages.PRODUCT_NO_VARIANTS, code="PRODUCT_NO_VARIANTS")
    for variant in variants:
        if str(variant.get("id")) == str(variant_id):
            return variant
    raise NotFoundError(messages.VARIANT_NOT_FOUND, code="VARIANT_NOT_FOUND")


def _validate_product(product: dict) -> Decimal:
    """Returns basePrice as Decimal after PUBLISHED/price validation."""
    if product.get("status") != "PUBLISHED":
        raise BadRequestError(messages.PRODUCT_NOT_PURCHASABLE, code="PRODUCT_NOT_PURCHASABLE")
    base_price = product.get("basePrice")
    if base_price is None:
        raise BadRequestError(messages.PRODUCT_NO_PRICE, code="PRODUCT_NO_PRICE")
    base = _as_decimal(base_price)
    if base < 0:
        raise BadRequestError(messages.PRODUCT_INVALID_PRICE, code="PRODUCT_INVALID_PRICE")
    return base


def _validate_quantity(quantity: int, stock: int) -> None:
    if quantity < MIN_QUANTITY or quantity > MAX_QUANTITY:
        raise BadRequestError(messages.QUANTITY_BOUNDS, code="QUANTITY_OUT_OF_BOUNDS")
    if quantity > stock:
        raise BadRequestError(messages.STOCK_LEFT.format(n=stock), code="INSUFFICIENT_STOCK")


def _build_item_snapshot(
    product: dict, variant: dict, product_id: str, variant_id: str, quantity: int
) -> dict:
    base = _validate_product(product)
    extra = _as_decimal(variant.get("extraPrice") or 0)
    unit_price = base + extra
    if unit_price < 0:
        raise BadRequestError(messages.PRODUCT_INVALID_PRICE, code="PRODUCT_INVALID_PRICE")
    return {
        "productId": str(product_id),
        "variantId": str(variant_id),
        "productName": product.get("name"),
        "skuVariant": variant.get("skuVariant"),
        "color": variant.get("color"),
        "colorHex": variant.get("colorHex"),
        "size": variant.get("size"),
        "productImageUrl": select_image_url(product, variant_id),
        "basePrice": base,
        "extraPrice": extra,
        "unitPrice": unit_price,
        "quantity": quantity,
    }


def _empty_cart(user_id: str) -> dict:
    now = now_vn().isoformat()
    return {"userId": str(user_id), "items": [], "createdAt": now, "updatedAt": now}


def to_cart_response(user_id: str, cart: dict | None) -> dict:
    cart = cart or _empty_cart(user_id)
    items = []
    total_quantity = 0
    total_amount = Decimal("0")
    for item in cart.get("items", []):
        unit_price = _as_decimal(item.get("unitPrice") or 0)
        quantity = int(item.get("quantity") or 0)
        subtotal = unit_price * quantity
        total_quantity += quantity
        total_amount += subtotal
        items.append(
            {
                "productId": item.get("productId"),
                "variantId": item.get("variantId"),
                "productName": item.get("productName"),
                "skuVariant": item.get("skuVariant"),
                "color": item.get("color"),
                "colorHex": item.get("colorHex"),
                "size": item.get("size"),
                "productImageUrl": item.get("productImageUrl"),
                "basePrice": _as_decimal(item.get("basePrice") or 0),
                "extraPrice": _as_decimal(item.get("extraPrice") or 0),
                "unitPrice": unit_price,
                "quantity": quantity,
                "subtotal": subtotal,
            }
        )
    return {
        "userId": cart.get("userId", str(user_id)),
        "items": items,
        "totalQuantity": total_quantity,
        "totalAmount": total_amount,
        "createdAt": cart.get("createdAt"),
        "updatedAt": cart.get("updatedAt"),
    }


class CartService:
    def __init__(self, cart_repo: CartRepository, product_client: ProductClient):
        self._carts = cart_repo
        self._products = product_client

    def get_cart(self, user_id: str) -> dict:
        return to_cart_response(user_id, self._carts.load(user_id))

    def add_item(self, user_id: str, product_id: str, variant_id: str, quantity: int) -> dict:
        product = self._products.get_product(str(product_id))
        variant = _find_variant(product, variant_id)
        stock = int(variant.get("stock") or 0)

        cart = self._carts.load(user_id) or _empty_cart(user_id)
        existing = next(
            (i for i in cart["items"] if str(i.get("variantId")) == str(variant_id)), None
        )
        new_quantity = quantity + (int(existing["quantity"]) if existing else 0)
        _validate_quantity(new_quantity, stock)

        snapshot = _build_item_snapshot(product, variant, product_id, variant_id, new_quantity)
        if existing:
            existing.update(snapshot)
        else:
            cart["items"].append(snapshot)

        cart["updatedAt"] = now_vn().isoformat()
        self._carts.save(user_id, cart)
        return to_cart_response(user_id, cart)

    def update_item(self, user_id: str, variant_id: str, quantity: int) -> dict:
        cart = self._carts.load(user_id)
        if cart is None or not cart.get("items"):
            raise NotFoundError(messages.CART_NOT_FOUND, code="CART_EMPTY")
        existing = next(
            (i for i in cart["items"] if str(i.get("variantId")) == str(variant_id)), None
        )
        if existing is None:
            raise NotFoundError(messages.CART_VARIANT_NOT_FOUND, code="CART_VARIANT_NOT_FOUND")

        product = self._products.get_product(str(existing["productId"]))
        variant = _find_variant(product, variant_id)
        stock = int(variant.get("stock") or 0)
        _validate_quantity(quantity, stock)

        snapshot = _build_item_snapshot(
            product, variant, existing["productId"], variant_id, quantity
        )
        existing.update(snapshot)
        cart["updatedAt"] = now_vn().isoformat()
        self._carts.save(user_id, cart)
        return to_cart_response(user_id, cart)

    def remove_item(self, user_id: str, variant_id: str) -> dict:
        cart = self._carts.load(user_id)
        if cart is None or not cart.get("items"):
            raise NotFoundError(messages.CART_NOT_FOUND, code="CART_EMPTY")
        remaining = [
            i for i in cart["items"] if str(i.get("variantId")) != str(variant_id)
        ]
        if len(remaining) == len(cart["items"]):
            raise NotFoundError(messages.CART_VARIANT_NOT_FOUND, code="CART_VARIANT_NOT_FOUND")
        cart["items"] = remaining
        cart["updatedAt"] = now_vn().isoformat()
        if not remaining:
            self._carts.delete(user_id)
        else:
            self._carts.save(user_id, cart)
        return to_cart_response(user_id, cart)

    def clear_cart(self, user_id: str) -> None:
        self._carts.delete(user_id)

    def remove_variants_after_payment(self, user_id: str, variant_ids: list[str]) -> None:
        """Called by the payment.completed consumer — removes only the ordered
        variants from the cart; deletes the key if the cart empties. Best-effort."""
        cart = self._carts.load(user_id)
        if cart is None:
            return
        wanted = {str(v) for v in variant_ids}
        remaining = [i for i in cart.get("items", []) if str(i.get("variantId")) not in wanted]
        if len(remaining) == len(cart.get("items", [])):
            return
        if not remaining:
            self._carts.delete(user_id)
            return
        cart["items"] = remaining
        cart["updatedAt"] = now_vn().isoformat()
        self._carts.save(user_id, cart)
