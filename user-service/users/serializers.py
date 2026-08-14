"""Request validation serializers.

Constraints follow the spec's validation rules. Field-level
messages are Vietnamese; the envelope message for any validation failure is
always "Dữ liệu đầu vào không hợp lệ" with data = {"<field>": "<first msg>"}.
"""
import re
from datetime import date

from rest_framework import serializers

from .normalize import collapse_whitespace

PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).+$")
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")
# Any unicode letter plus space . ' - ([^\W\d_] matches any unicode letter)
FULL_NAME_PATTERN = re.compile(r"^(?:[^\W\d_]|[ .'\-])+$", re.UNICODE)
PHONE_PATTERN = re.compile(r"^0\d{9}$")


def _messages(label: str) -> dict:
    return {
        "required": f"{label} là bắt buộc",
        "null": f"{label} là bắt buộc",
        "blank": f"{label} không được để trống",
        "invalid": f"{label} không hợp lệ",
        "min_length": f"{label} quá ngắn",
        "max_length": f"{label} quá dài",
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
        error_messages=_messages("Mật khẩu"),
    )
    fullName = serializers.CharField(
        min_length=2, max_length=50, error_messages=_messages("Họ tên")
    )
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        error_messages=_messages("Số điện thoại"),
    )

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_username(self, value: str) -> str:
        value = value.strip().lower()
        if not USERNAME_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Username chỉ được chứa chữ cái, số và dấu gạch dưới"
            )
        return value

    def validate_password(self, value: str) -> str:
        if not PASSWORD_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Mật khẩu phải chứa ít nhất một chữ cái và một chữ số"
            )
        return value

    def validate_fullName(self, value: str) -> str:
        if not FULL_NAME_PATTERN.fullmatch(value):
            raise serializers.ValidationError("Họ tên không hợp lệ")
        return collapse_whitespace(value)

    def validate_phone(self, value):
        if value is None:
            return value
        value = value.strip()
        if value and not PHONE_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
            )
        return value


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(
        max_length=50, error_messages=_messages("Email hoặc username")
    )
    password = serializers.CharField(
        max_length=24, trim_whitespace=False, error_messages=_messages("Mật khẩu")
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
        error_messages=_messages("Mật khẩu mới"),
    )

    def validate_newPassword(self, value: str) -> str:
        if not PASSWORD_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Mật khẩu mới phải chứa ít nhất một chữ cái và một chữ số"
            )
        return value


class UpdateProfileSerializer(serializers.Serializer):
    """Partial update: only keys that are present AND non-null are applied."""

    fullName = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=50,
        error_messages=_messages("Họ tên"),
    )
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        error_messages=_messages("Số điện thoại"),
    )
    avatarUrl = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=500,
        error_messages=_messages("Ảnh đại diện"),
    )
    address = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=255,
        error_messages=_messages("Địa chỉ"),
    )
    dateOfBirth = serializers.DateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d"],
        error_messages=_messages("Ngày sinh"),
    )

    def validate_fullName(self, value):
        if value is None:
            return value
        normalized = collapse_whitespace(value)
        if not normalized:
            return ""  # blank -> ignored by the view
        if len(normalized) < 2:
            raise serializers.ValidationError("Họ tên quá ngắn")
        if not FULL_NAME_PATTERN.fullmatch(normalized):
            raise serializers.ValidationError("Họ tên không hợp lệ")
        return normalized

    def validate_phone(self, value):
        if value is None:
            return value
        value = value.strip()
        if value and not PHONE_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
            )
        return value

    def validate_dateOfBirth(self, value):
        if value is not None and value >= date.today():
            raise serializers.ValidationError("Ngày sinh phải là một ngày trong quá khứ")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(
        max_length=24,
        trim_whitespace=False,
        error_messages=_messages("Mật khẩu hiện tại"),
    )
    newPassword = serializers.CharField(
        min_length=8,
        max_length=24,
        trim_whitespace=False,
        error_messages=_messages("Mật khẩu mới"),
    )

    def validate_newPassword(self, value: str) -> str:
        if not PASSWORD_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Mật khẩu mới phải chứa ít nhất một chữ cái và một chữ số"
            )
        return value


class AddressSerializer(serializers.Serializer):
    receiverName = serializers.CharField(
        min_length=2, max_length=100, error_messages=_messages("Tên người nhận")
    )
    receiverPhone = serializers.CharField(
        error_messages=_messages("Số điện thoại người nhận")
    )
    address = serializers.CharField(max_length=255, error_messages=_messages("Địa chỉ"))
    isDefault = serializers.BooleanField(
        required=False, default=False, error_messages=_messages("Địa chỉ mặc định")
    )

    def validate_receiverName(self, value: str) -> str:
        return collapse_whitespace(value)

    def validate_receiverPhone(self, value: str) -> str:
        value = value.strip()
        if not PHONE_PATTERN.fullmatch(value):
            raise serializers.ValidationError(
                "Số điện thoại người nhận phải gồm 10 chữ số và bắt đầu bằng 0"
            )
        return value

    def validate_address(self, value: str) -> str:
        return collapse_whitespace(value)


class RoleUpsertSerializer(serializers.Serializer):
    name = serializers.CharField(
        min_length=2, max_length=50, error_messages=_messages("Tên vai trò")
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=255,
        error_messages=_messages("Mô tả"),
    )
    permissionIds = serializers.ListField(
        child=serializers.UUIDField(error_messages=_messages("Id quyền")),
        allow_empty=True,
        error_messages={
            "required": "Danh sách quyền là bắt buộc",
            "null": "Danh sách quyền là bắt buộc",
            "not_a_list": "Danh sách quyền không hợp lệ",
        },
    )

    def validate_name(self, value: str) -> str:
        return value.strip()


class AssignRoleSerializer(serializers.Serializer):
    roleId = serializers.UUIDField(error_messages=_messages("Id vai trò"))
