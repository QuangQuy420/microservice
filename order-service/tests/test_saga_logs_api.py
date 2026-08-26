from __future__ import annotations

import uuid
from datetime import datetime

from app.enums import SagaLogLevel, SagaLogStage
from app.models import OrderSagaLog
from tests.conftest import create_order


def _log(session, order, stage, *, level="INFO", occurred_at, message="msg"):
    session.add(
        OrderSagaLog(
            order_id=order.id,
            stage=stage,
            level=level,
            message=message,
            source_service="ORDER_SERVICE",
            occurred_at=occurred_at,
        )
    )
    session.commit()


class TestDays:
    def test_days_grouped_desc_with_warning_flag(self, client, session):
        order = create_order(session)
        _log(session, order, "CREATED", occurred_at=datetime(2026, 8, 10, 9, 0, 0))
        _log(session, order, "STOCK_RESERVE_REQUESTED", occurred_at=datetime(2026, 8, 10, 9, 0, 1))
        _log(
            session,
            order,
            "PAYMENT_FAILED",
            level="WARN",
            occurred_at=datetime(2026, 8, 12, 14, 0, 0),
        )
        res = client.get("/api/v1/admin/saga-logs/days")
        assert res.status_code == 200
        assert res.json() == {
            "data": [
                {"date": "2026-08-12", "totalCount": 1, "hasWarning": True},
                {"date": "2026-08-10", "totalCount": 2, "hasWarning": False},
            ]
        }

    def test_empty(self, client):
        assert client.get("/api/v1/admin/saga-logs/days").json() == {"data": []}


class TestDayDetail:
    def test_grouped_per_order_sorted_by_last_occurrence_desc(self, client, session):
        o1 = create_order(session)
        o2 = create_order(session)
        _log(session, o1, "CREATED", occurred_at=datetime(2026, 8, 10, 9, 0, 0))
        _log(session, o1, "STOCK_RESERVE_REQUESTED", occurred_at=datetime(2026, 8, 10, 9, 5, 0))
        _log(
            session,
            o2,
            "PAYMENT_FAILED",
            level="WARN",
            occurred_at=datetime(2026, 8, 10, 10, 0, 0),
        )
        # a log on another day must not leak in
        _log(session, o1, "PAYMENT_COMPLETED", occurred_at=datetime(2026, 8, 11, 9, 0, 0))

        res = client.get("/api/v1/admin/saga-logs/days/2026-08-10")
        assert res.status_code == 200
        rows = res.json()["data"]
        assert [r["orderId"] for r in rows] == [str(o2.id), str(o1.id)]
        assert rows[0]["orderCode"] == o2.order_code
        assert rows[0]["entryCount"] == 1
        assert rows[0]["worstLevel"] == "WARN"
        assert rows[1]["entryCount"] == 2
        assert rows[1]["worstLevel"] == "INFO"
        assert rows[1]["lastOccurredAt"] == "2026-08-10T09:05:00"

    def test_invalid_date(self, client):
        res = client.get("/api/v1/admin/saga-logs/days/not-a-date")
        assert res.status_code == 400
        error = res.json()["error"]
        assert error["code"] == "MALFORMED_REQUEST"
        assert error["details"]["date"] == ["Invalid date (expected format yyyy-MM-dd)"]


class TestOrderLogs:
    def test_logs_ascending_with_full_shape(self, client, session):
        order = create_order(session)
        _log(session, order, "STOCK_RESERVE_REQUESTED", occurred_at=datetime(2026, 8, 10, 9, 1, 0))
        _log(session, order, "CREATED", occurred_at=datetime(2026, 8, 10, 9, 0, 0))
        res = client.get(f"/api/v1/admin/saga-logs/orders/{order.id}")
        rows = res.json()["data"]
        assert [r["stage"] for r in rows] == ["CREATED", "STOCK_RESERVE_REQUESTED"]
        assert set(rows[0].keys()) == {
            "stage",
            "level",
            "message",
            "sourceService",
            "targetService",
            "errorDetail",
            "retryCount",
            "occurredAt",
        }

    def test_unknown_order_returns_empty_200(self, client):
        res = client.get(f"/api/v1/admin/saga-logs/orders/{uuid.uuid4()}")
        assert res.status_code == 200
        assert res.json() == {"data": []}
