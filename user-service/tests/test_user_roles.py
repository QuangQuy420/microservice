import uuid

import pytest

from users.models import Role, User, UserRole

from .conftest import bearer

pytestmark = pytest.mark.django_db


def assign(client, token, user_id, role_id):
    return client.post(
        f"/api/v1/users/{user_id}/roles", {"roleId": str(role_id)}, **bearer(token)
    )


def test_assign_role_success_and_idempotent(client, admin_token, customer):
    user_id = customer["user"]["id"]
    admin_role = Role.objects.get(name="ADMIN")

    response = assign(client, admin_token, user_id, admin_role.id)
    assert response.status_code == 201
    assert sorted(response.data["data"]["roles"]) == ["ADMIN", "CUSTOMER"]

    # Idempotent: assigning again still succeeds with one row
    response2 = assign(client, admin_token, user_id, admin_role.id)
    assert response2.status_code == 201
    assert (
        UserRole.objects.filter(user_id=user_id, role_id=admin_role.id).count() == 1
    )


def test_assign_role_unknown_user(client, admin_token):
    role = Role.objects.get(name="ADMIN")
    response = assign(client, admin_token, uuid.uuid4(), role.id)
    assert response.status_code == 404
    assert response.data["error"]["code"] == "USER_NOT_FOUND"


def test_assign_role_unknown_role(client, admin_token, customer):
    response = assign(client, admin_token, customer["user"]["id"], uuid.uuid4())
    assert response.status_code == 404
    assert response.data["error"]["code"] == "ROLE_NOT_FOUND"


def test_assign_role_requires_role_id(client, admin_token, customer):
    response = client.post(
        f"/api/v1/users/{customer['user']['id']}/roles", {}, **bearer(admin_token)
    )
    assert response.status_code == 422
    assert "roleId" in response.data["error"]["details"]


def test_remove_role_success(client, admin_token, customer):
    user_id = customer["user"]["id"]
    admin_role = Role.objects.get(name="ADMIN")
    assign(client, admin_token, user_id, admin_role.id)

    response = client.delete(
        f"/api/v1/users/{user_id}/roles/{admin_role.id}", **bearer(admin_token)
    )
    assert response.status_code == 200
    assert response.data["data"]["roles"] == ["CUSTOMER"]


def test_remove_role_not_assigned(client, admin_token, customer):
    admin_role = Role.objects.get(name="ADMIN")
    response = client.delete(
        f"/api/v1/users/{customer['user']['id']}/roles/{admin_role.id}",
        **bearer(admin_token),
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "USER_ROLE_NOT_ASSIGNED"


def test_remove_role_unknown_user(client, admin_token):
    admin_role = Role.objects.get(name="ADMIN")
    response = client.delete(
        f"/api/v1/users/{uuid.uuid4()}/roles/{admin_role.id}", **bearer(admin_token)
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "USER_NOT_FOUND"


def test_user_list_pagination(client, admin_token, customer):
    response = client.get("/api/v1/users?page=1&pageSize=1", **bearer(admin_token))
    assert response.status_code == 200
    assert set(response.data.keys()) == {"data", "meta"}
    meta = response.data["meta"]
    assert meta == {"page": 1, "pageSize": 1, "total": User.objects.count()}
    assert meta["total"] == 2  # admin + customer
    items = response.data["data"]
    assert len(items) == 1
    assert set(items[0].keys()) == {"id", "email", "username", "roles", "status"}


def test_user_list_defaults(client, admin_token):
    response = client.get("/api/v1/users", **bearer(admin_token))
    assert response.data["meta"]["page"] == 1
    assert response.data["meta"]["pageSize"] == 20
