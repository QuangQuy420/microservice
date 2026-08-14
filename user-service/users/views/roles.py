"""Role and permission management endpoints (Bearer + role:manage)."""
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from ..errors import ApiError
from ..models import Permission, Role, RolePermission, UserRole
from ..permissions import require
from ..presenters import permission_response, role_response
from ..responses import ok
from ..serializers import RoleUpsertSerializer
from .helpers import get_role_or_404


def _resolve_permissions(permission_ids) -> list[Permission]:
    unique_ids = set(permission_ids)
    permissions = list(Permission.objects.filter(id__in=unique_ids))
    if len(permissions) != len(unique_ids):
        raise ApiError("PERMISSION_NOT_FOUND")
    return permissions


class RolesView(APIView):
    permission_classes = [IsAuthenticated, require("role:manage")]

    def get(self, request):
        roles = Role.objects.order_by("name")
        return ok(
            "Lấy danh sách vai trò thành công", [role_response(r) for r in roles]
        )

    def post(self, request):
        serializer = RoleUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            if Role.objects.filter(name__iexact=data["name"]).exists():
                raise ApiError("ROLE_ALREADY_EXISTS")
            permissions = _resolve_permissions(data["permissionIds"])
            role = Role.objects.create(
                name=data["name"], description=data.get("description") or None
            )
            RolePermission.objects.bulk_create(
                RolePermission(role=role, permission=p) for p in permissions
            )

        return ok("Tạo vai trò thành công", role_response(role), status=201)


class RoleDetailView(APIView):
    permission_classes = [IsAuthenticated, require("role:manage")]

    def put(self, request, role_id):
        role = get_role_or_404(role_id)
        serializer = RoleUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            # 409 only when renaming onto ANOTHER role's existing name
            if (
                Role.objects.filter(name__iexact=data["name"])
                .exclude(id=role.id)
                .exists()
            ):
                raise ApiError("ROLE_ALREADY_EXISTS")
            permissions = _resolve_permissions(data["permissionIds"])

            role.name = data["name"]
            role.description = data.get("description") or None
            role.save(update_fields=["name", "description", "updated_at"])

            # Permissions replaced wholesale
            RolePermission.objects.filter(role_id=role.id).delete()
            RolePermission.objects.bulk_create(
                RolePermission(role=role, permission=p) for p in permissions
            )

        return ok("Cập nhật vai trò thành công", role_response(role))

    def delete(self, request, role_id):
        role = get_role_or_404(role_id)
        if UserRole.objects.filter(role_id=role.id).exists():
            raise ApiError("ROLE_IN_USE")
        with transaction.atomic():
            RolePermission.objects.filter(role_id=role.id).delete()
            role.delete()
        return ok("Xóa vai trò thành công", None)


class PermissionListView(APIView):
    permission_classes = [IsAuthenticated, require("role:manage")]

    def get(self, request):
        permissions = Permission.objects.order_by("code")
        return ok(
            "Lấy danh sách quyền thành công",
            [permission_response(p) for p in permissions],
        )
