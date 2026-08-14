import uuid

import pytest
from django.conf import settings

from users.models import User

pytestmark = pytest.mark.django_db

GOOD_KEY = {"HTTP_X_INTERNAL_KEY": "test-internal-key"}


def test_internal_permissions_for_admin(client):
    admin = User.objects.get(username="admin")
    response = client.get(
        f"/internal/v1/users/{admin.id}/permissions", **GOOD_KEY
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["message"] == "Lấy danh sách quyền của người dùng thành công"
    assert set(body["data"]["permissions"]) == {
        "product:manage",
        "role:manage",
        "user:manage-roles",
        "order:manage",
        "saga-settings:manage",
        "catalog:manage",
    }


def test_internal_permissions_for_customer_is_empty(client, customer):
    response = client.get(
        f"/internal/v1/users/{customer['user']['id']}/permissions", **GOOD_KEY
    )
    assert response.status_code == 200
    assert response.json()["data"] == {"permissions": []}


def test_internal_wrong_key_is_403_with_exact_envelope(client):
    admin = User.objects.get(username="admin")
    response = client.get(
        f"/internal/v1/users/{admin.id}/permissions",
        HTTP_X_INTERNAL_KEY="wrong-key",
    )
    assert response.status_code == 403
    assert response.json() == {
        "success": False,
        "message": "Yêu cầu nội bộ không hợp lệ",
        "data": None,
    }


def test_internal_missing_key_is_403(client):
    admin = User.objects.get(username="admin")
    response = client.get(f"/internal/v1/users/{admin.id}/permissions")
    assert response.status_code == 403
    assert response.json()["message"] == "Yêu cầu nội bộ không hợp lệ"


def test_internal_unknown_user_is_404(client):
    response = client.get(
        f"/internal/v1/users/{uuid.uuid4()}/permissions", **GOOD_KEY
    )
    assert response.status_code == 404
    assert response.json()["message"] == "Không tìm thấy người dùng"


def test_internal_key_matches_settings(client):
    assert settings.INTERNAL_API_KEY == "test-internal-key"
