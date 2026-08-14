"""DRF permission classes for RBAC (permission codes checked live in the DB).

403 FORBIDDEN envelope on failure — 401 stays reserved for missing/bad tokens.
"""
from rest_framework.permissions import BasePermission

from .models import RolePermission, UserRole


def has_permission_code(user_id, code: str) -> bool:
    role_ids = UserRole.objects.filter(user_id=user_id).values_list(
        "role_id", flat=True
    )
    return RolePermission.objects.filter(
        role_id__in=role_ids, permission__code=code
    ).exists()


class HasPermissionCode(BasePermission):
    """Subclass-configured via `code`; use `require("x:y")` for convenience."""

    code: str | None = None

    def has_permission(self, request, view) -> bool:
        user = request.user
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        return self.code is not None and has_permission_code(user.id, self.code)


def require(code: str) -> type[HasPermissionCode]:
    return type(
        f"HasPermission_{code.replace(':', '_').replace('-', '_')}",
        (HasPermissionCode,),
        {"code": code},
    )
