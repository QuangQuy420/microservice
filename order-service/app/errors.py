"""Domain errors + the exact error envelope of the public contract.

Envelope: {timestamp, status, error, message, path, validationErrors}
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import messages
from app.json_utils import VNJSONResponse
from app.time_utils import now_vn

logger = logging.getLogger(__name__)

_REASON_PHRASES = {
    400: "Bad Request",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    500: "Internal Server Error",
    502: "Bad Gateway",
}


class ApiError(Exception):
    status_code = 500

    def __init__(self, message: str, validation_errors: dict[str, str] | None = None):
        super().__init__(message)
        self.message = message
        self.validation_errors = validation_errors


class BadRequestError(ApiError):
    status_code = 400


class NotFoundError(ApiError):
    status_code = 404


class ConflictError(ApiError):
    status_code = 409


class BadGatewayError(ApiError):
    status_code = 502


class MissingHeaderError(BadRequestError):
    def __init__(self, header_name: str):
        super().__init__(messages.MISSING_HEADER.format(name=header_name))


def error_body(
    status: int,
    message: str,
    path: str,
    validation_errors: dict[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "timestamp": now_vn().isoformat(),
        "status": status,
        "error": _REASON_PHRASES.get(status, "Error"),
        "message": message,
        "path": path,
        "validationErrors": validation_errors,
    }


def _first_error_per_field(exc: RequestValidationError) -> dict[str, str]:
    """Map pydantic errors to {field: firstMessage} (first error per
    field wins)."""
    result: dict[str, str] = {}
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", []) if part not in ("body", "query", "path", "header")]
        field = ".".join(loc) if loc else "request"
        if field in result:
            continue
        msg = err.get("msg", "")
        # pydantic wraps ValueError messages as "Value error, <msg>" — unwrap to get
        # the Vietnamese message raised by our field validators.
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        result[field] = msg
    return result


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return VNJSONResponse(
            status_code=exc.status_code,
            content=error_body(
                exc.status_code, exc.message, request.url.path, exc.validation_errors
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        return VNJSONResponse(
            status_code=400,
            content=error_body(
                400,
                messages.VALIDATION_FAILED,
                request.url.path,
                _first_error_per_field(exc),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return VNJSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.status_code, message, request.url.path),
        )

    @app.exception_handler(Exception)
    async def _unexpected_error(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s", request.url.path)
        return VNJSONResponse(
            status_code=500,
            content=error_body(500, messages.INTERNAL_ERROR, request.url.path),
        )
