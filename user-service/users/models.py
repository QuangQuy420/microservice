"""Custom models matching the original service's table schema exactly.

Deliberately NOT django.contrib.auth — the spec's tables (users, profiles,
password_reset_tokens, permissions, roles, role_permissions, user_roles,
addresses) are modeled 1:1 with UUID primary keys, UTC timestamps and
composite primary keys on the join tables.
"""
import uuid

from django.db import models

# Language codes are ISO 639-1; adding one is a single entry here.
SUPPORTED_LANGUAGES = ["vi", "en"]
DEFAULT_LANGUAGE = "vi"


class TimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class User(TimestampedModel):
    STATUS_ACTIVE = "ACTIVE"
    STATUS_INACTIVE = "INACTIVE"
    STATUS_LOCKED = "LOCKED"

    email = models.CharField(max_length=100, unique=True)
    username = models.CharField(max_length=50, unique=True)
    password_hash = models.CharField(max_length=255)
    status = models.CharField(max_length=20, default=STATUS_ACTIVE)

    class Meta:
        db_table = "users"

    # DRF's IsAuthenticated checks this attribute; keep parity with the
    # contract of django.contrib.auth users without depending on it.
    @property
    def is_authenticated(self) -> bool:
        return True

    def role_names(self) -> list[str]:
        return list(
            Role.objects.filter(user_roles__user_id=self.id)
            .order_by("name")
            .values_list("name", flat=True)
        )

    def permission_codes(self) -> list[str]:
        return list(
            Permission.objects.filter(
                role_permissions__role__user_roles__user_id=self.id
            )
            .order_by("code")
            .values_list("code", flat=True)
            .distinct()
        )


class Profile(TimestampedModel):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, db_column="user_id", related_name="profile"
    )
    full_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, null=True, blank=True)
    avatar_url = models.CharField(max_length=500, null=True, blank=True)
    address = models.CharField(max_length=255, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    preferred_language = models.CharField(max_length=10, default=DEFAULT_LANGUAGE)

    class Meta:
        db_table = "profiles"


class PasswordResetToken(TimestampedModel):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="password_reset_tokens",
    )
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "password_reset_tokens"


class Permission(TimestampedModel):
    code = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "permissions"


class Role(TimestampedModel):
    name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "roles"


class RolePermission(models.Model):
    pk = models.CompositePrimaryKey("role_id", "permission_id")
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        db_column="role_id",
        related_name="role_permissions",
    )
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        db_column="permission_id",
        related_name="role_permissions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "role_permissions"


class UserRole(models.Model):
    pk = models.CompositePrimaryKey("user_id", "role_id")
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, db_column="user_id", related_name="user_roles"
    )
    role = models.ForeignKey(
        Role, on_delete=models.CASCADE, db_column="role_id", related_name="user_roles"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_roles"


class Address(TimestampedModel):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, db_column="user_id", related_name="addresses"
    )
    receiver_name = models.CharField(max_length=100)
    receiver_phone = models.CharField(max_length=20)
    address = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "addresses"
