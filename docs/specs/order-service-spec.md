# order-service — Functional Specification

The implementation must match every externally visible detail (paths, JSON keys, status codes, the response envelope, the machine-readable `error.code` values, RabbitMQ contract) because api-gateway, web, product-service and payment-service depend on them. Human-readable text is **English** and developer-facing only — clients translate by `error.code` and author their own success messages; the exact English wording is a fallback, not a frozen contract.

Stack: FastAPI, Postgres (Alembic), Redis (cart), RabbitMQ.

## 1. Config / env

| Env | Meaning | Default |
|---|---|---|
| `PORT` | HTTP port (Docker: 3003) | 8083 local |
| `DATABASE_URL` | `postgresql://user:pass@host:port/order_db` | — |
| `REDIS_URL` | redis://host:port | localhost:6379 (Docker) |
| `RABBITMQ_HOST/PORT/USER/PASSWORD` | broker | localhost/5672/guest/guest |
| `PRODUCT_SERVICE_URL` | base URL | `http://product-service:3002` |
| `SAGA_QUEUE_DELIVERY_LIMIT` | quorum queue x-delivery-limit | 10 |
| `SAGA_CHAOS_MODE` | NONE / STUCK_STOCK_RESERVE / STUCK_PAYMENT / FORCE_DEAD_LETTER | NONE |

Timezone: timestamps in DB and JSON are **naive local VN time** (`Asia/Ho_Chi_Minh`). Keep this behavior — clients depend on it, and saga log day grouping does `occurred_at::date`.

Cart: Redis key `cart:<userId>`, JSON value, TTL 7 days (reset on each save).

## 2. Data model (Postgres `order_db`)

### orders
`id` UUID PK · `order_code` VARCHAR(50) UNIQUE (`ORD-<epochMillis>-<6 upper hex>`) · `user_id` UUID idx · `total_amount` NUMERIC(19,2) ≥0 · `status` VARCHAR(30) CHECK · `payment_id` UUID NULL · `transaction_code` VARCHAR(100) NULL · `payment_method` VARCHAR(30) NULL · `payment_status` VARCHAR(30) DEFAULT 'UNPAID' CHECK · `receiver_name` VARCHAR(150) · `receiver_phone` VARCHAR(20) · `shipping_address` VARCHAR(500) · `note` VARCHAR(1000) NULL · `created_at`, `updated_at` · `reconciliation_attempts` INT DEFAULT 0 · `last_reconciliation_attempt_at` NULL · `reconciliation_exhausted` BOOL DEFAULT FALSE · `stock_release_pending` BOOL DEFAULT FALSE.

### order_items
`id` UUID PK · `order_id` FK CASCADE · `product_id` UUID · `variant_id` UUID · `product_name` VARCHAR(255) · `sku_variant` VARCHAR(100) NULL · `color` VARCHAR(100) NULL · `color_hex` VARCHAR(7) NULL · `size` VARCHAR(100) NULL · `product_image_url` VARCHAR(1000) NULL · `unit_price` NUMERIC(19,2) ≥0 · `quantity` INT >0 · `subtotal` NUMERIC(19,2) = unit_price*quantity.

### order_status_histories
`id` · `order_id` FK · `status` VARCHAR(30) · `changed_by` UUID NULL · `note` VARCHAR(1000) NULL · `changed_at` (default now).

### order_saga_logs
`id` · `order_id` FK · `stage` VARCHAR(40) · `level` VARCHAR(10) · `message` VARCHAR(1000) · `source_service` VARCHAR(20) · `target_service` VARCHAR(20) NULL · `error_detail` VARCHAR(1000) NULL · `retry_count` INT NULL · `occurred_at` (default now, idx).

### reconciliation_settings (single row, seeded: 60000, 2, 3)
`id` · `interval_ms` INT · `stuck_threshold_minutes` INT · `max_attempts` INT · `updated_at` · `updated_by` UUID NULL.

### Enums
- OrderStatus: `PENDING, AWAITING_PAYMENT, CONFIRMED, PROCESSING, SHIPPING, DELIVERED, COMPLETED, CANCELLED`
- PaymentStatus: `UNPAID, PENDING, PAID, FAILED, CANCELLED, REFUNDED`
- SagaLogStage: `CREATED, STOCK_RESERVE_REQUESTED, STOCK_RESERVED, STOCK_RESERVE_REJECTED, PAYMENT_CREATE_REQUESTED, PAYMENT_COMPLETED, PAYMENT_FAILED, STOCK_RELEASE_REQUESTED, RECONCILIATION_RESENT, RECONCILIATION_EXHAUSTED, DEAD_LETTERED`
- SagaLogLevel: `INFO, WARN`; SagaLogService: `ORDER_SERVICE, PRODUCT_SERVICE, PAYMENT_SERVICE, MESSAGE_BROKER`

