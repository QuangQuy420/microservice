"""JWT issue/verify. Key = base64-decoded JWT_SECRET, algorithm HS512 —
interops with api-gateway's jwt.verify(token, Buffer.from(secret, 'base64'))."""
from datetime import datetime, timezone

import jwt
from django.conf import settings

from .models import User

ALGORITHM = "HS512"


def issue_token(user: User) -> tuple[str, int]:
    """Return (token, expires_in_seconds). Claims: sub=username, userId,
    email, iat, exp. No role/permission claims (authorization is live)."""
    now = int(datetime.now(timezone.utc).timestamp())
    expires_in_seconds = settings.JWT_EXPIRES_IN_MS // 1000
    payload = {
        "sub": user.username,
        "userId": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + expires_in_seconds,
    }
    token = jwt.encode(payload, settings.JWT_SIGNING_KEY, algorithm=ALGORITHM)
    return token, expires_in_seconds


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError on any failure (bad signature, expired, ...)."""
    return jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[ALGORITHM])
