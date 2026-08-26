"""Response envelope helpers: {data} / {data, meta} / {error: {code, message, details}}."""
from datetime import datetime

from rest_framework.response import Response


def data_response(data=None, status: int = 200) -> Response:
    return Response({"data": data}, status=status)


def list_response(items: list, page: int, page_size: int, total: int) -> Response:
    return Response(
        {"data": items, "meta": {"page": page, "pageSize": page_size, "total": total}},
        status=200,
    )


def error_response(
    code: str, message: str, details=None, status: int = 400
) -> Response:
    error = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return Response({"error": error}, status=status)


def iso_utc(value: datetime) -> str:
    """ISO-8601 with Z suffix, e.g. 2026-08-13T05:00:00.123456Z."""
    return value.isoformat().replace("+00:00", "Z")
