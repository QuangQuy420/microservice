from __future__ import annotations

import re
import uuid
from decimal import Decimal

from sqlalchemy import select

from app.models import Order, OrderSagaLog, OutboxEvent
from app.json_utils import loads
from tests.conftest import add_cart, cart_item, make_product, make_variant

USER = str(uuid.uuid4())


def _body(variant_ids, **overrides):
    body = {
        "receiverName": "Nguyễn Văn A",
        "receiverPhone": "0912345678",
        "shippingAddress": "1 Lê Lợi, Q1, TP.HCM",
        "note": "Giao giờ hành chính",
        "paymentMethod": "CARD",
        "variantIds": [str(v) for v in variant_ids],
    }
    body.update(overrides)
    return body


def _setup_cart(cart_repo, product_client, *, quantity=2, base="100000.00", extra="20000.00"):
    variant = make_variant(extra_price=extra, stock=50)
    product = make_product(base_price=base, variants=[variant])
    product_client.register(product)
    add_cart(
        cart_repo,
        USER,
        [cart_item(product["id"], variant["id"], quantity=quantity, base_price=base, extra_price=extra)],
    )
    return product, variant


class TestCheckoutHappyPath:
    def test_response_shape_and_totals(self, client, cart_repo, product_client):
        product, variant = _setup_cart(cart_repo, product_client)
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([variant["id"]]))
        assert res.status_code == 201
        body = res.json()["data"]
        assert re.fullmatch(r"ORD-\d{13}-[0-9A-F]{6}", body["orderCode"])
        assert body["orderStatus"] == "PENDING"
        assert body["paymentId"] is None
        assert body["paymentStatus"] == "UNPAID"
        assert body["paymentUrl"] is None
        assert body["totalAmount"] == 240000.00

    def test_order_persisted_with_items_history_and_saga_logs(
        self, client, cart_repo, product_client, session
    ):
        product, variant = _setup_cart(cart_repo, product_client)
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([variant["id"]]))
        order_id = uuid.UUID(res.json()["data"]["orderId"])

        order = session.get(Order, order_id)
        assert order.status == "PENDING"
        assert order.payment_status == "UNPAID"
        assert order.payment_method == "CARD"
        assert order.user_id == uuid.UUID(USER)
        assert order.total_amount == Decimal("240000.00")
        assert len(order.items) == 1
        item = order.items[0]
        assert item.unit_price == Decimal("120000.00")
        assert item.quantity == 2
        assert item.subtotal == Decimal("240000.00")
        # image comes from the cart snapshot, not re-derived
        assert item.product_image_url == "http://img/from-cart.jpg"

        assert len(order.status_histories) == 1
        assert order.status_histories[0].status == "PENDING"
        assert order.status_histories[0].note == "Order created"

        logs = session.scalars(
            select(OrderSagaLog).where(OrderSagaLog.order_id == order_id)
        ).all()
        stages = [log.stage for log in logs]
        assert stages == ["CREATED", "STOCK_RESERVE_REQUESTED"]
        reserve_log = logs[1]
        assert reserve_log.message == "Stock reservation requested"
        assert reserve_log.target_service == "PRODUCT_SERVICE"

    def test_outbox_event_written_in_same_transaction(
        self, client, cart_repo, product_client, session
    ):
        product, variant = _setup_cart(cart_repo, product_client)
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([variant["id"]]))
        order_id = res.json()["data"]["orderId"]

        events = session.scalars(select(OutboxEvent)).all()
        assert len(events) == 1
        event = events[0]
        assert event.routing_key == "stock.reserve.requested"
        assert event.published_at is None
        payload = loads(event.payload)
        assert payload["orderId"] == order_id
        assert payload["items"] == [{"variantId": variant["id"], "quantity": 2}]
        assert "occurredAt" in payload

    def test_live_price_is_used_not_cart_price(self, client, cart_repo, product_client):
        # cart snapshot says 100000+20000, live product now says 150000+20000
        product, variant = _setup_cart(cart_repo, product_client)
        product["basePrice"] = Decimal("150000.00")
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([variant["id"]]))
        assert res.json()["data"]["totalAmount"] == 340000.00  # (150000+20000)*2

    def test_cart_is_not_cleared_at_checkout(self, client, cart_repo, product_client):
        product, variant = _setup_cart(cart_repo, product_client)
        client.post(f"/api/v1/users/{USER}/checkout", json=_body([variant["id"]]))
        cart = cart_repo.load(USER)
        assert cart is not None
        assert len(cart["items"]) == 1

    def test_partial_checkout_only_selected_variants(
        self, client, cart_repo, product_client, session
    ):
        v1 = make_variant(extra_price="0.00", stock=50)
        v2 = make_variant(extra_price="0.00", stock=50)
        p1 = product_client.register(make_product(base_price="100000.00", variants=[v1]))
        p2 = product_client.register(make_product(base_price="50000.00", variants=[v2]))
        add_cart(
            cart_repo,
            USER,
            [
                cart_item(p1["id"], v1["id"], quantity=1, base_price="100000.00"),
                cart_item(p2["id"], v2["id"], quantity=3, base_price="50000.00"),
            ],
        )
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([v2["id"]]))
        assert res.status_code == 201
        assert res.json()["data"]["totalAmount"] == 150000.00
        order = session.get(Order, uuid.UUID(res.json()["data"]["orderId"]))
        assert len(order.items) == 1
        assert str(order.items[0].variant_id) == v2["id"]

    def test_money_serialized_as_exact_json_number(self, client, cart_repo, product_client):
        product, variant = _setup_cart(cart_repo, product_client, base="123456.78", extra="0.00", quantity=1)
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([variant["id"]]))
        assert '"totalAmount": 123456.78' in res.text


