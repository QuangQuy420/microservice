"""Shared view helpers."""
import uuid

from ..errors import ApiError
from ..models import Role, User


def get_user_or_404(user_id) -> User:
    """Resolve a user id from a URL path; bad UUIDs count as not found."""
    try:
        parsed = uuid.UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        raise ApiError("USER_NOT_FOUND")
    user = User.objects.filter(id=parsed).first()
    if user is None:
        raise ApiError("USER_NOT_FOUND")
    return user


def get_role_or_404(role_id) -> Role:
    try:
        parsed = uuid.UUID(str(role_id))
    except (ValueError, AttributeError, TypeError):
        raise ApiError("ROLE_NOT_FOUND")
    role = Role.objects.filter(id=parsed).first()
    if role is None:
        raise ApiError("ROLE_NOT_FOUND")
    return role


def parse_uuid_or_none(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None
