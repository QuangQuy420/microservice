"""Test settings: deterministic secrets + in-memory sqlite, no external infra."""

import base64
import os

# Must be set BEFORE importing the base settings so the values in .env (loaded
# with setdefault) do not win over the deterministic test configuration.
_TEST_JWT_SECRET = base64.b64encode(b"unit-test-signing-key-64-bytes-long-0123456789abcdef0123456789ab").decode()
os.environ["JWT_SECRET"] = _TEST_JWT_SECRET
os.environ["JWT_EXPIRES_IN"] = "1d"
os.environ["INTERNAL_API_KEY"] = "test-internal-key"
os.environ["DATABASE_URL"] = "sqlite://:memory:"
os.environ["BCRYPT_ROUNDS"] = "4"  # fast hashing in tests

from .settings import *  # noqa: E402,F401,F403