class TestCheckoutErrors:
    def test_missing_cart_gives_404(self, client):
        res = client.post(
            f"/api/v1/users/{USER}/checkout", json=_body([str(uuid.uuid4())])
        )
        assert res.status_code == 404
        assert res.json()["error"] == {
            "code": "CART_EMPTY",
            "message": "Cart does not exist or is empty",
        }

    def test_selected_variant_not_in_cart(self, client, cart_repo, product_client):
        product, variant = _setup_cart(cart_repo, product_client)
        res = client.post(
            f"/api/v1/users/{USER}/checkout", json=_body([str(uuid.uuid4())])
        )
        assert res.status_code == 400
        assert res.json()["error"] == {
            "code": "CHECKOUT_ITEMS_NOT_IN_CART",
            "message": "Some selected products are not in the cart",
        }

    def test_empty_variant_ids(self, client):
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([]))
        assert res.status_code == 422
        error = res.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["details"]["variantIds"] == [
            "Select at least 1 product to check out"
        ]

    def test_invalid_phone(self, client):
        for phone in ["12345", "abc", "84912345678", "091234567", "+8491234567890"]:
            res = client.post(
                f"/api/v1/users/{USER}/checkout",
                json=_body([str(uuid.uuid4())], receiverPhone=phone),
            )
            assert res.status_code == 422
            details = res.json()["error"]["details"]
            assert details["receiverPhone"] == ["Phone number is invalid"]

    def test_valid_phone_formats_pass_validation(self, client, cart_repo, product_client):
        product, variant = _setup_cart(cart_repo, product_client)
        for phone in ["0912345678", "+84912345678", "09123456789"]:
            res = client.post(
                f"/api/v1/users/{USER}/checkout",
                json=_body([variant["id"]], receiverPhone=phone),
            )
            assert res.status_code == 201

    def test_receiver_name_required(self, client):
        res = client.post(
            f"/api/v1/users/{USER}/checkout",
            json=_body([str(uuid.uuid4())], receiverName="  "),
        )
        assert res.status_code == 422
        assert res.json()["error"]["details"]["receiverName"] == [
            "Receiver name is required"
        ]

    def test_receiver_name_max_150(self, client):
        res = client.post(
            f"/api/v1/users/{USER}/checkout",
            json=_body([str(uuid.uuid4())], receiverName="x" * 151),
        )
        assert res.status_code == 422
        assert res.json()["error"]["details"]["receiverName"] == [
            "Receiver name must not exceed 150 characters"
        ]

    def test_product_gone_at_checkout_gives_404(self, client, cart_repo, product_client):
        variant = make_variant()
        product = make_product(variants=[variant])
        # product NOT registered in the fake client → live re-fetch 404s
        add_cart(cart_repo, USER, [cart_item(product["id"], variant["id"])])
        res = client.post(f"/api/v1/users/{USER}/checkout", json=_body([variant["id"]]))
        assert res.status_code == 404
        assert res.json()["error"] == {
            "code": "PRODUCT_NOT_FOUND",
            "message": f"Product not found: {product['id']}",
        }
