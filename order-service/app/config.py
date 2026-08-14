"""Environment-driven configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    port: int = 8083
    database_url: str = "postgresql://app:app@localhost:5432/order_db"
    redis_url: str = "redis://localhost:6379"
    rabbitmq_host: str = "localhost"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "guest"
    rabbitmq_password: str = "guest"
    product_service_url: str = "http://product-service:3002"
    saga_queue_delivery_limit: int = 10
    saga_chaos_mode: str = "NONE"  # NONE | STUCK_STOCK_RESERVE | STUCK_PAYMENT | FORCE_DEAD_LETTER

    @classmethod
    def from_env(cls) -> "Settings":
        def _int(name: str, default: int) -> int:
            raw = os.getenv(name)
            try:
                return int(raw) if raw else default
            except ValueError:
                return default

        return cls(
            port=_int("PORT", 8083),
            database_url=os.getenv("DATABASE_URL", cls.database_url),
            redis_url=os.getenv("REDIS_URL", cls.redis_url),
            rabbitmq_host=os.getenv("RABBITMQ_HOST", cls.rabbitmq_host),
            rabbitmq_port=_int("RABBITMQ_PORT", 5672),
            rabbitmq_user=os.getenv("RABBITMQ_USER", cls.rabbitmq_user),
            rabbitmq_password=os.getenv("RABBITMQ_PASSWORD", cls.rabbitmq_password),
            product_service_url=os.getenv("PRODUCT_SERVICE_URL", cls.product_service_url),
            saga_queue_delivery_limit=_int("SAGA_QUEUE_DELIVERY_LIMIT", 10),
            saga_chaos_mode=os.getenv("SAGA_CHAOS_MODE", "NONE").strip() or "NONE",
        )

    @property
    def sqlalchemy_url(self) -> str:
        """Use the psycopg 3 driver for postgresql:// URLs."""
        url = self.database_url
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def rabbitmq_url(self) -> str:
        return (
            f"amqp://{self.rabbitmq_user}:{self.rabbitmq_password}"
            f"@{self.rabbitmq_host}:{self.rabbitmq_port}/"
        )
