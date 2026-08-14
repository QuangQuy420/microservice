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
    assert response.data["message"] == "Gán vai trò cho người dùng thành công"
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
    assert response.data["message"] == "Không tìm thấy người dùng"


def test_assign_role_unknown_role(client, admin_token, customer):
    response = assign(client, admin_token, customer["user"]["id"], uuid.uuid4())
    assert response.status_code == 404
    assert response.data["message"] == "Không tìm thấy vai trò"


def test_assign_role_requires_role_id(client, admin_token, customer):
    response = client.post(
        f"/api/v1/users/{customer['user']['id']}/roles", {}, **bearer(admin_token)
    )
    assert response.status_code == 400
    assert "roleId" in response.data["data"]


def test_remove_role_success(client, admin_token, customer):
    user_id = customer["user"]["id"]
    admin_role = Role.objects.get(name="ADMIN")
    assign(client, admin_token, user_id, admin_role.id)

    response = client.delete(
        f"/api/v1/users/{user_id}/roles/{admin_role.id}", **bearer(admin_token)
    )
    assert response.status_code == 200
    assert response.data["message"] == "Gỡ vai trò khỏi người dùng thành công"
    assert response.data["data"]["roles"] == ["CUSTOMER"]


def test_remove_role_not_assigned(client, admin_token, customer):
    admin_role = Role.objects.get(name="ADMIN")
    response = client.delete(
        f"/api/v1/users/{customer['user']['id']}/roles/{admin_role.id}",
        **bearer(admin_token),
    )
    assert response.status_code == 404
    assert response.data["message"] == "Người dùng chưa được gán vai trò này"


def test_remove_role_unknown_user(client, admin_token):
    admin_role = Role.objects.get(name="ADMIN")
    response = client.delete(
        f"/api/v1/users/{uuid.uuid4()}/roles/{admin_role.id}", **bearer(admin_token)
    )
    assert response.status_code == 404
    assert response.data["message"] == "Không tìm thấy người dùng"


def test_user_list_pagination(client, admin_token, customer):
    response = client.get("/api/v1/users?page=1&limit=1", **bearer(admin_token))
    assert response.status_code == 200
    assert response.data["message"] == "Lấy danh sách người dùng thành công"
    data = response.data["data"]
    assert set(data.keys()) == {"items", "total", "page", "limit", "totalPages"}
    assert data["total"] == User.objects.count() == 2  # admin + customer
    assert data["page"] == 1
    assert data["limit"] == 1
    assert data["totalPages"] == 2
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert set(item.keys()) == {"id", "email", "username", "roles", "status"}


def test_user_list_defaults(client, admin_token):
    response = client.get("/api/v1/users", **bearer(admin_token))
    data = response.data["data"]
    assert data["page"] == 1
    assert data["limit"] == 20
