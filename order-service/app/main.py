from __future__ import annotations

import asyncio
import contextlib
import logging

from dotenv import load_dotenv
from fastapi import FastAPI

from app.config import Settings
from app.database import make_engine, make_sessionmaker
from app.errors import register_exception_handlers
from app.repositories.cart_repository import CartRepository
from app.routers import admin_orders, carts, health, orders, saga_logs, saga_settings
from app.services.product_client import ProductClient

logger = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None,
    *,
    sessionmaker=None,
    cart_repo: CartRepository | None = None,
    product_client: ProductClient | None = None,
    start_background: bool = True,
) -> FastAPI:
    """App factory. Tests pass their own sessionmaker / cart_repo /
    product_client and start_background=False (no broker, no Redis, no
    Postgres needed)."""
    settings = settings or Settings.from_env()

    lifespan = _make_lifespan(settings) if start_background else None
    app = FastAPI(title="order-service", lifespan=lifespan)
    app.state.settings = settings

    if sessionmaker is not None:
        app.state.sessionmaker = sessionmaker
    else:
        engine = make_engine(settings.sqlalchemy_url)
        app.state.engine = engine
        app.state.sessionmaker = make_sessionmaker(engine)

    if cart_repo is not None:
        app.state.cart_repo = cart_repo
    else:
        import redis

        app.state.cart_repo = CartRepository(redis.from_url(settings.redis_url))

    app.state.product_client = product_client or ProductClient(settings.product_service_url)

    register_exception_handlers(app)
    app.include_router(health.router)
    app.include_router(carts.router)
    app.include_router(orders.router)
    app.include_router(admin_orders.router)
    app.include_router(saga_logs.router)
    app.include_router(saga_settings.router)
    return app


def _make_lifespan(settings: Settings):
    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        from app.jobs.reconciliation import ReconciliationJob
        from app.messaging.consumer import SagaConsumer
        from app.messaging.outbox_relay import OutboxRelay
        from app.messaging.publisher import RabbitMqPublisher

        tasks: list[asyncio.Task] = []
        publisher = RabbitMqPublisher(settings.rabbitmq_url)
        consumer = SagaConsumer(
            settings.rabbitmq_url,
            app.state.sessionmaker,
            app.state.cart_repo,
            delivery_limit=settings.saga_queue_delivery_limit,
            chaos_mode=settings.saga_chaos_mode,
        )
        relay = OutboxRelay(
            app.state.sessionmaker,
            publisher.publish,
            chaos_mode=settings.saga_chaos_mode,
        )
        job = ReconciliationJob(app.state.sessionmaker)

        async def start_broker_side() -> None:
            # Keep retrying — a broker outage must never crash the service.
            while True:
                try:
                    await publisher.connect()
                    await consumer.start()
                    return
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception(
                        "RabbitMQ not reachable — retrying in 3s (outbox keeps buffering)"
                    )
                    await asyncio.sleep(3)

        tasks.append(asyncio.create_task(start_broker_side()))
        tasks.append(asyncio.create_task(relay.run_forever()))
        tasks.append(asyncio.create_task(job.run_forever()))
        logger.info(
            "order-service started (chaos_mode=%s, delivery_limit=%s)",
            settings.saga_chaos_mode,
            settings.saga_queue_delivery_limit,
        )
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            with contextlib.suppress(Exception):
                await consumer.close()
            with contextlib.suppress(Exception):
                await publisher.close()

    return lifespan


load_dotenv()
app = create_app()
