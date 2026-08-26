from __future__ import annotations

import uuid

import pytest

from tests.conftest import seed_settings

ADMIN = str(uuid.uuid4())
HEADERS = {"X-User-Id": ADMIN}


class TestGetSettings:
    def test_404_when_not_initialized(self, client):
        res = client.get("/api/v1/admin/saga-settings")
        assert res.status_code == 404
        assert res.json()["error"] == {
            "code": "SETTINGS_NOT_FOUND",
            "message": "No reconciliation settings have been initialized",
        }

    def test_get_returns_settings(self, client, session):
        seed_settings(session, interval_ms=60000, stuck_threshold_minutes=2, max_attempts=3)
        res = client.get("/api/v1/admin/saga-settings")
        assert res.status_code == 200
        body = res.json()["data"]
        assert body["intervalMs"] == 60000
        assert body["stuckThresholdMinutes"] == 2
        assert body["maxAttempts"] == 3
        assert "updatedAt" in body
        assert body["updatedBy"] is None


class TestUpdateSettings:
    def test_requires_header(self, client, session):
        seed_settings(session)
        res = client.put(
            "/api/v1/admin/saga-settings",
            json={"intervalMs": 30000, "stuckThresholdMinutes": 5, "maxAttempts": 10},
        )
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "MISSING_HEADER"

    def test_update_roundtrip(self, client, session):
        seed_settings(session)
        res = client.put(
            "/api/v1/admin/saga-settings",
            json={"intervalMs": 30000, "stuckThresholdMinutes": 5, "maxAttempts": 10},
            headers=HEADERS,
        )
        assert res.status_code == 200
        body = res.json()["data"]
        assert body["intervalMs"] == 30000
        assert body["stuckThresholdMinutes"] == 5
        assert body["maxAttempts"] == 10
        assert body["updatedBy"] == ADMIN

        again = client.get("/api/v1/admin/saga-settings").json()["data"]
        assert again["intervalMs"] == 30000
        assert again["updatedBy"] == ADMIN

    @pytest.mark.parametrize(
        "body,field",
        [
            ({"intervalMs": 9999, "stuckThresholdMinutes": 5, "maxAttempts": 10}, "intervalMs"),
            ({"intervalMs": 30000, "stuckThresholdMinutes": 0, "maxAttempts": 10}, "stuckThresholdMinutes"),
            ({"intervalMs": 30000, "stuckThresholdMinutes": 5, "maxAttempts": 0}, "maxAttempts"),
            ({"intervalMs": 30000, "stuckThresholdMinutes": 5, "maxAttempts": 21}, "maxAttempts"),
            ({}, "intervalMs"),
        ],
    )
    def test_validation(self, client, session, body, field):
        seed_settings(session)
        res = client.put("/api/v1/admin/saga-settings", json=body, headers=HEADERS)
        assert res.status_code == 422
        error = res.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert isinstance(error["details"][field], list)
