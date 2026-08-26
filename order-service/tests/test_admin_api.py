from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.enums import OrderStatus
from app.json_utils import loads
from app.models import OutboxEvent
from tests.conftest import create_order

ADMIN = str(uuid.uuid4())
HEADERS = {"X-User-Id": ADMIN}

ALL_STATUSES = [s.value for s in OrderStatus]
ALLOWED = {
    "PENDING": {"AWAITING_PAYMENT", "CANCELLED"},
    "AWAITING_PAYMENT": {"CONFIRMED", "CANCELLED"},
    "CONFIRMED": {"PROCESSING", "CANCELLED"},
    "PROCESSING": {"SHIPPING"},
    "SHIPPING": {"DELIVERED"},
    "DELIVERED": {"COMPLETED"},
    "COMPLETED": set(),
    "CANCELLED": set(),
}


class TestStatusTransitionMatrix:
    @pytest.mark.parametrize("current", ALL_STATUSES)
    @pytest.mark.parametrize("target", ALL_STATUSES)
    def test_full_matrix(self, client, session, current, target):
        order = create_order(session, status=current)
        res = client.patch(
            f"/api/v1/admin/orders/{order.id}/status",
            json={"status": target},
            headers=HEADERS,
        )
        if target != current and target in ALLOWED[current]:
            assert res.status_code == 200, (current, target)
            assert res.json()["data"]["status"] == target
        else:
            assert res.status_code == 400, (current, target)
            error = res.json()["error"]
            assert error["code"] == "INVALID_STATUS_TRANSITION", (current, target)
            assert (
                error["message"]
                == f"Cannot change status from {current} to {target}"
            )

    def test_history_records_admin_and_note(self, client, session):
        order = create_order(session, status="PENDING")
        res = client.patch(
            f"/api/v1/admin/orders/{order.id}/status",
            json={"status": "AWAITING_PAYMENT", "note": "Xác nhận thủ công"},
            headers=HEADERS,
        )
        history = res.json()["data"]["statusHistories"][-1]
        assert history["status"] == "AWAITING_PAYMENT"
        assert history["changedBy"] == ADMIN
        assert history["note"] == "Xác nhận thủ công"

    def test_missing_header(self, client, session):
        order = create_order(session, status="PENDING")
        res = client.patch(
            f"/api/v1/admin/orders/{order.id}/status", json={"status": "CANCELLED"}
        )
        assert res.status_code == 400
        assert res.json()["error"] == {
            "code": "MISSING_HEADER",
            "message": "Missing required header: X-User-Id",
        }

    def test_invalid_status_value(self, client, session):
        order = create_order(session, status="PENDING")
        res = client.patch(
            f"/api/v1/admin/orders/{order.id}/status",
            json={"status": "NOT_A_STATUS"},
            headers=HEADERS,
        )
        assert res.status_code == 422
        error = res.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["details"]["status"] == ["Invalid order status"]

    def test_unknown_order(self, client):
        res = client.patch(
            f"/api/v1/admin/orders/{uuid.uuid4()}/status",
            json={"status": "CANCELLED"},
            headers=HEADERS,
        )
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "ORDER_NOT_FOUND"


class TestAdminCancelReleasesStock:
    """Admin PATCH → CANCELLED from PENDING/AWAITING_PAYMENT publishes
    stock.release.requested (same as the user cancel flow)."""

    @pytest.mark.parametrize("current", ["PENDING", "AWAITING_PAYMENT"])
    def test_release_published(self, client, session, current):
        vid = uuid.uuid4()
        order = create_order(session, status=current, items=[(vid, 3, "50000.00")])
        client.patch(
            f"/api/v1/admin/orders/{order.id}/status",
            json={"status": "CANCELLED"},
            headers=HEADERS,
        )
        events = session.scalars(select(OutboxEvent)).all()
        assert [e.routing_key for e in events] == ["stock.release.requested"]
        payload = loads(events[0].payload)
        assert payload["items"] == [{"variantId": str(vid), "quantity": 3}]

    def test_no_release_when_cancelling_confirmed(self, client, session):
        order = create_order(session, status="CONFIRMED")
        client.patch(
            f"/api/v1/admin/orders/{order.id}/status",
            json={"status": "CANCELLED"},
            headers=HEADERS,
        )
        assert session.scalars(select(OutboxEvent)).all() == []


class TestAdminQueries:
    def test_admin_list_sees_all_users(self, client, session):
        create_order(session)
        create_order(session)
        res = client.get("/api/v1/admin/orders")
        assert res.status_code == 200
        assert res.json()["meta"] == {"page": 1, "pageSize": 20, "total": 2}

    def test_admin_list_paging_validation(self, client):
        assert client.get("/api/v1/admin/orders", params={"page": 0}).status_code == 400
        assert (
            client.get("/api/v1/admin/orders", params={"pageSize": 101}).status_code == 400
        )

    def test_admin_detail_no_user_scoping(self, client, session):
        order = create_order(session)
        res = client.get(f"/api/v1/admin/orders/{order.id}")
        assert res.status_code == 200
        assert res.json()["data"]["id"] == str(order.id)

    def test_admin_detail_404(self, client):
        res = client.get(f"/api/v1/admin/orders/{uuid.uuid4()}")
        assert res.status_code == 404

    def test_summary_only_counts_existing_statuses(self, client, session):
        create_order(session, status="PENDING")
        create_order(session, status="PENDING")
        create_order(session, status="CANCELLED")
        res = client.get("/api/v1/admin/orders/summary")
        assert res.status_code == 200
        body = res.json()["data"]
        assert body["totalOrders"] == 3
        assert body["ordersByStatus"] == {"PENDING": 2, "CANCELLED": 1}

    def test_summary_empty(self, client):
        res = client.get("/api/v1/admin/orders/summary")
        assert res.json() == {"data": {"totalOrders": 0, "ordersByStatus": {}}}
