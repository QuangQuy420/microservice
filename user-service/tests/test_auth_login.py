import base64

import jwt as pyjwt
import pytest
from django.conf import settings

from users.models import User

from .conftest import login, register

pytestmark = pytest.mark.django_db

INVALID_CREDENTIALS_MESSAGE = "Email, username or password is incorrect"


def test_login_with_email(client):
    register(client)
    response = login(client, "user1@example.com")
    assert response.status_code == 200
    data = response.data["data"]
    assert set(data.keys()) == {"accessToken", "tokenType", "expiresIn", "user"}
    assert data["tokenType"] == "Bearer"
    assert data["expiresIn"] == 86400  # 1d config (ms) -> seconds
    assert data["user"]["username"] == "user_one"
    assert data["user"]["roles"] == ["CUSTOMER"]


def test_login_with_username(client):
    register(client)
    response = login(client, "user_one")
    assert response.status_code == 200
    assert response.data["data"]["user"]["email"] == "user1@example.com"


def test_login_seeded_admin_bcrypt_hash(client):
    """Verifies the seeded $2b$12$ admin hash accepts Admin@123."""
    response = login(client, "admin", "Admin@123")
    assert response.status_code == 200
    user = response.data["data"]["user"]
    assert user["email"] == "admin@example.com"
    assert user["roles"] == ["ADMIN"]


def test_login_wrong_password(client):
    register(client)
    response = login(client, "user1@example.com", "WrongPass1")
    assert response.status_code == 401
    assert response.data == {
        "error": {
            "code": "INVALID_CREDENTIALS",
            "message": INVALID_CREDENTIALS_MESSAGE,
        }
    }


def test_login_unknown_identifier(client):
    response = login(client, "ghost@example.com")
    assert response.status_code == 401
    assert response.data["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_inactive_user_same_message(client):
    register(client)
    User.objects.filter(username="user_one").update(status="INACTIVE")
    response = login(client, "user_one")
    assert response.status_code == 401
    assert response.data["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_validation(client):
    response = client.post("/api/v1/auth/login", {"identifier": "x"})
    assert response.status_code == 422
    assert response.data["error"]["code"] == "VALIDATION_ERROR"
    assert "password" in response.data["error"]["details"]


def test_jwt_contents_and_gateway_interop(client):
    """Token must verify with the base64-DECODED secret and HS512 —
    exactly how api-gateway does it (Buffer.from(secret, 'base64'))."""
    register(client)
    response = login(client, "user_one")
    token = response.data["data"]["accessToken"]
    user = User.objects.get(username="user_one")

    header = pyjwt.get_unverified_header(token)
    assert header["alg"] == "HS512"

    gateway_key = base64.b64decode(settings.JWT_SECRET)
    payload = pyjwt.decode(token, gateway_key, algorithms=["HS512"])
    assert payload["sub"] == "user_one"
    assert payload["userId"] == str(user.id)
    assert payload["email"] == "user1@example.com"
    assert payload["exp"] - payload["iat"] == 86400
    # No role/permission claims in the token (live authorization)
    assert "roles" not in payload and "permissions" not in payload

    # Raw-string keying (the broken variant) must NOT verify
    with pytest.raises(pyjwt.InvalidSignatureError):
        pyjwt.decode(
            token, settings.JWT_SECRET.encode(), algorithms=["HS512"]
        )