### Cart (Redis JSON)
Cart: `userId`, `items[]`, `createdAt`, `updatedAt`; derived `totalQuantity`, `totalAmount`.
CartItem: `productId, variantId, productName, skuVariant, color, colorHex, size, productImageUrl, basePrice, extraPrice, unitPrice, quantity`; derived `subtotal = unitPrice*quantity`.

## 3. Response envelope & errors

One envelope for every response (health excepted):

| Case | Status | Body |
|---|---|---|
| Success, single resource | 200 / 201 | `{"data": <object｜null>}` |
| Success, unpaginated list | 200 | `{"data": [ ... ]}` |
| Success, paginated list | 200 | `{"data": [ ... ], "meta": {"page": 1, "pageSize": 20, "total": 128}}` |
| Success, no body | 204 | empty |
| Error | 4xx / 5xx | `{"error": {"code": "...", "message": "...", "details"?: {...}}}` |

- There is **no success `message` slot** — the client owns all success text.
- `error.code` is the stable machine-readable contract; `error.message` is an English developer-facing fallback (`app/messages.py`).
- `error.details` appears only when there are field errors and is always `{"<field>": ["<msg>", ...]}` — **all** messages for that field, always an array.
- A delete that has a useful body stays **200** with that body (`DELETE /carts/{userId}/items/{variantId}` → recomputed cart). A body-less delete is **204** (`DELETE /carts/{userId}`).
- Field validation → **422** `VALIDATION_ERROR`. An unparseable JSON body → **400** `MALFORMED_REQUEST` (`"Request body is not valid JSON"`); a malformed UUID in a path/header, or a bad `yyyy-MM-dd` path segment → **400** `MALFORMED_REQUEST` with `details`; a missing required header → **400** `MISSING_HEADER`. Business-rule failures keep **400** with their own code.
- **GET /health** → 200 raw `{"status": "UP"}` — deliberately not enveloped (ops probe).

Validation failure example:

```json
{"error": {"code": "VALIDATION_ERROR", "message": "Invalid request data",
           "details": {"receiverPhone": ["Phone number is invalid"]}}}
```

Error codes (`app/errors.py` + `app/messages.py` are authoritative):

| Code | HTTP | Message |
|---|---|---|
| VALIDATION_ERROR | 422 | Invalid request data |
| MALFORMED_REQUEST | 400 | Malformed request / Request body is not valid JSON |
| MISSING_HEADER | 400 | Missing required header: `<name>` |
| CART_EMPTY | 404 | Cart does not exist or is empty |
| CART_VARIANT_NOT_FOUND | 404 | Product variant is not in the cart |
| PRODUCT_NO_VARIANTS | 404 | Product has no variants |
| VARIANT_NOT_FOUND | 404 | Product variant not found |
| PRODUCT_NOT_PURCHASABLE | 400 | Product is not available for purchase |
| PRODUCT_NO_PRICE | 400 | Product has no price |
| PRODUCT_INVALID_PRICE | 400 | Product price is invalid |
| QUANTITY_OUT_OF_BOUNDS | 400 | Quantity must be between 1 and 99 |
| INSUFFICIENT_STOCK | 400 | Only `<n>` item(s) left in stock |
| CHECKOUT_ITEMS_NOT_IN_CART | 400 | Some selected products are not in the cart |
| PAGE_INVALID | 400 | Page must be 1 or greater |
| PAGE_SIZE_INVALID | 400 | Page size must be between 1 and 100 |
| INVALID_ORDER_STATUS | 400 | Invalid order status |
| ORDER_NOT_FOUND | 404 | Order not found |
| CANCEL_NOT_ALLOWED | 400 | Cannot cancel an order in status `<status>` |
| INVALID_STATUS_TRANSITION | 400 | Cannot change status from `<cur>` to `<target>` |
| SETTINGS_NOT_FOUND | 404 | No reconciliation settings have been initialized |
| PRODUCT_NOT_FOUND | 404 | Product not found: `<id>` |
| PRODUCT_SERVICE_UNAVAILABLE | 502 | Cannot connect to Product Service |
| PRODUCT_SERVICE_ERROR | 502 | Product Service rejected the request with status `<code>` / returned an error / returned an empty response |
| INTERNAL_ERROR | 500 | An internal error occurred |

