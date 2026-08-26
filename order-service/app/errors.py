"""Domain errors + the exact error envelope of the public contract.

Envelope: {"error": {"code", "message", "details"?}} — `details` is only present
when there are field errors, and its values are ALWAYS arrays of strings.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import messages
from app.json_utils import VNJSONResponse

logger = logging.getLogger(__name__)

# Codes for errors raised by the framework itself (no ApiError to carry one).
_STATUS_CODES = {
    400: "MALFORMED_REQUEST",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
}


class ApiError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, list[str]] | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.details = details
        if code is not None:
            self.code = code


class BadRequestError(ApiError):
    status_code = 400
    code = "BAD_REQUEST"


class NotFoundError(ApiError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(ApiError):
    status_code = 409
    code = "CONFLICT"


class BadGatewayError(ApiError):
    status_code = 502
    code = "BAD_GATEWAY"


class MissingHeaderError(BadRequestError):
    code = "MISSING_HEADER"

    def __init__(self, header_name: str):
        super().__init__(messages.MISSING_HEADER.format(name=header_name))


def error_body(
    code: str,
    message: str,
    details: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    return {"error": error}


def _errors_per_field(exc: RequestValidationError) -> dict[str, list[str]]:
    """Map pydantic errors to {field: [message, ...]} (ALL errors per field)."""
    result: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", []) if part not in ("body", "query", "path", "header")]
        field = ".".join(loc) if loc else "request"
        msg = err.get("msg", "")
        # pydantic wraps ValueError messages as "Value error, <msg>" — unwrap to get
        # the message raised by our field validators.
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        result.setdefault(field, []).append(msg)
    return result


def _is_malformed_body(exc: RequestValidationError) -> bool:
    """An unparseable JSON body reaches us as a RequestValidationError too —
    that is a broken request (400), not a validation failure (422)."""
    return any(err.get("type") == "json_invalid" for err in exc.errors())


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return VNJSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        if _is_malformed_body(exc):
            return VNJSONResponse(
                status_code=400,
                content=error_body("MALFORMED_REQUEST", messages.MALFORMED_JSON),
            )
        return VNJSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR", messages.VALIDATION_FAILED, _errors_per_field(exc)
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return VNJSONResponse(
            status_code=exc.status_code,
            content=error_body(
                _STATUS_CODES.get(exc.status_code, "ERROR"), message
            ),
        )

    @app.exception_handler(Exception)
    async def _unexpected_error(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s", request.url.path)
        return VNJSONResponse(
            status_code=500,
            content=error_body("INTERNAL_ERROR", messages.INTERNAL_ERROR),
        )
