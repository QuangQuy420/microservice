# Smart Eyewear — Architecture Overview

Smart Eyewear is a **microservices** e-commerce system for eyeglasses with face-based
recommendation and virtual try-on. It runs **locally only** via Docker Compose.

Monorepo, split-ready: 8 service folders + `infra/`. Compose project `smart-eyewear`, orchestrated by `infra/docker-compose.yml`.

`user-service` (Django + DRF) and `order-service` (FastAPI) follow the behavioral specs in `user-service-spec.md` / `order-service-spec.md`; all services integrate over the shared contracts in `infra/contracts/`.

## Style & principles

- **Monorepo, split-ready** — sibling service folders, each with its own Dockerfile and CI config, so a future polyrepo split is a folder-by-folder extraction, not a rewrite.
- **API-first** — every service publishes its contract under `infra/contracts` (OpenAPI for REST, a dedicated doc for the saga events).
- **Database-per-service** — services never share tables; they integrate over APIs and events.
- **North-South vs East-West** — all external traffic enters via the API Gateway; internal traffic is REST (sync) for reads plus RabbitMQ for the checkout saga.

## Service inventory

| Service | Stack | Internal port | Store | Responsibility |
|---|---|---|---|---|
| api-gateway | NestJS 11 (Node 24) | 8080 (published) | none | Single entry point: routing, CORS, edge JWT verification (`JwtGuard`), live permission checks (`PermissionsGuard`) |
| user-service | Django + DRF | 3001 | Postgres `auth_db` | Register/login, JWT issuance, RBAC, profile, addresses, password reset |
| product-service | NestJS 11 + TypeORM | 3002 | Postgres `product_db` + MinIO `product-images` | Catalog: brands, categories, products, variants, images, stock reservations |
| order-service | FastAPI + SQLAlchemy | 3003 | Postgres `order_db` + Redis (cart) | Redis cart, checkout saga orchestrator, orders, saga logs, reconciliation job |
| payment-service | NestJS 11 + TypeORM | 3004 | Postgres `payment_db` | Message-driven mock payment provider (CARD success/fail vs `PAYMENT_MIN_CARD_AMOUNT`) |
| face-processing-service | FastAPI + MediaPipe + SQLAlchemy async | 8000 | Postgres `face_processing_db` + MinIO `face-images` | Face landmark analysis → face shape classification |
| recommendation-service | FastAPI + httpx | 8000 | none (stateless) | Face shape → ranked frames (static scoring table) |
| web | Next.js 16 App Router + React 19 | 3000 (published) | none | Storefront + admin dashboard + in-browser virtual try-on |

Face shape taxonomy (shared): `ROUND | SQUARE | OVAL | HEART | DIAMOND | OBLONG`.
Frame shape taxonomy (distinct): `ROUND | SQUARE | OVAL | CAT_EYE | AVIATOR | RECTANGLE | WAYFARER | RIMLESS`.

## Request flow (happy path)

```
browser → api-gateway → user-service          (login → JWT)
browser → api-gateway → product-service       (browse)
browser → api-gateway → face-processing-service   (upload photo → landmarks → face shape)   → S3/MinIO
browser → api-gateway → recommendation-service    (face shape → ranked products)             → product-service
browser (client-side)                         (virtual try-on AR with MediaPipe + Canvas/Three.js)
browser → api-gateway → order-service         (cart in Redis → checkout → order)             → product-service, payment-service
```

## Infrastructure

- **Postgres 16** — one server, database-per-service: `auth_db, product_db, order_db, payment_db, face_processing_db` (created by `infra/scripts/init-multiple-dbs.sh`).
- **Redis 7** — order-service cart only.
- **MinIO** — buckets `face-images` (private, presigned URLs), `product-images`. Each service distinguishes in-network endpoint vs public endpoint for browser-facing URLs.
- **RabbitMQ 3** (management UI :15672). **No Kafka** (ADR `infra/docs/adr/0002`).
- Migrations: Django migrations (user-service), Alembic (order-service, face-processing-service), TypeORM CLI (product/payment).
- Service discovery: none — Docker Compose DNS.
- Observability: none (only /health endpoints, Swagger, RabbitMQ UI, saga log table). ← improvement candidate.

