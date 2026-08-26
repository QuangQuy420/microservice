"""Request validation serializers.

Constraints follow the spec's validation rules. Field-level messages are
English (clients translate by error code); any validation failure becomes a
422 VALIDATION_ERROR with details = {"<field>": ["<message>", ...]}.
"""
import re
from datetime import date

from rest_framework import serializers

from .models import SUPPORTED_LANGUAGES
from .normalize import collapse_whitespace

PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).+$")
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")
# Any unicode letter plus space . ' - ([^\W\d_] matches any unicode letter)
FULL_NAME_PATTERN = re.compile(r"^(?:[^\W\d_]|[ .'\-])+$", re.UNICODE)
PHONE_PATTERN = re.compile(r"^0\d{9}$")


def _messages(label: str) -> dict:
    return {
        "required": f"{label} is required",
        "null": f"{label} is required",
        "blank": f"{label} must not be blank",
        "invalid": f"{label} is invalid",
        "invalid_choice": f"{label} is not supported",
        "min_length": f"{label} is too short",
        "max_length": f"{label} is too long",
    }


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=50, error_messages=_messages("Email"))
    username = serializers.CharField(
        min_length=4, max_length=30, error_messages=_messages("Username")
    )
    password = serializers.CharField(
        min_length=8,
        max_length=24,
        trim_whitespace=False,
        error_messages=_messages("Password"),
    )
    fullName = serializers.CharField(
        min_length=2, max_length=50, error_messages=_messages("Full name")
    )
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        error_messages=_messages("Phone number"),
    )

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_username(self, value: str) -> str:
        value = value.strip().lower()
        if not USERNAME_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Username may only contain letters, digits and underscores"
            )
        return value

    def validate_password(self, value: str) -> str:
        if not PASSWORD_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Password must contain at least one letter and one digit"
            )
        return value

    def validate_fullName(self, value: str) -> str:
        if not FULL_NAME_PATTERN.fullmatch(value):
            raise serializers.ValidationError("Full name is invalid")
        return collapse_whitespace(value)

    def validate_phone(self, value):
        if value is None:
            return value
        value = value.strip()
        if value and not PHONE_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Phone number must be 10 digits starting with 0"
            )
        return value


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(
        max_length=50, error_messages=_messages("Email or username")
    )
    password = serializers.CharField(
        max_length=24, trim_whitespace=False, error_messages=_messages("Password")
    )


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=50, error_messages=_messages("Email"))

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField(error_messages=_messages("Token"))
    newPassword = serializers.CharField(
        min_length=8,
        max_length=24,
        trim_whitespace=False,
        error_messages=_messages("New password"),
    )

    def validate_newPassword(self, value: str) -> str:
        if not PASSWORD_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "New password must contain at least one letter and one digit"
            )
        return value


class UpdateProfileSerializer(serializers.Serializer):
    """Partial update: only keys that are present AND non-null are applied."""

    fullName = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=50,
        error_messages=_messages("Full name"),
    )
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        error_messages=_messages("Phone number"),
    )
    avatarUrl = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=500,
        error_messages=_messages("Avatar url"),
    )
    address = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=255,
        error_messages=_messages("Address"),
    )
    dateOfBirth = serializers.DateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d"],
        error_messages=_messages("Date of birth"),
    )
    preferredLanguage = serializers.ChoiceField(
        required=False,
        allow_null=True,
        choices=SUPPORTED_LANGUAGES,
        error_messages=_messages("Preferred language"),
    )

    def validate_fullName(self, value):
        if value is None:
            return value
        normalized = collapse_whitespace(value)
        if not normalized:
            return ""  # blank -> ignored by the view
        if len(normalized) < 2:
            raise serializers.ValidationError("Full name is too short")
        if not FULL_NAME_PATTERN.fullmatch(normalized):
            raise serializers.ValidationError("Full name is invalid")
        return normalized

    def validate_phone(self, value):
        if value is None:
            return value
        value = value.strip()
        if value and not PHONE_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Phone number must be 10 digits starting with 0"
            )
        return value

    def validate_dateOfBirth(self, value):
        if value is not None and value >= date.today():
            raise serializers.ValidationError("Date of birth must be in the past")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(
        max_length=24,
        trim_whitespace=False,
        error_messages=_messages("Current password"),
    )
    newPassword = serializers.CharField(
        min_length=8,
        max_length=24,
        trim_whitespace=False,
        error_messages=_messages("New password"),
    )

    def validate_newPassword(self, value: str) -> str:
        if not PASSWORD_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "New password must contain at least one letter and one digit"
            )
        return value


class AddressSerializer(serializers.Serializer):
    receiverName = serializers.CharField(
        min_length=2, max_length=100, error_messages=_messages("Receiver name")
    )
    receiverPhone = serializers.CharField(
        error_messages=_messages("Receiver phone number")
    )
    address = serializers.CharField(max_length=255, error_messages=_messages("Address"))
    isDefault = serializers.BooleanField(
        required=False, default=False, error_messages=_messages("Default address")
    )

    def validate_receiverName(self, value: str) -> str:
        return collapse_whitespace(value)

    def validate_receiverPhone(self, value: str) -> str:
        value = value.strip()
        if not PHONE_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Receiver phone number must be 10 digits starting with 0"
            )
        return value

    def validate_address(self, value: str) -> str:
        return collapse_whitespace(value)


class RoleUpsertSerializer(serializers.Serializer):
    name = serializers.CharField(
        min_length=2, max_length=50, error_messages=_messages("Role name")
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=255,
        error_messages=_messages("Description"),
    )
    permissionIds = serializers.ListField(
        child=serializers.UUIDField(error_messages=_messages("Permission id")),
        allow_empty=True,
        error_messages={
            "required": "Permission list is required",
            "null": "Permission list is required",
            "not_a_list": "Permission list is invalid",
        },
    )

    def validate_name(self, value: str) -> str:
        return value.strip()


class AssignRoleSerializer(serializers.Serializer):
    roleId = serializers.UUIDField(error_messages=_messages("Role id"))
