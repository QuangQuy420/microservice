"""JSON rendering that keeps money exact.

FastAPI's default serialization turns Decimal into float. Money must stay exact
(NUMERIC(19,2) semantics), so all responses and outbox payloads are rendered with
simplejson's native Decimal support: Decimal values are emitted as plain JSON
numbers with their exact digits, never through float.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

import simplejson
from starlette.responses import Response


def json_default(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, Enum):
        return obj.value
    raise TypeError(f"Object of type {type(obj)!r} is not JSON serializable")


def dumps(content: Any) -> str:
    return simplejson.dumps(
        content, use_decimal=True, default=json_default, ensure_ascii=False
    )


def loads(raw: str | bytes) -> Any:
    """Parse JSON with numbers-with-fraction as Decimal (exact money round-trip)."""
    return simplejson.loads(raw, use_decimal=True)


class VNJSONResponse(Response):
    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        if content is None:
            return b""
        return dumps(content).encode("utf-8")
