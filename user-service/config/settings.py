"""Django settings for user-service.

All secrets come from environment variables (JWT_SECRET, INTERNAL_API_KEY).
The service fails fast at startup when a required variable is missing or
invalid — there are no hard-coded defaults for secrets.
"""

import base64
import binascii
import os
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    """Tiny .env loader (KEY=VALUE lines). Real env vars always win."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(
            f"Missing required environment variable: {name}. "
            f"Set it in the environment or in user-service/.env."
        )
    return value


def _parse_expires_in_ms(value: str) -> int:
    """JWT_EXPIRES_IN: bare digits = milliseconds, or <digits>(ms|s|m|h|d)."""
    match = re.fullmatch(r"(\d+)(ms|s|m|h|d)?", value)
    if not match:
        raise ImproperlyConfigured(
            f"Invalid JWT_EXPIRES_IN value: {value!r}. "
            "Use bare digits (milliseconds) or <digits>(ms|s|m|h|d), e.g. '1d'."
        )
    amount = int(match.group(1))
    unit = match.group(2) or "ms"
    factor = {"ms": 1, "s": 1_000, "m": 60_000, "h": 3_600_000, "d": 86_400_000}[unit]
    return amount * factor


def _database_from_url(url: str) -> dict:
    parsed = urlparse(url)
    scheme = parsed.scheme
    if scheme in ("postgres", "postgresql"):
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "localhost",
            "PORT": str(parsed.port or 5432),
        }
    if scheme == "sqlite":
        # sqlite:///relative/path.db, sqlite:////abs/path.db, sqlite://:memory:
        name = parsed.netloc + parsed.path
        if name in ("", ":memory:"):
            name = ":memory:"
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": name}
    raise ImproperlyConfigured(f"Unsupported DATABASE_URL scheme: {scheme!r}")


# --- Required configuration (fail fast) -------------------------------------

JWT_SECRET = _require_env("JWT_SECRET")
try:
    JWT_SIGNING_KEY = base64.b64decode(JWT_SECRET, validate=True)
except (binascii.Error, ValueError) as exc:
    raise ImproperlyConfigured(
        "JWT_SECRET must be valid Base64 (it is decoded to raw bytes before "
        "being used as the HMAC key, to match api-gateway's "
        "Buffer.from(secret, 'base64'))."
    ) from exc
if len(JWT_SIGNING_KEY) < 32:
    raise ImproperlyConfigured(
        "JWT_SECRET must decode to at least 32 raw bytes. "
        "Generate one with: openssl rand -base64 48"
    )

JWT_EXPIRES_IN_MS = _parse_expires_in_ms(_require_env("JWT_EXPIRES_IN"))
INTERNAL_API_KEY = _require_env("INTERNAL_API_KEY")
DATABASE_URL = _require_env("DATABASE_URL")

PORT = int(os.environ.get("PORT", "3001"))

# BCrypt cost for newly hashed passwords (verification cost comes from the
# stored hash itself). Overridable so the test suite can run fast.
BCRYPT_ROUNDS = int(os.environ.get("BCRYPT_ROUNDS", "12"))

# --- Core Django ------------------------------------------------------------

# Not used for sessions/CSRF (both disabled); Django just requires a value.
SECRET_KEY = JWT_SECRET

DEBUG = os.environ.get("DEBUG", "false").lower() in ("1", "true", "yes")

ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "users.apps.UsersConfig",
    "rest_framework",
]

MIDDLEWARE = [
    "users.middleware.InternalKeyMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = []

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {"default": _database_from_url(DATABASE_URL)}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["users.authentication.JwtAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": [],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "users.exceptions.api_exception_handler",
    "UNAUTHENTICATED_USER": None,
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
