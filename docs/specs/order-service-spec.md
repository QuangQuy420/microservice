# order-service — Functional Specification

The implementation must match every externally visible detail (paths, JSON keys, status codes, Vietnamese messages, RabbitMQ contract) because api-gateway, web, product-service and payment-service depend on them.

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

## 3. Error envelope

```json
{ "timestamp": "...", "status": 400, "error": "Bad Request", "message": "...",
  "path": "/api/v1/...", "validationErrors": {"field":"msg"} | null }
```
- not found → 404; bad request → 400; conflict → 409; product-service failure → **502**.
- Validation → 400 `"Dữ liệu gửi lên không hợp lệ"` + validationErrors (first error per field).
- Missing required header → 400 `"Thiếu header bắt buộc: <name>"`.
- Unexpected → 500 `"Đã xảy ra lỗi trong hệ thống"`.

## 4. REST API

### Cart — `/api/v1/carts`

- **GET `/{userId}`** → 200 CartResponse; empty cart (not persisted) when no key. Never 404.
- **POST `/{userId}/items`** → **201**. Body `{productId: UUID!, variantId: UUID!, quantity: int ≥1!}`. Fetch product live; validate PUBLISHED, price, variant, stock; if variant already in cart, add quantities (bounds 1..99, ≤ stock) and refresh item snapshot; else append.
- **PUT `/{userId}/items/{variantId}`** → 200. Body `{quantity ≥1!}`. 404 `"Giỏ hàng không tồn tại hoặc đang trống"` / `"Biến thể sản phẩm không tồn tại trong giỏ hàng"`. Absolute quantity, re-validate stock, refresh snapshot.
- **DELETE `/{userId}/items/{variantId}`** → 200 CartResponse; deletes Redis key if cart empties.
- **DELETE `/{userId}`** → **204** no body, idempotent.

400 messages: `"Số lượng sản phẩm phải từ 1 đến 99"`, `"Sản phẩm hiện không được phép đặt mua"` (not PUBLISHED), `"Sản phẩm chưa có giá bán"`, `"Giá sản phẩm không hợp lệ"`, `"Chỉ còn <n> sản phẩm trong kho"`. 404: `"Không tìm thấy sản phẩm"`, `"Sản phẩm không có biến thể"`, `"Không tìm thấy biến thể sản phẩm"`.

CartResponse: `{userId, items[], totalQuantity, totalAmount, createdAt, updatedAt}`; item: `{productId, variantId, productName, skuVariant, color, colorHex, size, productImageUrl, basePrice, extraPrice, unitPrice, quantity, subtotal}`.

Image selection priority: (1) image of this variant with isThumbnail; (2) image of this variant with lowest sortOrder (null → MAX); (3) any isThumbnail; (4) images[0]; (5) null. `unitPrice = basePrice + (extraPrice ?? 0)`.

### Orders — `/api/v1`

