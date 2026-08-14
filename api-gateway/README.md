# api-gateway

**API Gateway — the single North-South entry point.** All browser traffic enters here;
the gateway routes to internal services, centralizes CORS, verifies JWT at the edge, and
applies rate-limiting.

> ✅ **Language: NestJS + TypeScript** (locked in). Scaffolded and building.

## Responsibilities
- Route incoming `/api/*` traffic to the matching internal service (East-West REST).
  `payment-service` is internal-only and not routed here.
- Central CORS, `/health`, rate-limit.
- Edge JWT verification (then forward identity to internal services — see ADR on JWT).

### Route table

| Route | Downstream service | Status |
|---|---|---|
| `/api/products/*`, `/api/categories/*`, `/api/brands/*` | `product-service` | **Implemented** — public reads are proxied via `HttpService`; writes require JWT and the matching live permission (`product:manage` or `catalog:manage`) |
| `/api/auth/*`, `/api/users/*`, `/api/roles/*`, `/api/permissions` | `user-service` (Django) | **Implemented** — auth is public; users/roles/addresses require JWT; role/user management requires `role:manage` / `user:manage-roles` |
| `/api/cart/*`, `/api/orders/*`, `/api/admin/orders/*`, `/api/admin/saga-logs/*`, `/api/admin/saga-settings` | `order-service` (FastAPI) | **Implemented** — JWT required; admin routes require `order:manage` / `saga-settings:manage`; gateway injects `userId` (path) or `X-User-Id` |
| `/api/face-analysis/*` | `face-processing-service` | **Implemented** — JWT required; gateway forwards `X-User-Id` |
| `/api/recommendations` | `recommendation-service` | **Implemented** — proxied to `/recommend` |

> Public catalog reads remain unauthenticated. Product writes require `product:manage`; Brand
> and Category writes require `catalog:manage`. The gateway verifies JWTs at the edge and checks
> the caller's current permissions with `user-service` before forwarding a write.

## Structure
```
src/
  routes/        # route definitions + proxy mapping (one place per downstream service)
  services/      # forwarding / proxy clients, JWT verification, rate-limit policy
  middlewares/   # CORS, auth guard, error handler, logging
  config/        # DI wiring, env config, downstream service URLs
tests/
```
> The gateway has **no repository/db layer** — it owns no data; it only proxies.

## Env
See [`.env.example`](.env.example). Downstream service URLs are injected via env.
