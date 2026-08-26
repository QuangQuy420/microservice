import uuid

import pytest

from users.models import Permission, Role, RolePermission

from .conftest import bearer

pytestmark = pytest.mark.django_db

ALL_PERMISSION_CODES = {
    "product:manage",
    "role:manage",
    "user:manage-roles",
    "order:manage",
    "saga-settings:manage",
    "catalog:manage",
}


def create_role(client, token, **overrides):
    payload = {"name": "SUPPORT", "description": "Ho tro", "permissionIds": []}
    payload.update(overrides)
    return client.post("/api/v1/roles", payload, **bearer(token))


def test_seeded_roles_and_permissions(client, admin_token):
    response = client.get("/api/v1/roles", **bearer(admin_token))
    assert response.status_code == 200
    roles = {r["name"]: r for r in response.data["data"]}
    assert set(roles) == {"ADMIN", "CUSTOMER"}
    admin_codes = {p["code"] for p in roles["ADMIN"]["permissions"]}
    assert admin_codes == ALL_PERMISSION_CODES
    assert roles["CUSTOMER"]["permissions"] == []


def test_permission_list(client, admin_token):
    response = client.get("/api/v1/permissions", **bearer(admin_token))
    assert response.status_code == 200
    codes = {p["code"] for p in response.data["data"]}
    assert codes == ALL_PERMISSION_CODES
    sample = response.data["data"][0]
    assert set(sample.keys()) == {"id", "code", "description"}


def test_create_role_with_permissions(client, admin_token):
    permission = Permission.objects.get(code="order:manage")
    response = create_role(client, admin_token, permissionIds=[str(permission.id)])
    assert response.status_code == 201
    data = response.data["data"]
    assert data["name"] == "SUPPORT"
    assert [p["code"] for p in data["permissions"]] == ["order:manage"]


def test_create_role_empty_permissions_allowed(client, admin_token):
    response = create_role(client, admin_token, permissionIds=[])
    assert response.status_code == 201


def test_create_role_requires_permission_ids_key(client, admin_token):
    response = client.post(
        "/api/v1/roles", {"name": "SUPPORT"}, **bearer(admin_token)
    )
    assert response.status_code == 422
    assert "permissionIds" in response.data["error"]["details"]


def test_create_role_duplicate_name_case_insensitive(client, admin_token):
    response = create_role(client, admin_token, name="customer")
    assert response.status_code == 409
    assert response.data["error"]["code"] == "ROLE_ALREADY_EXISTS"


def test_create_role_unknown_permission_id_is_404(client, admin_token):
    known = Permission.objects.get(code="order:manage")
    response = create_role(
        client,
        admin_token,
        permissionIds=[str(known.id), str(uuid.uuid4())],
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "PERMISSION_NOT_FOUND"
    assert not Role.objects.filter(name="SUPPORT").exists()


def test_update_role_replaces_permissions_wholesale(client, admin_token):
    p1 = Permission.objects.get(code="order:manage")
    p2 = Permission.objects.get(code="catalog:manage")
    created = create_role(client, admin_token, permissionIds=[str(p1.id)])
    role_id = created.data["data"]["id"]

    response = client.put(
        f"/api/v1/roles/{role_id}",
        {"name": "SUPPORT", "description": None, "permissionIds": [str(p2.id)]},
        **bearer(admin_token),
    )
    assert response.status_code == 200
    assert [p["code"] for p in response.data["data"]["permissions"]] == [
        "catalog:manage"
    ]
    assert RolePermission.objects.filter(role_id=role_id).count() == 1


def test_update_role_keeping_own_name_is_allowed(client, admin_token):
    created = create_role(client, admin_token)
    role_id = created.data["data"]["id"]
    response = client.put(
        f"/api/v1/roles/{role_id}",
        {"name": "SUPPORT", "permissionIds": []},
        **bearer(admin_token),
    )
    assert response.status_code == 200


def test_update_role_renaming_onto_existing_name_is_409(client, admin_token):
    created = create_role(client, admin_token)
    role_id = created.data["data"]["id"]
    response = client.put(
        f"/api/v1/roles/{role_id}",
        {"name": "ADMIN", "permissionIds": []},
        **bearer(admin_token),
    )
    assert response.status_code == 409
    assert response.data["error"]["code"] == "ROLE_ALREADY_EXISTS"


def test_update_unknown_role_is_404(client, admin_token):
    response = client.put(
        f"/api/v1/roles/{uuid.uuid4()}",
        {"name": "X1", "permissionIds": []},
        **bearer(admin_token),
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "ROLE_NOT_FOUND"


def test_delete_role_success(client, admin_token):
    created = create_role(client, admin_token)
    role_id = created.data["data"]["id"]
    response = client.delete(f"/api/v1/roles/{role_id}", **bearer(admin_token))
    assert response.status_code == 200
    assert response.data == {"data": None}
    assert not Role.objects.filter(id=role_id).exists()


def test_delete_role_in_use_is_409(client, admin_token):
    # ADMIN role is assigned to the seeded admin user
    role_id = str(Role.objects.get(name="ADMIN").id)
    response = client.delete(f"/api/v1/roles/{role_id}", **bearer(admin_token))
    assert response.status_code == 409
    assert response.data["error"]["code"] == "ROLE_IN_USE"
    assert Role.objects.filter(id=role_id).exists()
