"""Redis cart store — key `cart:<userId>`, JSON value, TTL 7 days (reset on save)."""
from __future__ import annotations

from typing import Any

from app.json_utils import dumps, loads

CART_TTL_SECONDS = 7 * 24 * 60 * 60


class CartRepository:
    def __init__(self, redis_client: Any):
        self._redis = redis_client

    @staticmethod
    def _key(user_id: str) -> str:
        return f"cart:{user_id}"

    def load(self, user_id: str) -> dict | None:
        raw = self._redis.get(self._key(user_id))
        if raw is None:
            return None
        return loads(raw)

    def save(self, user_id: str, cart: dict) -> None:
        self._redis.set(self._key(user_id), dumps(cart), ex=CART_TTL_SECONDS)

    def delete(self, user_id: str) -> None:
        self._redis.delete(self._key(user_id))
