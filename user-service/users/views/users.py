"""User endpoints: admin list, own profile, change-password, role assignment."""
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from ..errors import ApiError
from ..models import Profile, User, UserRole
from ..normalize import blank_to_none
from ..permissions import require
from ..presenters import profile_response, user_response
from ..responses import data_response, list_response
from ..security import check_password, hash_password
from ..serializers import (
    AssignRoleSerializer,
    ChangePasswordSerializer,
    UpdateProfileSerializer,
)
from .helpers import get_role_or_404, get_user_or_404, parse_uuid_or_none


def _int_param(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


class UserListView(APIView):
    permission_classes = [IsAuthenticated, require("user:manage-roles")]

    def get(self, request):
        page = max(1, _int_param(request.query_params.get("page"), 1))
        page_size = max(1, _int_param(request.query_params.get("pageSize"), 20))

        queryset = User.objects.order_by("created_at")
        total = queryset.count()
        offset = (page - 1) * page_size
        items = [user_response(u) for u in queryset[offset : offset + page_size]]

        return list_response(items, page, page_size, total)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def _profile(self, user: User) -> Profile:
        profile = Profile.objects.filter(user_id=user.id).first()
        if profile is None:
            raise ApiError("PROFILE_NOT_FOUND")
        return profile

    def get(self, request):
        profile = self._profile(request.user)
        return data_response(profile_response(request.user, profile))

    def put(self, request):
        serializer = UpdateProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        profile = self._profile(request.user)

        # Partial semantics: only keys present AND non-null are applied.
        if data.get("fullName"):  # only when non-blank (already normalized)
            profile.full_name = data["fullName"]
        if "phone" in data and data["phone"] is not None:
            profile.phone = blank_to_none(data["phone"])
        if "avatarUrl" in data and data["avatarUrl"] is not None:
            profile.avatar_url = blank_to_none(data["avatarUrl"])
        if "address" in data and data["address"] is not None:
            profile.address = blank_to_none(data["address"])
        if data.get("dateOfBirth") is not None:
            profile.date_of_birth = data["dateOfBirth"]
        if data.get("preferredLanguage") is not None:
            profile.preferred_language = data["preferredLanguage"]
        profile.save()

        return data_response(profile_response(request.user, profile))


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user

        if not check_password(data["currentPassword"], user.password_hash):
            raise ApiError("CURRENT_PASSWORD_INCORRECT")
        if check_password(data["newPassword"], user.password_hash):
            raise ApiError("NEW_PASSWORD_SAME_AS_CURRENT")

        user.password_hash = hash_password(data["newPassword"])
        user.save(update_fields=["password_hash", "updated_at"])
        return data_response(None)


class UserRolesView(APIView):
    permission_classes = [IsAuthenticated, require("user:manage-roles")]

    def post(self, request, user_id):
        user = get_user_or_404(user_id)
        serializer = AssignRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = get_role_or_404(serializer.validated_data["roleId"])

        # Idempotent assignment
        with transaction.atomic():
            UserRole.objects.get_or_create(user=user, role=role)

        return data_response(user_response(user), status=201)


class UserRoleDetailView(APIView):
    permission_classes = [IsAuthenticated, require("user:manage-roles")]

    def delete(self, request, user_id, role_id):
        user = get_user_or_404(user_id)
        parsed_role_id = parse_uuid_or_none(role_id)
        if parsed_role_id is None:
            raise ApiError("USER_ROLE_NOT_ASSIGNED")

        deleted, _ = UserRole.objects.filter(
            user_id=user.id, role_id=parsed_role_id
        ).delete()
        if deleted == 0:
            raise ApiError("USER_ROLE_NOT_ASSIGNED")

        return data_response(user_response(user))
