from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.json_utils import loads
from app.models import Order, OutboxEvent
from app.time_utils import now_vn
from tests.conftest import create_order

USER = str(uuid.uuid4())


class TestListOrders:
    def test_lists_only_own_orders_sorted_desc(self, client, session):
        now = now_vn()
        o_old = create_order(session, user_id=USER, created_at=now - timedelta(hours=2))
        o_new = create_order(session, user_id=USER, created_at=now - timedelta(hours=1))
        create_order(session)  # someone else's order
        res = client.get(f"/api/v1/users/{USER}/orders")
        assert res.status_code == 200
        body = res.json()
        assert body["totalElements"] == 2
        assert [o["id"] for o in body["content"]] == [str(o_new.id), str(o_old.id)]
        assert body["page"] == 0
        assert body["size"] == 20
        assert body["totalPages"] == 1
        assert body["first"] is True
        assert body["last"] is True

    def test_summary_shape(self, client, session):
        order = create_order(session, user_id=USER)
        res = client.get(f"/api/v1/users/{USER}/orders")
        row = res.json()["content"][0]
        assert set(row.keys()) == {
            "id",
            "orderCode",
            "totalAmount",
            "status",
            "paymentMethod",
            "paymentStatus",
            "receiverName",
            "receiverPhone",
            "createdAt",
        }

    def test_status_filter(self, client, session):
        create_order(session, user_id=USER, status="PENDING")
        confirmed = create_order(session, user_id=USER, status="CONFIRMED")
        res = client.get(f"/api/v1/users/{USER}/orders", params={"status": "CONFIRMED"})
        body = res.json()
        assert body["totalElements"] == 1
        assert body["content"][0]["id"] == str(confirmed.id)

    def test_paging(self, client, session):
        now = now_vn()
        for i in range(5):
            create_order(session, user_id=USER, created_at=now - timedelta(minutes=i))
        res = client.get(f"/api/v1/users/{USER}/orders", params={"page": 1, "size": 2})
        body = res.json()
        assert body["totalElements"] == 5
        assert body["totalPages"] == 3
        assert len(body["content"]) == 2
        assert body["first"] is False
        assert body["last"] is False

    def test_negative_page(self, client):
        res = client.get(f"/api/v1/users/{USER}/orders", params={"page": -1})
        assert res.status_code == 400
        assert res.json()["message"] == "Trang không được nhỏ hơn 0"

    @pytest.mark.parametrize("size", [0, 101])
    def test_size_out_of_bounds(self, client, size):
        res = client.get(f"/api/v1/users/{USER}/orders", params={"size": size})
        assert res.status_code == 400
        assert res.json()["message"] == "Kích thước trang phải từ 1 đến 100"


class TestOrderDetail:
    def test_detail_shape(self, client, session):
        order = create_order(session, user_id=USER)
        res = client.get(f"/api/v1/users/{USER}/orders/{order.id}")
        assert res.status_code == 200
        body = res.json()
        assert set(body.keys()) == {
            "id",
            "orderCode",
            "userId",
            "totalAmount",
            "status",
            "paymentId",
            "paymentMethod",
            "paymentStatus",
            "receiverName",
            "receiverPhone",
            "shippingAddress",
            "note",
            "items",
            "statusHistories",
            "createdAt",
            "updatedAt",
        }
        # transactionCode and reconciliation internals are never exposed
        assert "transactionCode" not in body
        assert "reconciliationAttempts" not in body
        item = body["items"][0]
        assert set(item.keys()) == {
            "id",
            "productId",
            "variantId",
            "productName",
            "skuVariant",
            "color",
            "colorHex",
            "size",
            "productImageUrl",
            "unitPrice",
            "quantity",
            "subtotal",
        }

    def test_scoped_by_user(self, client, session):
        order = create_order(session)  # other user
        res = client.get(f"/api/v1/users/{USER}/orders/{order.id}")
        assert res.status_code == 404
        assert res.json()["message"] == "Không tìm thấy đơn hàng"

    def test_unknown_order(self, client, session):
        res = client.get(f"/api/v1/users/{USER}/orders/{uuid.uuid4()}")
        assert res.status_code == 404
        assert res.json()["message"] == "Không tìm thấy đơn hàng"


class TestCancelOrder:
    def _cancel(self, client, order, reason="Đổi ý không mua nữa"):
        return client.post(
            f"/api/v1/users/{USER}/orders/{order.id}/cancel", json={"reason": reason}
        )

    @pytest.mark.parametrize("status", ["PENDING", "AWAITING_PAYMENT", "CONFIRMED"])
    def test_cancellable_statuses(self, client, session, status):
        order = create_order(session, user_id=USER, status=status)
        res = self._cancel(client, order)
        assert res.status_code == 200
        assert res.json()["status"] == "CANCELLED"

    @pytest.mark.parametrize(
        "status", ["PROCESSING", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED"]
    )
    def test_non_cancellable_statuses(self, client, session, status):
        order = create_order(session, user_id=USER, status=status)
        res = self._cancel(client, order)
        assert res.status_code == 400
        assert res.json()["message"] == f"Không thể hủy đơn ở trạng thái {status}"

    def test_history_note_is_reason(self, client, session):
        order = create_order(session, user_id=USER, status="PENDING")
        res = self._cancel(client, order, reason="Muốn đổi màu khác")
        histories = res.json()["statusHistories"]
        assert histories[-1]["status"] == "CANCELLED"
        assert histories[-1]["note"] == "Muốn đổi màu khác"

    @pytest.mark.parametrize("status", ["PENDING", "AWAITING_PAYMENT"])
    def test_release_published_for_unpaid_statuses(self, client, session, status):
        vid = uuid.uuid4()
        order = create_order(
            session, user_id=USER, status=status, items=[(vid, 2, "100000.00")]
        )
        self._cancel(client, order)
        events = session.scalars(select(OutboxEvent)).all()
        assert len(events) == 1
        assert events[0].routing_key == "stock.release.requested"
        payload = loads(events[0].payload)
        assert payload["orderId"] == str(order.id)
        assert payload["items"] == [{"variantId": str(vid), "quantity": 2}]

    def test_no_release_for_confirmed(self, client, session):
        order = create_order(session, user_id=USER, status="CONFIRMED")
        self._cancel(client, order)
        assert session.scalars(select(OutboxEvent)).all() == []

    def test_reason_required(self, client, session):
        order = create_order(session, user_id=USER, status="PENDING")
        res = client.post(f"/api/v1/users/{USER}/orders/{order.id}/cancel", json={})
        assert res.status_code == 400
        assert res.json()["message"] == "Dữ liệu gửi lên không hợp lệ"
        assert "reason" in res.json()["validationErrors"]

    def test_cancel_scoped_by_user(self, client, session):
        order = create_order(session, status="PENDING")  # other user
        res = self._cancel(client, order)
        assert res.status_code == 404
