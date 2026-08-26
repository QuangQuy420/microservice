import uuid

import pytest

from users.models import Profile, User

from .conftest import register

pytestmark = pytest.mark.django_db


def test_register_success(client):
    response = register(client)
    assert response.status_code == 201
    data = response.data["data"]
    assert set(data.keys()) == {"id", "email", "username", "roles", "status"}
    uuid.UUID(data["id"])  # valid UUID
    assert data["email"] == "user1@example.com"
    assert data["username"] == "user_one"
    assert data["roles"] == ["CUSTOMER"]
    assert data["status"] == "ACTIVE"

    user = User.objects.get(username="user_one")
    assert user.password_hash.startswith(("$2a$", "$2b$"))
    profile = Profile.objects.get(user_id=user.id)
    assert profile.full_name == "Nguyen Van A"
    assert profile.phone == "0912345678"


def test_register_normalizes_email_username_and_full_name(client):
    response = register(
        client,
        email="  MixedCase@Example.COM ",
        username="MixedUser",
        fullName="  Nguyen   Van    B  ",
        phone="",
    )
    assert response.status_code == 201
    data = response.data["data"]
    assert data["email"] == "mixedcase@example.com"
    assert data["username"] == "mixeduser"
    profile = Profile.objects.get(user__username="mixeduser")
    assert profile.full_name == "Nguyen Van B"
    assert profile.phone is None  # blank phone -> null


def test_register_duplicate_email(client):
    register(client)
    response = register(client, username="other_user")
    assert response.status_code == 409
    assert response.data == {
        "error": {"code": "EMAIL_ALREADY_EXISTS", "message": "Email already exists"}
    }


def test_register_duplicate_email_case_insensitive(client):
    register(client)
    response = register(client, email="USER1@EXAMPLE.COM", username="other_user")
    assert response.status_code == 409
    assert response.data["error"]["code"] == "EMAIL_ALREADY_EXISTS"


def test_register_duplicate_username(client):
    register(client)
    response = register(client, email="other@example.com")
    assert response.status_code == 409
    assert response.data == {
        "error": {
            "code": "USERNAME_ALREADY_EXISTS",
            "message": "Username already exists",
        }
    }


@pytest.mark.parametrize(
    "overrides,bad_field",
    [
        ({"email": ""}, "email"),
        ({"email": "not-an-email"}, "email"),
        ({"username": "abc"}, "username"),  # too short
        ({"username": "bad name!"}, "username"),  # bad characters
        ({"password": "short1"}, "password"),  # too short
        ({"password": "onlyletters"}, "password"),  # no digit
        ({"password": "12345678"}, "password"),  # no letter
        ({"password": "a1" * 13}, "password"),  # 26 chars, too long
        ({"fullName": "A"}, "fullName"),  # too short
        ({"fullName": "Nguyen 123"}, "fullName"),  # digits not allowed
        ({"phone": "12345"}, "phone"),
        ({"phone": "9912345678"}, "phone"),  # must start with 0
    ],
)
def test_register_validation_errors(client, overrides, bad_field):
    response = register(client, **overrides)
    assert response.status_code == 422
    error = response.data["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert bad_field in error["details"]
    # details are ALWAYS arrays of messages keyed by field
    assert isinstance(error["details"][bad_field], list)


def test_register_missing_fields(client):
    response = client.post("/api/v1/auth/register", {})
    assert response.status_code == 422
    assert response.data["error"]["code"] == "VALIDATION_ERROR"
    details = response.data["error"]["details"]
    for field in ("email", "username", "password", "fullName"):
        assert field in details
    assert "phone" not in details  # optional
