import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

import pytest

from users.models import PasswordResetToken, User

from .conftest import login, register

pytestmark = pytest.mark.django_db

def forgot(client, email="user1@example.com"):
    return client.post("/api/v1/auth/forgot-password", {"email": email})


def reset(client, token, new_password="NewPassword2"):
    return client.post(
        "/api/v1/auth/reset-password", {"token": token, "newPassword": new_password}
    )


def raw_token_from_logs(caplog) -> str:
    for record in caplog.records:
        match = re.search(r"Password reset token for \S+: (\S+)", record.getMessage())
        if match:
            return match.group(1)
    raise AssertionError("raw reset token not logged")


def test_forgot_password_unknown_email_still_200(client):
    response = forgot(client, "ghost@example.com")
    assert response.status_code == 200
    assert response.data == {"data": None}
    assert PasswordResetToken.objects.count() == 0


def test_forgot_password_creates_hashed_token(client, caplog):
    register(client)
    with caplog.at_level(logging.INFO):
        response = forgot(client)
    assert response.status_code == 200

    raw = raw_token_from_logs(caplog)
    assert len(raw) == 43  # 32 bytes, base64url without padding
    row = PasswordResetToken.objects.get()
    assert row.token_hash == hashlib.sha256(raw.encode()).hexdigest()
    assert len(row.token_hash) == 64
    assert row.used_at is None
    remaining = row.expires_at - datetime.now(timezone.utc)
    assert timedelta(minutes=14) < remaining <= timedelta(minutes=15)


def test_forgot_password_deletes_prior_tokens(client, caplog):
    register(client)
    with caplog.at_level(logging.INFO):
        forgot(client)
        forgot(client)
    assert PasswordResetToken.objects.count() == 1


def test_reset_password_success_flow(client, caplog):
    register(client)
    with caplog.at_level(logging.INFO):
        forgot(client)
    raw = raw_token_from_logs(caplog)

    response = reset(client, raw)
    assert response.status_code == 200
    assert response.data == {"data": None}
    assert PasswordResetToken.objects.get().used_at is not None

    assert login(client, "user_one", "NewPassword2").status_code == 200
    assert login(client, "user_one", "Password1").status_code == 401


def test_reset_token_invalid(client):
    response = reset(client, "definitely-not-a-token")
    assert response.status_code == 400
    assert response.data["error"]["code"] == "RESET_TOKEN_INVALID"


def test_reset_token_used(client, caplog):
    register(client)
    with caplog.at_level(logging.INFO):
        forgot(client)
    raw = raw_token_from_logs(caplog)
    reset(client, raw)
    response = reset(client, raw, "OtherPassword3")
    assert response.status_code == 400
    assert response.data["error"]["code"] == "RESET_TOKEN_USED"


def test_reset_token_expired(client, caplog):
    register(client)
    with caplog.at_level(logging.INFO):
        forgot(client)
    raw = raw_token_from_logs(caplog)
    PasswordResetToken.objects.update(
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)
    )
    response = reset(client, raw)
    assert response.status_code == 400
    assert response.data["error"]["code"] == "RESET_TOKEN_EXPIRED"


def test_reset_token_used_checked_before_expired(client, caplog):
    """Spec ordering: a token both used AND expired reports USED."""
    register(client)
    with caplog.at_level(logging.INFO):
        forgot(client)
    raw = raw_token_from_logs(caplog)
    PasswordResetToken.objects.update(
        used_at=datetime.now(timezone.utc) - timedelta(minutes=20),
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    response = reset(client, raw)
    assert response.status_code == 400
    assert response.data["error"]["code"] == "RESET_TOKEN_USED"


def test_reset_new_password_same_as_current(client, caplog):
    register(client)
    with caplog.at_level(logging.INFO):
        forgot(client)
    raw = raw_token_from_logs(caplog)
    response = reset(client, raw, "Password1")  # unchanged
    assert response.status_code == 400
    assert response.data["error"]["code"] == "NEW_PASSWORD_SAME_AS_CURRENT"
    assert PasswordResetToken.objects.get().used_at is None


def test_reset_token_lookup_trims_token(client, caplog):
    register(client)
    with caplog.at_level(logging.INFO):
        forgot(client)
    raw = raw_token_from_logs(caplog)
    response = reset(client, f"  {raw}  ")
    assert response.status_code == 200


def test_reset_password_validation(client):
    response = client.post(
        "/api/v1/auth/reset-password", {"token": "x", "newPassword": "short"}
    )
    assert response.status_code == 422
    assert response.data["error"]["code"] == "VALIDATION_ERROR"
    assert "newPassword" in response.data["error"]["details"]
