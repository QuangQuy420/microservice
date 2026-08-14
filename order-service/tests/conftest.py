from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app import messages
from app.config import Settings
from app.database import make_sessionmaker
from app.errors import NotFoundError
from app.main import create_app
from app.models import Base, Order, OrderItem, ReconciliationSettings
from app.repositories.cart_repository import CartRepository
from app.time_utils import now_vn


class FakeProductClient:
    """In-memory stand-in for the httpx product-service client."""

    def __init__(self):
        self.products: dict[str, dict] = {}
        self.calls: list[str] = []

    def register(self, product: dict) -> dict:
        self.products[str(product["id"])] = product
        return product

    def get_product(self, product_id: str) -> dict:
        self.calls.append(str(product_id))
        product = self.products.get(str(product_id))
        if product is None:
            raise NotFoundError(messages.PRODUCT_CLIENT_NOT_FOUND.format(id=product_id))
        return product


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(engine):
    return make_sessionmaker(engine)


@pytest.fixture
def session(session_factory):
    s = session_factory()
    yield s
    s.close()


@pytest.fixture
def redis_client():
    return fakeredis.FakeStrictRedis()


@pytest.fixture
def cart_repo(redis_client):
    return CartRepository(redis_client)


@pytest.fixture
def product_client():
    return FakeProductClient()


@pytest.fixture
def app(session_factory, cart_repo, product_client):
    return create_app(
        Settings(),
        sessionmaker=session_factory,
        cart_repo=cart_repo,
        product_client=product_client,
        start_background=False,
    )


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


# ---------- builders ----------


def make_variant(
    variant_id=None,
    *,
    color="Đen",
    color_hex="#000000",
    size="52",
    extra_price="0.00",
    sku_variant="SKU-DEN-52",
    stock=10,
):
    return {
        "id": str(variant_id or uuid.uuid4()),
        "color": color,
        "colorHex": color_hex,
        "size": size,
        "extraPrice": Decimal(extra_price) if extra_price is not None else None,
        "skuVariant": sku_variant,
        "stock": stock,
    }


def make_product(
    product_id=None,
    *,
    name="Gọng kính Ray-Ban RB2140",
    status="PUBLISHED",
    base_price="100000.00",
    variants=None,
    images=None,
):
    return {
        "id": str(product_id or uuid.uuid4()),
        "sku": "SKU-1",
        "name": name,
        "slug": "gong-kinh-ray-ban-rb2140",
        "basePrice": Decimal(base_price) if base_price is not None else None,
        "status": status,
        "brand": {"id": str(uuid.uuid4()), "name": "Ray-Ban"},
        "category": {"id": str(uuid.uuid4()), "name": "Gọng kính"},
        "variants": variants if variants is not None else [make_variant()],
        "images": images or [],
    }


def make_image(variant_id=None, *, url="http://img/x.jpg", thumbnail=False, sort_order=None):
    return {
        "id": str(uuid.uuid4()),
        "variantId": str(variant_id) if variant_id else None,
        "imageUrl": url,
        "isThumbnail": thumbnail,
        "sortOrder": sort_order,
    }


def create_order(
    session,
    *,
    user_id=None,
    status="PENDING",
    payment_status="UNPAID",
    payment_method="CARD",
    total="200000.00",
    items=None,
    created_at=None,
    updated_at=None,
    reconciliation_attempts=0,
    reconciliation_exhausted=False,
    stock_release_pending=False,
) -> Order:
    """items: list of (variant_id, quantity, unit_price_str)."""
    now = now_vn()
    order = Order(
        id=uuid.uuid4(),
        order_code=f"ORD-{int(now.timestamp() * 1000)}-{uuid.uuid4().hex[:6].upper()}",
        user_id=uuid.UUID(str(user_id)) if user_id else uuid.uuid4(),
        total_amount=Decimal(total),
        status=status,
        payment_status=payment_status,
        payment_method=payment_method,
        receiver_name="Nguyễn Văn A",
        receiver_phone="0912345678",
        shipping_address="1 Lê Lợi, Q1, TP.HCM",
        created_at=created_at or now,
        updated_at=updated_at or created_at or now,
        reconciliation_attempts=reconciliation_attempts,
        reconciliation_exhausted=reconciliation_exhausted,
        stock_release_pending=stock_release_pending,
    )
    for variant_id, quantity, unit_price in items or [(uuid.uuid4(), 2, "100000.00")]:
        price = Decimal(unit_price)
        order.items.append(
            OrderItem(
                order_id=order.id,
                product_id=uuid.uuid4(),
                variant_id=uuid.UUID(str(variant_id)),
                product_name="Gọng kính Ray-Ban RB2140",
                sku_variant="SKU-DEN-52",
                color="Đen",
                color_hex="#000000",
                size="52",
                product_image_url="http://img/thumb.jpg",
                unit_price=price,
                quantity=quantity,
                subtotal=price * quantity,
            )
        )
    session.add(order)
    session.commit()
    return order


def seed_settings(
    session, *, interval_ms=60000, stuck_threshold_minutes=2, max_attempts=3
) -> ReconciliationSettings:
    row = ReconciliationSettings(
        interval_ms=interval_ms,
        stuck_threshold_minutes=stuck_threshold_minutes,
        max_attempts=max_attempts,
    )
    session.add(row)
    session.commit()
    return row


def minutes_ago(n: int) -> datetime:
    return now_vn() - timedelta(minutes=n)


def add_cart(cart_repo, user_id, items):
    """items: list of dicts with at least productId/variantId/quantity/unitPrice."""
    now = now_vn().isoformat()
    cart = {"userId": str(user_id), "items": items, "createdAt": now, "updatedAt": now}
    cart_repo.save(str(user_id), cart)
    return cart


def cart_item(
    product_id,
    variant_id,
    *,
    quantity=1,
    base_price="100000.00",
    extra_price="0.00",
    image="http://img/from-cart.jpg",
):
    base = Decimal(base_price)
    extra = Decimal(extra_price)
    return {
        "productId": str(product_id),
        "variantId": str(variant_id),
        "productName": "Gọng kính Ray-Ban RB2140",
        "skuVariant": "SKU-DEN-52",
        "color": "Đen",
        "colorHex": "#000000",
        "size": "52",
        "productImageUrl": image,
        "basePrice": base,
        "extraPrice": extra,
        "unitPrice": base + extra,
        "quantity": quantity,
    }
