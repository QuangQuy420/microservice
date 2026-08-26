"""FastAPI entrypoint — app instance, router mounting, unified error envelope.

Every failure leaves this service as `{"error": {"code", "message", "details"?}}` with an
English message; success bodies are `{"data": ...}` (built by the routers). `GET /health`
stays a raw `{"status": "ok"}` so ops probes don't have to unwrap an envelope.
"""
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.routers.recommend import router as recommend_router

app = FastAPI(title="recommendation-service")

app.include_router(recommend_router)


# Codes that deliberately differ from the HTTP reason phrase used as the default below.
_CODE_BY_STATUS: dict[int, str] = {
    400: "MALFORMED_REQUEST",
    500: "INTERNAL_ERROR",
}


def _default_code(status_code: int) -> str:
    """`error.code` for exceptions raised without one (framework 404/405, ...)."""
    override = _CODE_BY_STATUS.get(status_code)
    if override is not None:
        return override
    try:
        return HTTPStatus(status_code).phrase.upper().replace(" ", "_")
    except ValueError:  # non-standard status — keep a stable, generic code
        return "HTTP_ERROR"


def _error_response(
    status_code: int,
    code: str,
    message: str,
    details: dict[str, list[str]] | None = None,
) -> JSONResponse:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JSONResponse(status_code=status_code, content={"error": error})


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Routers raise `HTTPException(detail={"code": ..., "message": ...})` when they have a
    business code; framework-raised ones (unknown route, wrong method) get a status-derived
    code and keep their plain-string detail as the message."""
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code", _default_code(exc.status_code)))
        message = str(exc.detail.get("message", ""))
    else:
        code = _default_code(exc.status_code)
        message = str(exc.detail)
    return _error_response(exc.status_code, code, message)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """422 `VALIDATION_ERROR` with `details` as arrays of messages per field; a body that
    isn't parseable JSON at all is a broken request, so it answers 400 `MALFORMED_REQUEST`."""
    errors = exc.errors()
    if any(error.get("type") == "json_invalid" for error in errors):
        return _error_response(400, "MALFORMED_REQUEST", "Request body is not valid JSON")

    details: dict[str, list[str]] = {}
    for error in errors:
        # loc[0] is the location ("body"/"query"/...); the rest is the field path.
        field = ".".join(str(part) for part in error["loc"][1:]) or "body"
        details.setdefault(field, []).append(error["msg"])
    return _error_response(422, "VALIDATION_ERROR", "Invalid input", details)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all so an unexpected failure still leaves as the envelope, never a bare 500."""
    return _error_response(500, "INTERNAL_ERROR", "Internal server error")
