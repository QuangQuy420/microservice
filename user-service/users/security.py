"""BCrypt password hashing (accepts $2a$/$2b$ prefixes, like the original)."""
import bcrypt
from django.conf import settings


def hash_password(raw_password: str) -> str:
    return bcrypt.hashpw(
        raw_password.encode("utf-8"), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
    ).decode("utf-8")


def check_password(raw_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            raw_password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except ValueError:
        return False
