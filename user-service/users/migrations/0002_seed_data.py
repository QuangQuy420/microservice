"""Idempotent seed data:

- Roles: CUSTOMER ("Customer"), ADMIN ("Administrator")
- The 6 permission codes; ADMIN gets all of them
- Admin user admin@example.com / admin with the exact bcrypt hash from the
  spec (password: Admin@123), ACTIVE, profile "Administrator", role ADMIN
"""
from django.db import migrations

ADMIN_PASSWORD_HASH = "$2b$12$1UjHn8ti8Y.Wqi//fNBQ4uGmrgAN0p9RE.C8nMzTPjO2c0y6sRXGO"

PERMISSIONS = [
    ("product:manage", "Manage products"),
    ("role:manage", "Manage roles"),
    ("user:manage-roles", "Manage user roles"),
    ("order:manage", "Manage orders"),
    ("saga-settings:manage", "Manage saga settings"),
    ("catalog:manage", "Manage catalog"),
]

ROLES = [
    ("CUSTOMER", "Customer"),
    ("ADMIN", "Administrator"),
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
        user_id=admin.id, defaults={"full_name": "Administrator"}
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
