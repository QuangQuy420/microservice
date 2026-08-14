"""ApiResponse envelope helpers: {success, message, data}."""
from datetime import datetime

from rest_framework.response import Response


def ok(message: str, data=None, status: int = 200) -> Response:
    return Response({"success": True, "message": message, "data": data}, status=status)


def fail(message: str, data=None, status: int = 400) -> Response:
    return Response({"success": False, "message": message, "data": data}, status=status)


def iso_utc(value: datetime) -> str:
    """ISO-8601 with Z suffix, e.g. 2026-08-13T05:00:00.123456Z."""
    return value.isoformat().replace("+00:00", "Z")