## Communication

- **North-South**: web → api-gateway → services (REST). payment-service is NOT routed through the gateway.
- **East-West REST**: order-service → product-service (`GET /products/{id}`, authoritative prices at checkout); recommendation-service → product-service; api-gateway → user-service `/internal/v1/users/{userId}/permissions` (header `X-Internal-Key`).
- **Events (RabbitMQ)**:
  - Exchange `product-events` (topic): `product.updated`, `product.deleted` — publish-only PoC, no consumer.
  - Exchange `order-saga-events` (topic) — checkout saga, contract in `infra/contracts/order-checkout-saga.md`:

| Routing key | Publisher | Consumer |
|---|---|---|
| `stock.reserve.requested` | order-service | product-service |
| `stock.reserved` | product-service | order-service |
| `stock.reserve.rejected` | product-service | order-service |
| `payment.create.requested` | order-service | payment-service |
| `payment.completed` | payment-service | order-service + product-service |
| `payment.failed` | payment-service | order-service |
| `stock.release.requested` | order-service | product-service (compensating) |

Queues (durable quorum, DLX `order-saga-events.dlx` → `order-saga-events.dlq`, `x-delivery-limit=${SAGA_QUEUE_DELIVERY_LIMIT:-10}`):
`order-saga-events.order-service`, `product-service.order-saga-events`, `payment-service.order-saga-events`.

Envelope: JSON `{orderId, occurredAt}` + per-key fields; at-least-once delivery — consumers must be idempotent (status guards).

## Auth flow

1. user-service issues JWT (HMAC; secret is **Base64-decoded** before use as key — 64 raw bytes → HS512). Claims: `sub`=username, `userId`, `email`, `iat`, `exp`. No role/permission claims.
2. api-gateway `JwtGuard` verifies with `Buffer.from(JWT_SECRET, 'base64')`, attaches `{userId, email}`.
3. `PermissionsGuard` calls user-service `GET /internal/v1/users/{userId}/permissions` fresh on every gated request (no cache) — role changes apply instantly.
4. Identity propagation: userId in URL path (order-service) or `X-User-Id` header (face-processing, order-service admin). No signed identity header.
5. web stores token in localStorage (`accessToken`). No refresh token.

Permission codes: `product:manage`, `role:manage`, `user:manage-roles`, `order:manage`, `saga-settings:manage`, `catalog:manage`. Roles: `CUSTOMER`, `ADMIN`. Seeded admin: `admin` / `Admin@123`.

## Cross-cutting decisions (ADRs)

- **Event bus technology** — RabbitMQ, chosen over Kafka/NATS: `infra/docs/adr/0002-event-bus-selection.md`.
- **Contract sharing** — `infra/contracts` consumed as a versioned copy inside the monorepo: `infra/docs/adr/0001-contract-sharing-mechanism.md`.
- **JWT verification** — the gateway verifies at the edge; downstream services trust gateway-injected identity (see Auth flow above).
- **Face image storage** — S3 API, local via MinIO; private bucket + presigned URLs.

## Layered design (per backend service)

`routes (controller) → services (business) → repositories (data access) → db`, wired with
dependency injection. See the root `README.md` for the full diagram and SOLID notes.

## Env var conventions

- `JWT_SECRET` must be identical (valid Base64, ≥32 raw bytes) in api-gateway and user-service.
- `INTERNAL_API_KEY` identical in api-gateway and user-service.
- `SAGA_QUEUE_DELIVERY_LIMIT` identical across order/product/payment services.
- `NEXT_PUBLIC_API_BASE_URL` must be a Compose build arg (inlined at build time).

## Conventions

- All user-facing messages are Vietnamese (clients assert on them — keep byte-identical).
- Scope is local-only: no k8s, no cloud, no HTTPS. "Deploy" = `docker compose up`.
- Catalog seeding is manual: `infra/seed/products.json` via product-service seed script.

## Known local-only constraints

- **Webcam** (`getUserMedia`) only works on `localhost`/HTTPS → open the web app at `http://localhost:3000`.
- **MediaPipe in Docker** — wheels are architecture-sensitive (x86 vs Apple Silicon); pin a known-good base image / use `platform: linux/amd64` if needed.
