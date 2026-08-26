from __future__ import annotations

import uuid
from decimal import Decimal

import httpx
import pytest
from fastapi.testclient import TestClient

from app import messages
from app.config import Settings
from app.errors import BadGatewayError, NotFoundError
from app.main import create_app
from app.services.product_client import ProductClient

USER = str(uuid.uuid4())


class TestEnvelopeShape:
    def test_404_envelope(self, client):
        res = client.get(f"/api/v1/users/{USER}/orders/{uuid.uuid4()}")
        body = res.json()
        assert set(body.keys()) == {"error"}
        assert set(body["error"].keys()) == {"code", "message"}
        assert body["error"]["code"] == "ORDER_NOT_FOUND"
        assert body["error"]["message"] == "Order not found"

    def test_validation_envelope_all_errors_per_field(self, client):
        res = client.post(
            f"/api/v1/users/{USER}/checkout",
            json={
                "receiverPhone": "xxx",
                "shippingAddress": "1 Le Loi",
                "paymentMethod": "CARD",
                "variantIds": [],
            },
        )
        assert res.status_code == 422
        error = res.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["message"] == "Invalid request data"
        details = error["details"]
        # details values are ALWAYS arrays of strings
        assert all(isinstance(v, list) for v in details.values())
        assert details["receiverPhone"] == ["Phone number is invalid"]
        assert details["variantIds"] == ["Select at least 1 product to check out"]
        assert details["receiverName"] == ["Receiver name is required"]

    def test_malformed_json_body(self, client):
        res = client.post(
            f"/api/v1/users/{USER}/checkout",
            content=b"not-json",
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 400
        error = res.json()["error"]
        assert error["code"] == "MALFORMED_REQUEST"
        assert error["message"] == "Request body is not valid JSON"
        assert "details" not in error

    def test_unknown_route_is_enveloped(self, client):
        res = client.get("/api/v1/does-not-exist")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "NOT_FOUND"


def _product_client_responding(handler) -> ProductClient:
    return ProductClient(
        "http://product-service:3002",
        client=httpx.Client(
            base_url="http://product-service:3002",
            transport=httpx.MockTransport(handler),
        ),
    )


class TestProductClientEnvelope:
    """product-service wraps successes in {"data": ...} — the client unwraps it."""

    def test_success_body_is_unwrapped(self):
        pc = _product_client_responding(
            lambda req: httpx.Response(
                200, json={"data": {"id": "p1", "basePrice": 100000.50, "variants": []}}
            )
        )
        product = pc.get_product("p1")
        assert product["id"] == "p1"
        assert "data" not in product
        # parse_float=Decimal keeps money exact through the unwrap
        assert product["basePrice"] == Decimal("100000.50")

    @pytest.mark.parametrize("body", [{}, {"data": None}, []])
    def test_missing_data_key_maps_to_502(self, body):
        pc = _product_client_responding(lambda req: httpx.Response(200, json=body))
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Product Service returned an empty response"
        assert exc.value.code == "PRODUCT_SERVICE_ERROR"


class TestProductClientErrorMapping:
    def test_404_maps_to_not_found_with_id(self):
        pc = _product_client_responding(lambda req: httpx.Response(404))
        with pytest.raises(NotFoundError) as exc:
            pc.get_product("abc-123")
        assert exc.value.message == "Product not found: abc-123"
        assert exc.value.code == "PRODUCT_NOT_FOUND"

    def test_other_4xx_maps_to_502(self):
        pc = _product_client_responding(lambda req: httpx.Response(403))
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Product Service rejected the request with status 403"
        assert exc.value.code == "PRODUCT_SERVICE_ERROR"

    def test_5xx_maps_to_502(self):
        pc = _product_client_responding(lambda req: httpx.Response(500))
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Product Service returned an error"

    def test_empty_body_maps_to_502(self):
        pc = _product_client_responding(lambda req: httpx.Response(200, content=b""))
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Product Service returned an empty response"

    def test_connect_failure_maps_to_502(self):
        def handler(request):
            raise httpx.ConnectError("connection refused")

        pc = _product_client_responding(handler)
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Cannot connect to Product Service"
        assert exc.value.code == "PRODUCT_SERVICE_UNAVAILABLE"

    def test_timeout_maps_to_502(self):
        def handler(request):
            raise httpx.ReadTimeout("timed out")

        pc = _product_client_responding(handler)
        with pytest.raises(BadGatewayError):
            pc.get_product("x")


class Test502ThroughApi:
    def test_cart_add_returns_502_envelope_when_product_service_down(
        self, session_factory, cart_repo
    ):
        def handler(request):
            raise httpx.ConnectError("refused")

        app = create_app(
            Settings(),
            sessionmaker=session_factory,
            cart_repo=cart_repo,
            product_client=_product_client_responding(handler),
            start_background=False,
        )
        client = TestClient(app, raise_server_exceptions=False)
        res = client.post(
            f"/api/v1/carts/{USER}/items",
            json={
                "productId": str(uuid.uuid4()),
                "variantId": str(uuid.uuid4()),
                "quantity": 1,
            },
        )
        assert res.status_code == 502
        error = res.json()["error"]
        assert error["code"] == "PRODUCT_SERVICE_UNAVAILABLE"
        assert error["message"] == "Cannot connect to Product Service"
        assert "details" not in error

    def test_unexpected_error_gives_500_envelope(self, app):
        # break the sessionmaker to force an unexpected error
        app.state.sessionmaker = None
        client = TestClient(app, raise_server_exceptions=False)
        res = client.get("/api/v1/admin/orders/summary")
        assert res.status_code == 500
        error = res.json()["error"]
        assert error["code"] == "INTERNAL_ERROR"
        assert error["message"] == "An internal error occurred"