- **POST `/users/{userId}/checkout`** → **201** `{orderId, orderCode, totalAmount, orderStatus:"PENDING", paymentId:null, paymentStatus:"UNPAID", paymentUrl:null}`.
  Body: `receiverName` (!, ≤150), `receiverPhone` (!, `^(0|\+84)[0-9]{9,10}$` — msg `"Số điện thoại không hợp lệ"`), `shippingAddress` (!, ≤500), `note` (≤1000), `paymentMethod` (!), `variantIds` (non-empty list — msg `"Vui lòng chọn ít nhất 1 sản phẩm để thanh toán"`).
  Flow: load cart (404 `"Giỏ hàng không tồn tại hoặc đang trống"`); partial checkout — selected variantIds must all exist in cart (400 `"Một số sản phẩm đã chọn không có trong giỏ hàng"`); for each item re-fetch product live, price = basePrice + variant.extraPrice (cart price NOT trusted; productImageUrl from the cart item); build order PENDING/UNPAID + history (note `"Đơn hàng được tạo"`) + saga log CREATED; publish `stock.reserve.requested`; saga log STOCK_RESERVE_REQUESTED (`"Đã gửi yêu cầu giữ hàng"`). Cart is NOT cleared at checkout (cleared per-item on payment.completed). No stock check at checkout (reservation is product-service's job).
- **GET `/users/{userId}/orders?status=&page=0&size=20`** → 200 PageResponse, sort createdAt DESC. 400: `"Trang không được nhỏ hơn 0"`, `"Kích thước trang phải từ 1 đến 100"`.
- **GET `/users/{userId}/orders/{orderId}`** → 200 OrderResponse; scoped by (id, userId); else 404 `"Không tìm thấy đơn hàng"`.
- **POST `/users/{userId}/orders/{orderId}/cancel`** → 200. Body `{reason: !, ≤1000}`. Cancellable: PENDING, AWAITING_PAYMENT, CONFIRMED; else 400 `"Không thể hủy đơn ở trạng thái <status>"`. History note = reason. Stock release published only for PENDING/AWAITING_PAYMENT (CONFIRMED means paid — no refund flow).
- **PATCH `/admin/orders/{orderId}/status`** → 200. Header `X-User-Id` required (400 if missing). Body `{status!, note ≤1000}`.
- **GET `/admin/orders?status=&page=0&size=20`** → 200 PageResponse.
- **GET `/admin/orders/summary`** → 200 `{totalOrders, ordersByStatus: {<status>: count}}` (only statuses with rows).
- **GET `/admin/orders/{orderId}`** → 200 / 404, no user scoping.

State machine (admin PATCH; same-status rejected; msg `"Không thể chuyển trạng thái từ <cur> sang <target>"`):
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
- PageResponse: `{content, page, size, totalElements, totalPages, first, last}`.

### Admin saga logs — `/api/v1/admin/saga-logs`
- **GET `/days`** → `[{date: "yyyy-MM-dd", totalCount, hasWarning}]` DESC.
- **GET `/days/{date}`** → `[{orderId, orderCode, entryCount, worstLevel, lastOccurredAt}]` grouped per order for that day, lastOccurredAt DESC.
- **GET `/orders/{orderId}`** → `[{stage, level, message, sourceService, targetService, errorDetail, retryCount, occurredAt}]` ASC; unknown order → empty 200.

### Admin reconciliation settings — `/api/v1/admin/saga-settings`
- **GET** → `{intervalMs, stuckThresholdMinutes, maxAttempts, updatedAt, updatedBy}`; 404 `"Chưa có cấu hình reconciliation nào được khởi tạo"` if missing.
- **PUT** — header `X-User-Id` required (stored as updated_by). Body: `intervalMs ≥10000!`, `stuckThresholdMinutes ≥1!`, `maxAttempts 1..20!`.

## 5. Messaging (RabbitMQ)

Topic exchange `order-saga-events` (durable). Consumer queue `order-saga-events.order-service`: durable **quorum**, `x-dead-letter-exchange: order-saga-events.dlx`, `x-delivery-limit: ${SAGA_QUEUE_DELIVERY_LIMIT}`. Bindings: `stock.reserved`, `stock.reserve.rejected`, `payment.completed`, `payment.failed`. Fanout DLX `order-saga-events.dlx` → queue `order-saga-events.dlq` (consumed here: log WARN with x-death routing key + count; best-effort saga log DEAD_LETTERED `"Message '<rk>' bị chuyển vào dead-letter queue sau <n> lần redeliver"`).

Published (plain JSON, no type headers):
| Key | Payload | Trigger |
|---|---|---|
| `stock.reserve.requested` | `{orderId, occurredAt, items: [{variantId, quantity}]}` | checkout (**published via outbox — see §8**) |
| `payment.create.requested` | `{orderId, occurredAt, userId, orderCode, amount, paymentMethod}` | on stock.reserved |
| `stock.release.requested` | same shape as reserve | cancel (PENDING/AWAITING_PAYMENT), payment.failed, late stock.reserved on CANCELLED order, reconciliation |

Consumed — all deserialize `{orderId, occurredAt, reason?, paymentId?, transactionCode?}`; branch on routing key; **idempotency by status guard**; unknown orderId → warn + ack:
- `stock.reserved` (only when PENDING… wait, guard: only when status==PENDING): → AWAITING_PAYMENT, history `"Đã giữ hàng thành công, chờ thanh toán"`, publish `payment.create.requested`, saga logs STOCK_RESERVED + PAYMENT_CREATE_REQUESTED. If order already CANCELLED → publish stock.release.requested (compensation).
- `stock.reserve.rejected` (only when PENDING): → CANCELLED, history note = reason ?? `"Không đủ hàng trong kho"`. No release (nothing reserved).
- `payment.completed` (only when AWAITING_PAYMENT): → CONFIRMED, paymentStatus PAID, set paymentId + transactionCode, history `"Thanh toán thành công"`, remove ordered variantIds from cart.
- `payment.failed` (only when AWAITING_PAYMENT): → CANCELLED, paymentStatus FAILED, history note = reason ?? `"Thanh toán thất bại"`, publish stock.release.requested.
- Any other state → log + ignore (ack).

Chaos modes: STUCK_STOCK_RESERVE / STUCK_PAYMENT silently skip that publish; FORCE_DEAD_LETTER throws in every consumer handler.

## 6. Reconciliation job

Background loop (~10s tick), settings re-read each tick, effective run cadence `interval_ms`, no leader election (single instance assumption).
- **Stuck orders** (status PENDING or AWAITING_PAYMENT, not exhausted, `(last_attempt ?? updated_at) < now - stuck_threshold_minutes`): if attempts ≥ max → exhaust; else resend (PENDING → stock.reserve.requested; AWAITING_PAYMENT → payment.create.requested), bump attempt, saga log RECONCILIATION_RESENT `"Đã gửi lại lệnh saga (lần thử N)"` with retryCount.
- **Pending stock releases** (`stock_release_pending`, not exhausted): republish stock.release.requested, clear flag on success, bump attempt.
- **Exhaust**: `reconciliation_exhausted=true`; if not CANCELLED → CANCELLED + history `"Hệ thống tự hủy do vượt quá số lần thử xử lý saga tự động"`; publish stock.release.requested; saga logs RECONCILIATION_EXHAUSTED (WARN) + STOCK_RELEASE_REQUESTED.

## 7. External HTTP

Only product-service: **GET `{PRODUCT_SERVICE_URL}/products/{productId}`**.
404 → 404 `"Không tìm thấy sản phẩm: <id>"`; other 4xx → 502 `"Product Service từ chối yêu cầu với mã lỗi <code>"`; 5xx → 502 `"Product Service đang xảy ra lỗi"`; empty body → 502 `"Product Service trả về dữ liệu rỗng"`; connect failure → 502 `"Không thể kết nối đến Product Service"`.
Response shape: `{id, sku, name, slug, basePrice, status(DRAFT|PUBLISHED|ARCHIVED), brand{...}, category{...}, variants[{id, color, colorHex, size, extraPrice, skuVariant, stock}], images[{id, variantId, imageUrl, isThumbnail, sortOrder}], ...}`.
The client must set an explicit timeout + retry (see §8).

## 8. Reliability requirements

1. **Transactional outbox** for saga publishes: write events to an `outbox_events` table in the same DB transaction as the order change; a background relay publishes to RabbitMQ with retry. Checkout no longer returns 502 when the broker is down, and events are never lost. Replaces `stock_release_pending` flag mechanics internally, but keep the reconciliation job for stuck-order resend semantics.
2. **httpx client with explicit timeout (e.g. 5s) and small retry** for product-service calls; map errors to the same messages as §7.
3. **Admin cancel releases stock**: PATCH → CANCELLED from PENDING/AWAITING_PAYMENT publishes stock.release.requested (same as the user cancel flow).
4. **Tests** (pytest): cover checkout, cancel, status transitions, cart incl. image priority chain, paging validation, controller error mapping, plus consumer/idempotency tests.
5. Money as `Decimal` end-to-end; never float.
