"""Domain error types + the unified error envelope shared by every service.

Envelope: `{"error": {"code", "message", "details"?}}` — `code` is the stable,
machine-readable key the web app translates into the user's language, `message` is a
developer-facing English fallback, and `details` (validation only) is ALWAYS
`{field: [messages]}` so consumers get one shape everywhere.

Routers raise an `ApiError` subclass (status comes from the class, `code`/`message`
from the call site); the handlers registered here are the only place a body is shaped.
"""
import logging
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

# Codes for HTTPExceptions raised by the framework itself (unknown route, wrong method,
# ...) — errors this service raises always carry their own code via `ApiError`.
_STATUS_CODES = {
    400: "MALFORMED_REQUEST",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_ERROR",
}


class ApiError(Exception):
    """A failure that maps 1:1 to an error response: HTTP status (from the subclass)
    plus a stable `code` and an English `message` from the raising call site."""

    status_code = 500

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class BadRequestError(ApiError):
    """400 — the request itself is broken (missing/malformed header, unparseable body)."""

    status_code = 400


class NotFoundError(ApiError):
    status_code = 404


class UnprocessableError(ApiError):
    """422 — the request is well-formed but its values fail validation or domain rules."""

    status_code = 422


def error_body(
    code: str, message: str, details: dict[str, list[str]] | None = None
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error}


def _is_path_only(exc: RequestValidationError) -> bool:
    """True when EVERY error comes from a URL path param (e.g. a non-UUID `analysis_id`).

    A broken path is a broken request, not a values-failed-validation one: it maps to
    400 `MALFORMED_REQUEST`, while body/query/header/file errors stay 422 (decision 7).
    """
    errors = exc.errors()
    return bool(errors) and all(
        (err.get("loc") or (None,))[0] == "path" for err in errors
    )


def _details_per_field(exc: RequestValidationError) -> dict[str, list[str]]:
    """Group pydantic errors into `{field: [messages]}` — every field keeps ALL of its
    messages, as arrays (one shape for every service)."""
    details: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = [
            str(part)
            for part in err.get("loc", [])
            if part not in ("body", "query", "path", "header")
        ]
        field = ".".join(loc) if loc else "request"
        details.setdefault(field, []).append(err.get("msg", ""))
    return details


def register_exception_handlers(app: FastAPI) -> None:
    """Wire every failure path onto the error envelope. Called from `app/main.py`."""

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=error_body(exc.code, exc.message)
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        if _is_path_only(exc):
            return JSONResponse(
                status_code=400,
                content=error_body("MALFORMED_REQUEST", "Malformed request path."),
            )
        return JSONResponse(
            status_code=422,
            content=error_body("VALIDATION_ERROR", "Invalid input", _details_per_field(exc)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(_STATUS_CODES.get(exc.status_code, "HTTP_ERROR"), message),
        )

    @app.exception_handler(ClientError)
    @app.exception_handler(BotoCoreError)
    async def _storage_error(request: Request, exc: Exception) -> JSONResponse:
        """S3/MinIO failure while uploading or presigning (delete failures are already
        swallowed in `FaceAnalysisService`) — the request is fine, the dependency is not."""
        logger.exception("Object storage error on %s", request.url.path)
        return JSONResponse(
            status_code=502,
            content=error_body("STORAGE_ERROR", "Image storage is currently unavailable."),
        )

    @app.exception_handler(Exception)
    async def _unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content=error_body("INTERNAL_ERROR", "Internal server error."),
        )
