"""httpx client for product-service.

- 5 s total timeout
- 2 transport-level retries (connect errors only — safe to retry)

Error mapping is byte-identical to §7 of the spec.
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
            raise BadGatewayError(messages.PRODUCT_CLIENT_CONNECT)

        if response.status_code == 404:
            raise NotFoundError(messages.PRODUCT_CLIENT_NOT_FOUND.format(id=product_id))
        if 400 <= response.status_code < 500:
            raise BadGatewayError(
                messages.PRODUCT_CLIENT_4XX.format(code=response.status_code)
            )
        if response.status_code >= 500:
            raise BadGatewayError(messages.PRODUCT_CLIENT_5XX)

        if not response.content:
            raise BadGatewayError(messages.PRODUCT_CLIENT_EMPTY)
        try:
            # parse_float=Decimal keeps prices exact (never through float)
            data = json.loads(response.text, parse_float=Decimal)
        except ValueError:
            raise BadGatewayError(messages.PRODUCT_CLIENT_EMPTY)
        if data is None:
            raise BadGatewayError(messages.PRODUCT_CLIENT_EMPTY)
        return data
