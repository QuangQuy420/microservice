"""Response body builders (exact JSON keys from the spec)."""
from .models import Address, Permission, Profile, Role, User
from .responses import iso_utc


def user_response(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "roles": user.role_names(),
        "status": user.status,
    }


def profile_response(user: User, profile: Profile) -> dict:
    return {
        "userId": str(user.id),
        "email": user.email,
        "username": user.username,
        "roles": user.role_names(),
        "permissions": user.permission_codes(),
        "status": user.status,
        "fullName": profile.full_name,
        "phone": profile.phone,
        "avatarUrl": profile.avatar_url,
        "address": profile.address,
        "dateOfBirth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "preferredLanguage": profile.preferred_language,
    }


def permission_response(permission: Permission) -> dict:
    return {
        "id": str(permission.id),
        "code": permission.code,
        "description": permission.description,
    }


def role_response(role: Role) -> dict:
    permissions = (
        Permission.objects.filter(role_permissions__role_id=role.id)
        .order_by("code")
        .distinct()
    )
    return {
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "permissions": [permission_response(p) for p in permissions],
    }


def address_response(address: Address) -> dict:
    return {
        "id": str(address.id),
        "receiverName": address.receiver_name,
        "receiverPhone": address.receiver_phone,
        "address": address.address,
        "isDefault": address.is_default,
        "createdAt": iso_utc(address.created_at),
    }
