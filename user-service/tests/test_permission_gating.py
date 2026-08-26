"""403 FORBIDDEN for authenticated users without the required permission
codes; 401 for missing tokens on the same endpoints."""
import pytest

from users.models import Role

from .conftest import bearer

pytestmark = pytest.mark.django_db

FORBIDDEN_MESSAGE = "You do not have permission to perform this action"


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/api/v1/users", None),
        ("post", "/api/v1/users/{user_id}/roles", {"roleId": "x"}),
        ("delete", "/api/v1/users/{user_id}/roles/{role_id}", None),
        ("get", "/api/v1/roles", None),
        ("post", "/api/v1/roles", {"name": "X", "permissionIds": []}),
        ("put", "/api/v1/roles/{role_id}", {"name": "X", "permissionIds": []}),
        ("delete", "/api/v1/roles/{role_id}", None),
        ("get", "/api/v1/permissions", None),
    ],
)
def test_customer_gets_403_on_admin_endpoints(client, customer, method, path, body):
    role_id = str(Role.objects.get(name="CUSTOMER").id)
    url = path.format(user_id=customer["user"]["id"], role_id=role_id)
    call = getattr(client, method)
    response = (
        call(url, body, **bearer(customer["token"]))
        if body is not None
        else call(url, **bearer(customer["token"]))
    )
    assert response.status_code == 403
    assert response.data == {
        "error": {"code": "FORBIDDEN", "message": FORBIDDEN_MESSAGE}
    }


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/users"),
        ("get", "/api/v1/roles"),
        ("get", "/api/v1/permissions"),
    ],
)
def test_missing_token_gets_401_not_403(client, db, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.data["error"]["code"] == "INVALID_TOKEN"


def test_admin_passes_permission_gate(client, admin_token):
    assert client.get("/api/v1/users", **bearer(admin_token)).status_code == 200
    assert client.get("/api/v1/roles", **bearer(admin_token)).status_code == 200


def test_permission_change_applies_immediately(client, admin_token, customer):
    """Authorization is live-DB: granting a role makes gated endpoints work
    with the SAME token (no re-login)."""
    token = customer["token"]
    assert client.get("/api/v1/users", **bearer(token)).status_code == 403

    admin_role = Role.objects.get(name="ADMIN")
    grant = client.post(
        f"/api/v1/users/{customer['user']['id']}/roles",
        {"roleId": str(admin_role.id)},
        **bearer(admin_token),
    )
    assert grant.status_code == 201

    assert client.get("/api/v1/users", **bearer(token)).status_code == 200