Fallback codes for errors the framework raises without one (`_STATUS_CODES`): 400 `MALFORMED_REQUEST`, 404 `NOT_FOUND`, 405 `METHOD_NOT_ALLOWED`, 409 `CONFLICT`, 500 `INTERNAL_ERROR`, 502 `BAD_GATEWAY`; the base `ApiError` subclasses default to `BAD_REQUEST` / `NOT_FOUND` / `CONFLICT` / `BAD_GATEWAY` when a call site passes no explicit code.

## 4. REST API

### Cart — `/api/v1/carts`

- **GET `/{userId}`** → 200 `{"data": CartResponse}`; empty cart (not persisted) when no key. Never 404.
- **POST `/{userId}/items`** → **201** `{"data": CartResponse}`. Body `{productId: UUID!, variantId: UUID!, quantity: int ≥1!}`. Fetch product live; validate PUBLISHED, price, variant, stock; if variant already in cart, add quantities (bounds 1..99, ≤ stock) and refresh item snapshot; else append.
- **PUT `/{userId}/items/{variantId}`** → 200 `{"data": CartResponse}`. Body `{quantity ≥1!}`. 404 CART_EMPTY / CART_VARIANT_NOT_FOUND. Absolute quantity, re-validate stock, refresh snapshot.
- **DELETE `/{userId}/items/{variantId}`** → **200** `{"data": CartResponse}` — this delete returns the recomputed cart, so it keeps a body; deletes the Redis key if the cart empties. 404 CART_EMPTY / CART_VARIANT_NOT_FOUND.
- **DELETE `/{userId}`** → **204** no body, idempotent (nothing useful to return).

400 codes: QUANTITY_OUT_OF_BOUNDS, PRODUCT_NOT_PURCHASABLE (not PUBLISHED), PRODUCT_NO_PRICE, PRODUCT_INVALID_PRICE, INSUFFICIENT_STOCK. 404 codes: PRODUCT_NOT_FOUND, PRODUCT_NO_VARIANTS, VARIANT_NOT_FOUND. Their English messages are in the §3 table.

CartResponse: `{userId, items[], totalQuantity, totalAmount, createdAt, updatedAt}`; item: `{productId, variantId, productName, skuVariant, color, colorHex, size, productImageUrl, basePrice, extraPrice, unitPrice, quantity, subtotal}`.

Image selection priority: (1) image of this variant with isThumbnail; (2) image of this variant with lowest sortOrder (null → MAX); (3) any isThumbnail; (4) images[0]; (5) null. `unitPrice = basePrice + (extraPrice ?? 0)`.

### Orders — `/api/v1`

