"""Config parsing: JWT_EXPIRES_IN and DATABASE_URL."""
import pytest
from django.core.exceptions import ImproperlyConfigured

from config.settings import _database_from_url, _parse_expires_in_ms


@pytest.mark.parametrize(
    "value,expected_ms",
    [
        ("86400000", 86_400_000),  # bare digits = milliseconds
        ("500ms", 500),
        ("30s", 30_000),
        ("15m", 900_000),
        ("2h", 7_200_000),
        ("1d", 86_400_000),
    ],
)
def test_parse_expires_in(value, expected_ms):
    assert _parse_expires_in_ms(value) == expected_ms


@pytest.mark.parametrize("value", ["", "abc", "1w", "d1", "1.5h", "-5s"])
def test_parse_expires_in_invalid(value):
    with pytest.raises(ImproperlyConfigured):
        _parse_expires_in_ms(value)


def test_database_url_postgres():
    config = _database_from_url("postgresql://app:secret@postgres:5432/auth_db")
    assert config == {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "auth_db",
        "USER": "app",
        "PASSWORD": "secret",
        "HOST": "postgres",
        "PORT": "5432",
    }


def test_database_url_unknown_scheme():
    with pytest.raises(ImproperlyConfigured):
        _database_from_url("mysql://x@y/z")
