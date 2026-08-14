"""Central DRF exception handler producing the ApiResponse envelope for ALL
errors — business errors (ApiError), auth failures, permission failures,
validation errors and unexpected exceptions."""
import logging

from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response

from .errors import (
    ERROR_CATALOG,
    INTERNAL_SERVER_ERROR_MESSAGE,
    VALIDATION_FAILED_MESSAGE,
    ApiError,
)

logger = logging.getLogger(__name__)


def _envelope(message: str, data=None, status: int = 400) -> Response:
    return Response({"success": False, "message": message, "data": data}, status=status)


def _first_message(detail) -> str:
    """Reduce a DRF error detail (list/dict/str) to its first message."""
    if isinstance(detail, (list, tuple)):
        return _first_message(detail[0]) if detail else ""
    if isinstance(detail, dict):
        for value in detail.values():
            return _first_message(value)
        return ""
    return str(detail)


def _validation_data(detail) -> dict:
    """Map DRF validation detail to {"<field>": "<first message>"}."""
    if isinstance(detail, dict):
        return {str(field): _first_message(messages) for field, messages in detail.items()}
    return {"non_field_errors": _first_message(detail)}


def api_exception_handler(exc, context) -> Response:
    if isinstance(exc, ApiError):
        return _envelope(exc.message, None, exc.http_status)

    if isinstance(exc, drf_exceptions.ValidationError):
        return _envelope(VALIDATION_FAILED_MESSAGE, _validation_data(exc.detail), 400)

    if isinstance(
        exc, (drf_exceptions.NotAuthenticated, drf_exceptions.AuthenticationFailed)
    ):
        status, message = ERROR_CATALOG["INVALID_TOKEN"]
        return _envelope(message, None, status)

    if isinstance(exc, drf_exceptions.PermissionDenied):
        status, message = ERROR_CATALOG["FORBIDDEN"]
        return _envelope(message, None, status)

    if isinstance(exc, drf_exceptions.ParseError):
        return _envelope(VALIDATION_FAILED_MESSAGE, None, 400)

    if isinstance(exc, (Http404, drf_exceptions.NotFound)):
        return _envelope("Không tìm thấy tài nguyên", None, 404)

    if isinstance(exc, drf_exceptions.MethodNotAllowed):
        return _envelope("Phương thức không được hỗ trợ", None, 405)

    if isinstance(exc, drf_exceptions.UnsupportedMediaType):
        return _envelope(VALIDATION_FAILED_MESSAGE, None, 415)

    if isinstance(exc, drf_exceptions.Throttled):
        return _envelope("Quá nhiều yêu cầu", None, 429)

    logger.exception("Unhandled error while processing request", exc_info=exc)
    return _envelope(INTERNAL_SERVER_ERROR_MESSAGE, None, 500)
