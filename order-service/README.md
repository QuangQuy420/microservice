# order-service (FastAPI)

FastAPI service. The external contract — paths, JSON keys, status codes,
byte-identical Vietnamese messages, and the RabbitMQ exchange/queue/routing-key
names and payload shapes — is defined by `docs/specs/order-service-spec.md` and
`infra/contracts/order-checkout-saga.md`; api-gateway, web, product-service and
payment-service depend on it.

Responsibilities: Redis cart, checkout saga orchestrator, orders + status
history, saga audit logs, reconciliation job.

## Run

Local (Python 3.13/3.14):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head          # needs DATABASE_URL (see .env)
.venv/bin/uvicorn app.main:app --port 3003
```

Docker (normal path — the compose file in `infra/` does this):

```bash
docker build -t order-service .
docker run --env-file .env -p 3003:3003 order-service
```

The container runs `alembic upgrade head` and then starts uvicorn on `$PORT`
(default 3003).

## Tests

The full suite runs **without any external infrastructure**:

- sqlite in-memory for the database
- fakeredis for the cart
- httpx `MockTransport` / an in-memory fake for the product-service client
- a fake publisher for outbox/messaging tests

```bash
.venv/bin/python -m pytest
```

## Env vars

| Env | Meaning | Default |
|---|---|---|
| `PORT` | HTTP port (Docker: 3003) | 8083 |
| `DATABASE_URL` | `postgresql://user:pass@host:port/order_db` | — |
| `REDIS_URL` | `redis://host:port` | `redis://localhost:6379` |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` / `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | broker | localhost / 5672 / guest / guest |
| `PRODUCT_SERVICE_URL` | product-service base URL | `http://product-service:3002` |
| `SAGA_QUEUE_DELIVERY_LIMIT` | quorum queue `x-delivery-limit` | 10 |
| `SAGA_CHAOS_MODE` | `NONE` / `STUCK_STOCK_RESERVE` / `STUCK_PAYMENT` / `FORCE_DEAD_LETTER` | `NONE` |

Timestamps are naive Asia/Ho_Chi_Minh local time in both the DB and JSON
(locked by the spec). Money is `Decimal` end-to-end (NUMERIC(19,2));
JSON responses render amounts as exact numbers (via simplejson), never through
float.

## Architecture: outbox + saga

```
POST /checkout ──▶ one DB transaction:
                     orders + order_items + history + saga log
                     + outbox_events row (stock.reserve.requested)
                                 │
              OutboxRelay (async task, ~1s poll)
                                 │  publish with retry + backoff
                                 ▼
                     RabbitMQ  order-saga-events (topic)
                                 │
        queue order-saga-events.order-service (quorum,
        DLX order-saga-events.dlx, x-delivery-limit)
   bindings: stock.reserved · stock.reserve.rejected ·
             payment.completed · payment.failed
                                 │
                   SagaConsumer (status-guarded, idempotent)
        stock.reserved   → AWAITING_PAYMENT + outbox payment.create.requested
        reserve.rejected → CANCELLED (no release — nothing was reserved)
        payment.completed→ CONFIRMED/PAID + remove paid items from cart
        payment.failed   → CANCELLED/FAILED + outbox stock.release.requested
        (late stock.reserved on a CANCELLED order → outbox stock.release.requested)
```

**Transactional outbox.** Every saga publish is first written to the
`outbox_events` table in the same transaction as the order change. The
background relay publishes pending rows to RabbitMQ and marks them published;
failures are retried with exponential backoff (max 60 s). So a broker outage
can delay events but never lose them, and checkout never returns 502 because
RabbitMQ is down.

**DLQ.** The consumer also owns `order-saga-events.dlq` (bound to the fanout
DLX). A dead-lettered message is logged as WARN and recorded as a
`DEAD_LETTERED` saga log for its order (best-effort).

**Reconciliation job.** Asyncio background loop with a ~10 s tick. It re-reads
`reconciliation_settings` from the DB on every tick (admin changes via
`PUT /api/v1/admin/saga-settings` apply live) and effectively runs every
`interval_ms`. Orders stuck in PENDING / AWAITING_PAYMENT past
`stuck_threshold_minutes` get their saga command resent through the outbox
(`RECONCILIATION_RESENT`); after `max_attempts` the order is auto-cancelled,
stock released, and marked exhausted (`RECONCILIATION_EXHAUSTED`).

**Chaos modes.** `STUCK_STOCK_RESERVE` / `STUCK_PAYMENT` make the outbox relay
silently drop the matching event (marked published, never sent) so you can
watch the reconciliation retries. `FORCE_DEAD_LETTER` makes every consumer
handler fail so redeliveries hit the delivery limit and land in the DLQ.

## Design decisions

1. **Transactional outbox** instead of direct in-request publishing: checkout
   commits the order and lets the relay deliver the event later, so a broker
   outage never turns into a 502 or a lost event. The `stock_release_pending`
   column is kept and the reconciliation job still honors it (legacy rows).
2. **Product client hardening**: 5 s timeout and 2 retries (connect errors
   only). Error messages follow spec §7.
3. **Admin cancel releases stock**: admin `PATCH → CANCELLED` from
   PENDING/AWAITING_PAYMENT publishes `stock.release.requested`, same as the
   user cancel flow.
4. **Test suite** runs fully offline (sqlite / fakeredis / mock transport /
   fake publisher), including consumer-idempotency coverage.
5. **Money is `Decimal` end-to-end** — never float, including JSON rendering.

Implementation notes (not behavior changes):

- Postgres driver is psycopg 3 (`postgresql://` URLs are rewritten to
  `postgresql+psycopg://` internally — the `.env` value stays unchanged).
- A single Alembic revision (`0001`) creates the full schema and seeds the
  `reconciliation_settings` row (60000 ms, 2 min, 3 attempts).
- The product-service 404 during cart/checkout flows uses the client-level
  message `"Không tìm thấy sản phẩm: <id>"` (spec §7).
