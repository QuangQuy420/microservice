"""Central DRF exception handler producing the error envelope for ALL
errors — business errors (ApiError), auth failures, permission failures,
validation errors and unexpected exceptions."""
import logging

from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response

from .errors import ERROR_CATALOG, ApiError
from .responses import error_response

logger = logging.getLogger(__name__)


def _catalog_error(code: str, details=None) -> Response:
    status, message = ERROR_CATALOG[code]
    return error_response(code, message, details, status)


def _message_list(detail) -> list[str]:
    """Flatten a DRF error detail (list/dict/str) into a list of strings."""
    if isinstance(detail, (list, tuple)):
        return [message for item in detail for message in _message_list(item)]
    if isinstance(detail, dict):
        return [message for value in detail.values() for message in _message_list(value)]
    return [str(detail)]


def _validation_details(detail) -> dict:
    """Map DRF validation detail to {"<field>": ["<message>", ...]}."""
    if isinstance(detail, dict):
        return {str(field): _message_list(messages) for field, messages in detail.items()}
    return {"non_field_errors": _message_list(detail)}


def api_exception_handler(exc, context) -> Response:
    if isinstance(exc, ApiError):
        return error_response(exc.code, exc.message, None, exc.http_status)

    if isinstance(exc, drf_exceptions.ValidationError):
        return _catalog_error("VALIDATION_ERROR", _validation_details(exc.detail))

    if isinstance(
        exc, (drf_exceptions.NotAuthenticated, drf_exceptions.AuthenticationFailed)
    ):
        return _catalog_error("INVALID_TOKEN")

    if isinstance(exc, drf_exceptions.PermissionDenied):
        return _catalog_error("FORBIDDEN")

    if isinstance(exc, drf_exceptions.ParseError):
        return _catalog_error("MALFORMED_REQUEST")

    if isinstance(exc, (Http404, drf_exceptions.NotFound)):
        return _catalog_error("NOT_FOUND")

    if isinstance(exc, drf_exceptions.MethodNotAllowed):
        return _catalog_error("METHOD_NOT_ALLOWED")

    if isinstance(exc, drf_exceptions.UnsupportedMediaType):
        return _catalog_error("UNSUPPORTED_MEDIA_TYPE")

    if isinstance(exc, drf_exceptions.Throttled):
        return _catalog_error("THROTTLED")

    logger.exception("Unhandled error while processing request", exc_info=exc)
    return _catalog_error("INTERNAL_ERROR")
