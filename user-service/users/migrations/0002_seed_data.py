"""Idempotent seed data:

- Roles: CUSTOMER ("Khách hàng"), ADMIN ("Quản trị viên")
- The 6 permission codes; ADMIN gets all of them
- Admin user admin@example.com / admin with the exact bcrypt hash from the
  spec (password: Admin@123), ACTIVE, profile "Quản trị viên", role ADMIN
"""
from django.db import migrations

ADMIN_PASSWORD_HASH = "$2b$12$1UjHn8ti8Y.Wqi//fNBQ4uGmrgAN0p9RE.C8nMzTPjO2c0y6sRXGO"

PERMISSIONS = [
    ("product:manage", "Quản lý sản phẩm"),
    ("role:manage", "Quản lý vai trò"),
    ("user:manage-roles", "Quản lý vai trò người dùng"),
    ("order:manage", "Quản lý đơn hàng"),
    ("saga-settings:manage", "Quản lý cấu hình saga"),
    ("catalog:manage", "Quản lý danh mục"),
]

ROLES = [
    ("CUSTOMER", "Khách hàng"),
    ("ADMIN", "Quản trị viên"),
]


def seed(apps, schema_editor):
    Role = apps.get_model("users", "Role")
    Permission = apps.get_model("users", "Permission")
    RolePermission = apps.get_model("users", "RolePermission")
    User = apps.get_model("users", "User")
    Profile = apps.get_model("users", "Profile")
    UserRole = apps.get_model("users", "UserRole")

    roles = {}
    for name, description in ROLES:
        role, _ = Role.objects.get_or_create(
            name=name, defaults={"description": description}
        )
        roles[name] = role

    permissions = []
    for code, description in PERMISSIONS:
        permission, _ = Permission.objects.get_or_create(
            code=code, defaults={"description": description}
        )
        permissions.append(permission)

    admin_role = roles["ADMIN"]
    for permission in permissions:
        RolePermission.objects.get_or_create(
            role_id=admin_role.id, permission_id=permission.id
        )

    admin, _ = User.objects.get_or_create(
        username="admin",
        defaults={
            "email": "admin@example.com",
            "password_hash": ADMIN_PASSWORD_HASH,
            "status": "ACTIVE",
        },
    )
    Profile.objects.get_or_create(
        user_id=admin.id, defaults={"full_name": "Quản trị viên"}
    )
    UserRole.objects.get_or_create(user_id=admin.id, role_id=admin_role.id)


def unseed(apps, schema_editor):
    # Seed data is foundational; reversing is a no-op on purpose.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
