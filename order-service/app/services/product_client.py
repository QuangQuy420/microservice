"""httpx client for product-service.

- 5 s total timeout
- 2 transport-level retries (connect errors only — safe to retry)
- success bodies arrive enveloped as {"data": ...} and are unwrapped here

Error mapping follows §7 of the spec.
"""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import httpx

from app import messages
from app.errors import BadGatewayError, NotFoundError

TIMEOUT_SECONDS = 5.0
CONNECT_RETRIES = 2


class ProductClient:
    def __init__(self, base_url: str, client: httpx.Client | None = None):
        self._client = client or httpx.Client(
            base_url=base_url,
            timeout=TIMEOUT_SECONDS,
            transport=httpx.HTTPTransport(retries=CONNECT_RETRIES),
        )

    def close(self) -> None:
        self._client.close()

    def get_product(self, product_id: str) -> dict[str, Any]:
        try:
            response = self._client.get(f"/products/{product_id}")
        except httpx.HTTPError:
            raise BadGatewayError(
                messages.PRODUCT_CLIENT_CONNECT, code="PRODUCT_SERVICE_UNAVAILABLE"
            )

        if response.status_code == 404:
            raise NotFoundError(
                messages.PRODUCT_CLIENT_NOT_FOUND.format(id=product_id),
                code="PRODUCT_NOT_FOUND",
            )
        if 400 <= response.status_code < 500:
            raise BadGatewayError(
                messages.PRODUCT_CLIENT_4XX.format(code=response.status_code),
                code="PRODUCT_SERVICE_ERROR",
            )
        if response.status_code >= 500:
            raise BadGatewayError(messages.PRODUCT_CLIENT_5XX, code="PRODUCT_SERVICE_ERROR")

        if not response.content:
            raise BadGatewayError(messages.PRODUCT_CLIENT_EMPTY, code="PRODUCT_SERVICE_ERROR")
        try:
            # parse_float=Decimal keeps prices exact (never through float)
            body = json.loads(response.text, parse_float=Decimal)
        except ValueError:
            raise BadGatewayError(messages.PRODUCT_CLIENT_EMPTY, code="PRODUCT_SERVICE_ERROR")
        # product-service wraps every success in {"data": ...} — unwrap it here so
        # callers keep seeing a plain product dict.
        product = body.get("data") if isinstance(body, dict) else None
        if product is None:
            raise BadGatewayError(messages.PRODUCT_CLIENT_EMPTY, code="PRODUCT_SERVICE_ERROR")
        return product