- **POST `/users/{userId}/checkout`** → **201** `{"data": {orderId, orderCode, totalAmount, orderStatus:"PENDING", paymentId:null, paymentStatus:"UNPAID", paymentUrl:null}}`.
  Body: `receiverName` (!, ≤150), `receiverPhone` (!, `^(0|\+84)[0-9]{9,10}$` — msg `"Phone number is invalid"`), `shippingAddress` (!, ≤500), `note` (≤1000), `paymentMethod` (!), `variantIds` (non-empty list — msg `"Select at least 1 product to check out"`). Any of these failing → 422 VALIDATION_ERROR with `details`.
  Flow: load cart (404 CART_EMPTY); partial checkout — selected variantIds must all exist in cart (400 CHECKOUT_ITEMS_NOT_IN_CART); for each item re-fetch product live, price = basePrice + variant.extraPrice (cart price NOT trusted; productImageUrl from the cart item); build order PENDING/UNPAID + history (note `"Order created"`) + saga log CREATED; publish `stock.reserve.requested`; saga log STOCK_RESERVE_REQUESTED (`"Stock reservation requested"`). Cart is NOT cleared at checkout (cleared per-item on payment.completed). No stock check at checkout (reservation is product-service's job).
- **GET `/users/{userId}/orders?status=&page=1&pageSize=20`** → 200 list envelope, sort createdAt DESC. `page` is **1-based** (defaults 1), `pageSize` defaults 20; offset = `(page - 1) * pageSize`. 400 PAGE_INVALID (`page < 1`), 400 PAGE_SIZE_INVALID (`pageSize` outside 1..100), 400 INVALID_ORDER_STATUS (unknown `status` filter).
- **GET `/users/{userId}/orders/{orderId}`** → 200 `{"data": OrderResponse}`; scoped by (id, userId); else 404 ORDER_NOT_FOUND (a malformed `orderId` also gives ORDER_NOT_FOUND).
- **POST `/users/{userId}/orders/{orderId}/cancel`** → 200 `{"data": OrderResponse}`. Body `{reason: !, ≤1000}`. Cancellable: PENDING, AWAITING_PAYMENT, CONFIRMED; else 400 CANCEL_NOT_ALLOWED. History note = reason. Stock release published only for PENDING/AWAITING_PAYMENT (CONFIRMED means paid — no refund flow).
- **PATCH `/admin/orders/{orderId}/status`** → 200 `{"data": OrderResponse}`. Header `X-User-Id` required (400 MISSING_HEADER if absent, 400 MALFORMED_REQUEST if not a UUID). Body `{status!, note ≤1000}`.
- **GET `/admin/orders?status=&page=1&pageSize=20`** → 200 list envelope (same paging rules as the user list).
- **GET `/admin/orders/summary`** → 200 `{"data": {totalOrders, ordersByStatus: {<status>: count}}}` (only statuses with rows).
- **GET `/admin/orders/{orderId}`** → 200 `{"data": OrderResponse}` / 404 ORDER_NOT_FOUND, no user scoping.

State machine (admin PATCH; same-status rejected; 400 INVALID_STATUS_TRANSITION, msg `"Cannot change status from <cur> to <target>"`):
```
PENDING → AWAITING_PAYMENT | CANCELLED
AWAITING_PAYMENT → CONFIRMED | CANCELLED
CONFIRMED → PROCESSING | CANCELLED
PROCESSING → SHIPPING → DELIVERED → COMPLETED
COMPLETED, CANCELLED → terminal
```

DTOs:
- OrderResponse: `{id, orderCode, userId, totalAmount, status, paymentId, paymentMethod, paymentStatus, receiverName, receiverPhone, shippingAddress, note, items[], statusHistories[], createdAt, updatedAt}` (transactionCode and reconciliation flags NOT exposed).
- OrderItemResponse: `{id, productId, variantId, productName, skuVariant, color, colorHex, size, productImageUrl, unitPrice, quantity, subtotal}`.
- OrderStatusHistoryResponse: `{id, status, changedBy, note, changedAt}`.
- OrderSummaryResponse: `{id, orderCode, totalAmount, status, paymentMethod, paymentStatus, receiverName, receiverPhone, createdAt}`.
- List envelope (replaces the old Spring-style `PageResponse`): `{"data": [OrderSummaryResponse], "meta": {page, pageSize, total}}` — no `totalPages`/`first`/`last`; the client derives them.

### Admin saga logs — `/api/v1/admin/saga-logs`
- **GET `/days`** → 200 `{"data": [{date: "yyyy-MM-dd", totalCount, hasWarning}]}` DESC. Unpaginated — no `meta`.
- **GET `/days/{date}`** → 200 `{"data": [{orderId, orderCode, entryCount, worstLevel, lastOccurredAt}]}` grouped per order for that day, lastOccurredAt DESC. A `{date}` that is not `yyyy-MM-dd` → 400 MALFORMED_REQUEST with `details.date`.
- **GET `/orders/{orderId}`** → 200 `{"data": [{stage, level, message, sourceService, targetService, errorDetail, retryCount, occurredAt}]}` ASC; unknown order → 200 with an empty array.

### Admin reconciliation settings — `/api/v1/admin/saga-settings`
- **GET** → 200 `{"data": {intervalMs, stuckThresholdMinutes, maxAttempts, updatedAt, updatedBy}}`; 404 SETTINGS_NOT_FOUND if missing.
- **PUT** — header `X-User-Id` required (stored as updated_by; missing → 400 MISSING_HEADER, non-UUID → 400 MALFORMED_REQUEST with `details["X-User-Id"]`). Body: `intervalMs ≥10000!`, `stuckThresholdMinutes ≥1!`, `maxAttempts 1..20!` (422 VALIDATION_ERROR otherwise). → 200 `{"data": ...}`.

## 5. Messaging (RabbitMQ)

Topic exchange `order-saga-events` (durable). Consumer queue `order-saga-events.order-service`: durable **quorum**, `x-dead-letter-exchange: order-saga-events.dlx`, `x-delivery-limit: ${SAGA_QUEUE_DELIVERY_LIMIT}`. Bindings: `stock.reserved`, `stock.reserve.rejected`, `payment.completed`, `payment.failed`. Fanout DLX `order-saga-events.dlx` → queue `order-saga-events.dlq` (consumed here: log WARN with x-death routing key + count; best-effort saga log DEAD_LETTERED `"Message '<rk>' was dead-lettered after <n> redeliveries"`).

Published (plain JSON, no type headers):
| Key | Payload | Trigger |
|---|---|---|
| `stock.reserve.requested` | `{orderId, occurredAt, items: [{variantId, quantity}]}` | checkout (**published via outbox — see §8**) |
| `payment.create.requested` | `{orderId, occurredAt, userId, orderCode, amount, paymentMethod}` | on stock.reserved |
| `stock.release.requested` | same shape as reserve | cancel (PENDING/AWAITING_PAYMENT), payment.failed, late stock.reserved on CANCELLED order, reconciliation |

Consumed — all deserialize `{orderId, occurredAt, reason?, paymentId?, transactionCode?}`; branch on routing key; **idempotency by status guard**; unknown orderId → warn + ack:
- `stock.reserved` (guard: only when status == PENDING): → AWAITING_PAYMENT, history `"Stock reserved, awaiting payment"`, publish `payment.create.requested`, saga logs STOCK_RESERVED + PAYMENT_CREATE_REQUESTED. If order already CANCELLED → publish stock.release.requested (compensation).
- `stock.reserve.rejected` (only when PENDING): → CANCELLED, history note = reason ?? `"Not enough stock available"`. No release (nothing reserved).
- `payment.completed` (only when AWAITING_PAYMENT): → CONFIRMED, paymentStatus PAID, set paymentId + transactionCode, history `"Payment succeeded"`, remove ordered variantIds from cart.
- `payment.failed` (only when AWAITING_PAYMENT): → CANCELLED, paymentStatus FAILED, history note = reason ?? `"Payment failed"`, publish stock.release.requested.

Inbound `reason` strings are stored **verbatim** into the order status history — they are authored in English by product-service / payment-service (see `infra/contracts/order-checkout-saga.md`).
- Any other state → log + ignore (ack).

Chaos modes: STUCK_STOCK_RESERVE / STUCK_PAYMENT silently skip that publish; FORCE_DEAD_LETTER throws in every consumer handler.

## 6. Reconciliation job

Background loop (~10s tick), settings re-read each tick, effective run cadence `interval_ms`, no leader election (single instance assumption).
- **Stuck orders** (status PENDING or AWAITING_PAYMENT, not exhausted, `(last_attempt ?? updated_at) < now - stuck_threshold_minutes`): if attempts ≥ max → exhaust; else resend (PENDING → stock.reserve.requested; AWAITING_PAYMENT → payment.create.requested), bump attempt, saga log RECONCILIATION_RESENT `"Saga command resent (attempt N)"` with retryCount.
- **Pending stock releases** (`stock_release_pending`, not exhausted): republish stock.release.requested, clear flag on success, bump attempt.
- **Exhaust**: `reconciliation_exhausted=true`; if not CANCELLED → CANCELLED + history `"Auto-cancelled: exceeded the automatic saga retry limit"`; publish stock.release.requested; saga logs RECONCILIATION_EXHAUSTED (WARN) + STOCK_RELEASE_REQUESTED.

## 7. External HTTP

Only product-service: **GET `{PRODUCT_SERVICE_URL}/products/{productId}`**.
404 → 404 PRODUCT_NOT_FOUND `"Product not found: <id>"`; other 4xx → 502 PRODUCT_SERVICE_ERROR `"Product Service rejected the request with status <code>"`; 5xx → 502 PRODUCT_SERVICE_ERROR `"Product Service returned an error"`; empty/unparseable body or a body without `data` → 502 PRODUCT_SERVICE_ERROR `"Product Service returned an empty response"`; connect failure → 502 PRODUCT_SERVICE_UNAVAILABLE `"Cannot connect to Product Service"`.
Response shape: product-service answers with the shared envelope, `{"data": {...}}`; the client unwraps `data` and hands callers the plain product dict `{id, sku, name, slug, basePrice, status(DRAFT|PUBLISHED|ARCHIVED), brand{...}, category{...}, variants[{id, color, colorHex, size, extraPrice, skuVariant, stock}], images[{id, variantId, imageUrl, isThumbnail, sortOrder}], ...}`.
The client must set an explicit timeout + retry (see §8).

## 8. Reliability requirements

1. **Transactional outbox** for saga publishes: write events to an `outbox_events` table in the same DB transaction as the order change; a background relay publishes to RabbitMQ with retry. Checkout no longer returns 502 when the broker is down, and events are never lost. Replaces `stock_release_pending` flag mechanics internally, but keep the reconciliation job for stuck-order resend semantics.
2. **httpx client with explicit timeout (e.g. 5s) and small retry** for product-service calls; map errors to the same messages as §7.
3. **Admin cancel releases stock**: PATCH → CANCELLED from PENDING/AWAITING_PAYMENT publishes stock.release.requested (same as the user cancel flow).
4. **Tests** (pytest): cover checkout, cancel, status transitions, cart incl. image priority chain, paging validation, controller error mapping, plus consumer/idempotency tests.
5. Money as `Decimal` end-to-end; never float.
