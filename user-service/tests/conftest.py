import pytest
from rest_framework.test import APIClient

DEFAULT_PASSWORD = "Password1"


@pytest.fixture
def client():
    return APIClient()


def register_payload(**overrides):
    payload = {
        "email": "user1@example.com",
        "username": "user_one",
        "password": DEFAULT_PASSWORD,
        "fullName": "Nguyen Van A",
        "phone": "0912345678",
    }
    payload.update(overrides)
    return payload


def register(client, **overrides):
    return client.post("/api/v1/auth/register", register_payload(**overrides))


def login(client, identifier, password=DEFAULT_PASSWORD):
    return client.post(
        "/api/v1/auth/login", {"identifier": identifier, "password": password}
    )


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def admin_token(client, db):
    response = login(client, "admin", "Admin@123")
    assert response.status_code == 200, response.data
    return response.data["data"]["accessToken"]


@pytest.fixture
def customer(client, db):
    """A registered CUSTOMER user; returns dict with token + user data."""
    response = register(client)
    assert response.status_code == 201, response.data
    login_response = login(client, "user1@example.com")
    assert login_response.status_code == 200
    return {
        "token": login_response.data["data"]["accessToken"],
        "user": login_response.data["data"]["user"],
        "password": DEFAULT_PASSWORD,
    }
