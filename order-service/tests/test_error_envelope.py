from __future__ import annotations

import uuid

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
        assert set(body.keys()) == {
            "timestamp",
            "status",
            "error",
            "message",
            "path",
            "validationErrors",
        }
        assert body["status"] == 404
        assert body["error"] == "Not Found"
        assert body["message"] == "Không tìm thấy đơn hàng"
        assert body["path"] == f"/api/v1/users/{USER}/orders/{body['path'].rsplit('/', 1)[-1]}"
        assert body["validationErrors"] is None
        # timestamp is a naive local ISO string (no timezone offset)
        assert "T" in body["timestamp"]
        assert "+" not in body["timestamp"]
        assert not body["timestamp"].endswith("Z")

    def test_validation_envelope_first_error_per_field(self, client):
        res = client.post(
            f"/api/v1/users/{USER}/checkout",
            json={
                "receiverPhone": "xxx",
                "shippingAddress": "1 Lê Lợi",
                "paymentMethod": "CARD",
                "variantIds": [],
            },
        )
        assert res.status_code == 400
        body = res.json()
        assert body["error"] == "Bad Request"
        assert body["message"] == "Dữ liệu gửi lên không hợp lệ"
        errors = body["validationErrors"]
        assert errors["receiverPhone"] == "Số điện thoại không hợp lệ"
        assert errors["variantIds"] == "Vui lòng chọn ít nhất 1 sản phẩm để thanh toán"
        assert errors["receiverName"] == "Tên người nhận không được để trống"

    def test_malformed_json_body(self, client):
        res = client.post(
            f"/api/v1/users/{USER}/checkout",
            content=b"not-json",
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 400
        assert res.json()["message"] == "Dữ liệu gửi lên không hợp lệ"


def _product_client_responding(handler) -> ProductClient:
    return ProductClient(
        "http://product-service:3002",
        client=httpx.Client(
            base_url="http://product-service:3002",
            transport=httpx.MockTransport(handler),
        ),
    )


class TestProductClientErrorMapping:
    def test_404_maps_to_not_found_with_id(self):
        pc = _product_client_responding(lambda req: httpx.Response(404))
        with pytest.raises(NotFoundError) as exc:
            pc.get_product("abc-123")
        assert exc.value.message == "Không tìm thấy sản phẩm: abc-123"

    def test_other_4xx_maps_to_502(self):
        pc = _product_client_responding(lambda req: httpx.Response(403))
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Product Service từ chối yêu cầu với mã lỗi 403"

    def test_5xx_maps_to_502(self):
        pc = _product_client_responding(lambda req: httpx.Response(500))
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Product Service đang xảy ra lỗi"

    def test_empty_body_maps_to_502(self):
        pc = _product_client_responding(lambda req: httpx.Response(200, content=b""))
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Product Service trả về dữ liệu rỗng"

    def test_connect_failure_maps_to_502(self):
        def handler(request):
            raise httpx.ConnectError("connection refused")

        pc = _product_client_responding(handler)
        with pytest.raises(BadGatewayError) as exc:
            pc.get_product("x")
        assert exc.value.message == "Không thể kết nối đến Product Service"

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
        body = res.json()
        assert body["error"] == "Bad Gateway"
        assert body["message"] == "Không thể kết nối đến Product Service"
        assert body["validationErrors"] is None

    def test_unexpected_error_gives_500_envelope(self, app):
        # break the sessionmaker to force an unexpected error
        app.state.sessionmaker = None
        client = TestClient(app, raise_server_exceptions=False)
        res = client.get("/api/v1/admin/orders/summary")
        assert res.status_code == 500
        body = res.json()
        assert body["error"] == "Internal Server Error"
        assert body["message"] == "Đã xảy ra lỗi trong hệ thống"
