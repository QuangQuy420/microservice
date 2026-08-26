import pytest

from .conftest import bearer, login

pytestmark = pytest.mark.django_db

INVALID_TOKEN_MESSAGE = "Token is invalid or has expired"


def get_me(client, token):
    return client.get("/api/v1/users/me", **bearer(token))


def put_me(client, token, payload):
    return client.put("/api/v1/users/me", payload, **bearer(token))


def test_me_requires_token(client, db):
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401
    assert response.data == {
        "error": {"code": "INVALID_TOKEN", "message": INVALID_TOKEN_MESSAGE}
    }


def test_me_rejects_garbage_token(client, db):
    response = get_me(client, "garbage.token.here")
    assert response.status_code == 401
    assert response.data["error"]["code"] == "INVALID_TOKEN"


def test_me_rejects_non_bearer_scheme(client, customer):
    response = client.get(
        "/api/v1/users/me", HTTP_AUTHORIZATION=f"Basic {customer['token']}"
    )
    assert response.status_code == 401


def test_get_me_returns_profile(client, customer):
    response = get_me(client, customer["token"])
    assert response.status_code == 200
    data = response.data["data"]
    assert set(data.keys()) == {
        "userId",
        "email",
        "username",
        "roles",
        "permissions",
        "status",
        "fullName",
        "phone",
        "avatarUrl",
        "address",
        "dateOfBirth",
        "preferredLanguage",
    }
    assert data["email"] == "user1@example.com"
    assert data["roles"] == ["CUSTOMER"]
    assert data["permissions"] == []  # CUSTOMER has no permission codes
    assert data["fullName"] == "Nguyen Van A"
    assert data["phone"] == "0912345678"
    assert data["avatarUrl"] is None
    assert data["dateOfBirth"] is None
    assert data["preferredLanguage"] == "vi"  # default locale


def test_put_me_partial_update_only_sent_fields(client, customer):
    response = put_me(client, customer["token"], {"address": "12 Ly Thuong Kiet"})
    assert response.status_code == 200
    data = response.data["data"]
    assert data["address"] == "12 Ly Thuong Kiet"
    assert data["fullName"] == "Nguyen Van A"  # untouched
    assert data["phone"] == "0912345678"  # untouched


def test_put_me_blank_strings_become_null(client, customer):
    put_me(client, customer["token"], {"avatarUrl": "http://x/avatar.png"})
    response = put_me(client, customer["token"], {"phone": "", "avatarUrl": ""})
    assert response.status_code == 200
    data = response.data["data"]
    assert data["phone"] is None
    assert data["avatarUrl"] is None


def test_put_me_blank_full_name_is_ignored(client, customer):
    response = put_me(client, customer["token"], {"fullName": "   "})
    assert response.status_code == 200
    assert response.data["data"]["fullName"] == "Nguyen Van A"


def test_put_me_full_name_normalized(client, customer):
    response = put_me(client, customer["token"], {"fullName": "  Tran   Thi  C "})
    assert response.status_code == 200
    assert response.data["data"]["fullName"] == "Tran Thi C"


def test_put_me_null_fields_ignored(client, customer):
    response = put_me(client, customer["token"], {"phone": None, "address": None})
    assert response.status_code == 200
    assert response.data["data"]["phone"] == "0912345678"


def test_put_me_date_of_birth(client, customer):
    response = put_me(client, customer["token"], {"dateOfBirth": "1995-04-30"})
    assert response.status_code == 200
    assert response.data["data"]["dateOfBirth"] == "1995-04-30"


def test_put_me_date_of_birth_must_be_past(client, customer):
    response = put_me(client, customer["token"], {"dateOfBirth": "2999-01-01"})
    assert response.status_code == 422
    assert response.data["error"]["code"] == "VALIDATION_ERROR"
    assert "dateOfBirth" in response.data["error"]["details"]


def test_put_me_invalid_phone(client, customer):
    response = put_me(client, customer["token"], {"phone": "12345"})
    assert response.status_code == 422
    assert "phone" in response.data["error"]["details"]


def test_change_password_success(client, customer):
    response = client.put(
        "/api/v1/users/change-password",
        {"currentPassword": "Password1", "newPassword": "Password2new"},
        **bearer(customer["token"]),
    )
    assert response.status_code == 200
    assert response.data == {"data": None}
    assert login(client, "user_one", "Password2new").status_code == 200
    assert login(client, "user_one", "Password1").status_code == 401


def test_change_password_wrong_current(client, customer):
    response = client.put(
        "/api/v1/users/change-password",
        {"currentPassword": "WrongPass9", "newPassword": "Password2new"},
        **bearer(customer["token"]),
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "CURRENT_PASSWORD_INCORRECT"


def test_change_password_same_as_current(client, customer):
    response = client.put(
        "/api/v1/users/change-password",
        {"currentPassword": "Password1", "newPassword": "Password1"},
        **bearer(customer["token"]),
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "NEW_PASSWORD_SAME_AS_CURRENT"
