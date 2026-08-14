# user-service — Functional Specification

Complete behavioral spec of user-service. The implementation must match every externally visible detail (paths, JSON keys, status codes, Vietnamese messages) because api-gateway and web depend on them.

Stack: Django + Django REST Framework, Postgres, PyJWT, bcrypt.

## 1. Config / env

- Docker port: `PORT=3001`; DB: `DATABASE_URL=postgresql://app:app@postgres:5432/auth_db`.
- `JWT_SECRET` — Base64 string; **decode Base64 first**, use raw bytes as HMAC key. 64 raw bytes → HS512. Must interop with api-gateway `jwt.guard.ts` (`Buffer.from(secret, 'base64')`).
- `JWT_EXPIRES_IN` — bare digits = ms, or `^(\d+)(ms|s|m|h|d)$` (e.g. `1d`). Invalid → startup error.
- `INTERNAL_API_KEY` — shared with api-gateway.

## 2. Auth model

- JWT claims: `sub` = username, `userId` = user UUID string, `email`, `iat`, `exp`. **No roles/permissions in token.**
- Login response `expiresIn` is in **seconds** (config is ms).
- Passwords: BCrypt (accept `$2a$`/`$2b$` prefixes; seeded admin hash is `$2b$12$...`).
- Protected endpoints: `Authorization: Bearer <token>`; missing/invalid → 401 INVALID_TOKEN. Permission-gated endpoints check live DB permissions → 403 FORBIDDEN.
- `/internal/**`: header `X-Internal-Key` must equal `INTERNAL_API_KEY` exactly, else **403** JSON `{"success":false,"message":"Yêu cầu nội bộ không hợp lệ","data":null}`.

## 3. Response envelope & errors

Envelope: `{ "success": bool, "message": string, "data": T|null }`.

Validation failure (400): `{"success":false,"message":"Dữ liệu đầu vào không hợp lệ","data":{"<field>":"<first message for that field>"}}`.
Unhandled error (500): message `"Đã xảy ra lỗi hệ thống"`.

Error codes (HTTP, message):
| Code | HTTP | Message |
|---|---|---|
| EMAIL_ALREADY_EXISTS | 409 | Email đã được sử dụng |
| USERNAME_ALREADY_EXISTS | 409 | Username đã được sử dụng |
| INVALID_TOKEN | 401 | Token không hợp lệ hoặc đã hết hạn |
| INVALID_CREDENTIALS | 401 | Email, username hoặc mật khẩu không chính xác |
| PROFILE_NOT_FOUND | 404 | Không tìm thấy hồ sơ người dùng |
| USER_NOT_FOUND | 404 | Không tìm thấy người dùng |
| CURRENT_PASSWORD_INCORRECT | 400 | Mật khẩu hiện tại không chính xác |
| NEW_PASSWORD_SAME_AS_CURRENT | 400 | Mật khẩu mới không được giống mật khẩu hiện tại |
| VALIDATION_FAILED | 400 | Dữ liệu đầu vào không hợp lệ |
| RESET_TOKEN_INVALID | 400 | Reset token không hợp lệ |
| RESET_TOKEN_EXPIRED | 400 | Reset token đã hết hạn |
| RESET_TOKEN_USED | 400 | Reset token đã được sử dụng |
| ROLE_NOT_FOUND | 404 | Không tìm thấy vai trò |
| ROLE_ALREADY_EXISTS | 409 | Tên vai trò đã tồn tại |
| ROLE_IN_USE | 409 | Không thể xóa vai trò đang được gán cho người dùng |
| PERMISSION_NOT_FOUND | 404 | Không tìm thấy quyền |
| USER_ROLE_NOT_ASSIGNED | 404 | Người dùng chưa được gán vai trò này |
| FORBIDDEN | 403 | Bạn không có quyền thực hiện thao tác này |
| ADDRESS_NOT_FOUND | 404 | Không tìm thấy địa chỉ |
| INTERNAL_SERVER_ERROR | 500 | Đã xảy ra lỗi hệ thống |

## 4. Endpoints

### Auth — `/api/v1/auth` (public)

**POST /register** → 201, message "Đăng ký tài khoản thành công", data = UserResponse `{id, email, username, roles: string[], status}`.
Fields: `email` (required, email, ≤50), `username` (required, 4–30, `^[a-zA-Z0-9_]+$`), `password` (required, 8–24, must contain letter+digit: `^(?=.*[A-Za-z])(?=.*\d).+$`), `fullName` (required, 2–50, `^[\p{L} .'-]+$`), `phone` (optional, `^$|^0\d{9}$`).
Normalization: email/username lowercased+trimmed; fullName trimmed + inner whitespace collapsed. New user gets role CUSTOMER (404 ROLE_NOT_FOUND if role row missing), status ACTIVE, and a profile row (phone blank→null).
Errors: 409 email/username taken; 400 validation.

**POST /login** → 200, "Đăng nhập thành công", data = `{accessToken, tokenType:"Bearer", expiresIn:<seconds>, user: UserResponse}`.
Fields: `identifier` (email OR username, required, ≤50), `password` (required, ≤24). Unknown identifier, wrong password, or status != ACTIVE → all 401 INVALID_CREDENTIALS (same message; don't leak which).

**POST /forgot-password** → always 200, "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được tạo", data null.
If user exists: delete prior tokens for user; raw token = 32 random bytes, Base64 URL-safe no padding (43 chars); store SHA-256 lowercase-hex (64 chars); expires in 15 min; log raw token at INFO (dev stand-in for email).

**POST /reset-password** → 200, "Đặt lại mật khẩu thành công".
Fields: `token` (required), `newPassword` (required, 8–24, letter+digit).
Lookup by SHA-256 hex of trimmed token → 400 RESET_TOKEN_INVALID; used (checked before expiry) → RESET_TOKEN_USED; expired → RESET_TOKEN_EXPIRED; same as current password → NEW_PASSWORD_SAME_AS_CURRENT. On success set hash + `used_at=now`.

### Users — `/api/v1/users`

**GET /?page=1&limit=20** — Bearer + permission `user:manage-roles`. → 200 "Lấy danh sách người dùng thành công", data = `{items: UserResponse[], total, page, limit, totalPages}`. Page is 1-based.

**GET /me** — Bearer. → 200 "Lấy thông tin cá nhân thành công", data = ProfileResponse `{userId, email, username, roles, permissions, status, fullName, phone, avatarUrl, address, dateOfBirth}`. 404 PROFILE_NOT_FOUND / USER_NOT_FOUND.

**PUT /me** — Bearer. Partial update: `fullName` (2–50, letters), `phone`, `avatarUrl` (≤500), `address` (≤255), `dateOfBirth` (`yyyy-MM-dd`, past). Only non-null fields applied; blank string → null for phone/avatarUrl/address; fullName only applied when non-blank (normalized). → 200 "Cập nhật thông tin cá nhân thành công", data = ProfileResponse.

**PUT /change-password** — Bearer. `currentPassword` (required ≤24), `newPassword` (required 8–24 letter+digit). Errors: CURRENT_PASSWORD_INCORRECT, NEW_PASSWORD_SAME_AS_CURRENT. → 200 "Đổi mật khẩu thành công", data null.

### User roles — `/api/v1/users/{userId}/roles` — Bearer + `user:manage-roles`

**POST /** → **201** "Gán vai trò cho người dùng thành công", body `{roleId: UUID}` (required), data = UserResponse. Idempotent. 404 USER_NOT_FOUND / ROLE_NOT_FOUND.
**DELETE /{roleId}** → 200 "Gỡ vai trò khỏi người dùng thành công", data = UserResponse. 404 USER_ROLE_NOT_ASSIGNED if not assigned.

### Roles/permissions — Bearer + `role:manage`

**GET /api/v1/roles** → 200 "Lấy danh sách vai trò thành công", data = `[{id, name, description, permissions: [{id, code, description}]}]`.
**POST /api/v1/roles** → **201** "Tạo vai trò thành công". Body: `name` (required 2–50), `description` (≤255, nullable), `permissionIds` (required set, may be empty). 409 ROLE_ALREADY_EXISTS (case-insensitive), 404 PERMISSION_NOT_FOUND (any unknown id — compare resolved count vs requested).
**PUT /api/v1/roles/{roleId}** → 200 "Cập nhật vai trò thành công". Same fields; permissions replaced wholesale. 409 only when renaming onto another existing name.
**DELETE /api/v1/roles/{roleId}** → 200 "Xóa vai trò thành công". 409 ROLE_IN_USE if any user has it.
**GET /api/v1/permissions** → 200 "Lấy danh sách quyền thành công", data = `[{id, code, description}]`.

### Addresses — `/api/v1/addresses` — Bearer, owner-scoped

AddressResponse = `{id, receiverName, receiverPhone, address, isDefault, createdAt}` — JSON key is **`isDefault`**. List ordered `is_default DESC, created_at DESC`.

**GET /** → 200 "Lấy danh sách địa chỉ thành công".
**POST /** → **200** (not 201!) "Thêm địa chỉ thành công". Fields: `receiverName` (required 2–100), `receiverPhone` (required `^0\d{9}$`), `address` (required ≤255), `isDefault` (bool, default false). First address is always default; setting default demotes others (bulk update).
**PUT /{id}** → 200 "Cập nhật địa chỉ thành công". A default address cannot be demoted by editing itself — only by making another default. 404 ADDRESS_NOT_FOUND (also when owned by another user).
**DELETE /{id}** → 200 "Xóa địa chỉ thành công". If deleted address was default, promote first of remaining (default DESC, created DESC).

Normalization: receiverName/address trim + collapse whitespace; receiverPhone trim.

### Internal — `/internal/v1/users/{userId}/permissions` (X-Internal-Key)

**GET** → 200 "Lấy danh sách quyền của người dùng thành công", data = `{permissions: string[]}` (distinct codes across user's roles). 404 USER_NOT_FOUND. Gateway reads `response.data.data.permissions`.

## 5. Data model (Postgres `auth_db`)

All tables: `id UUID PK`, `created_at`, `updated_at` (UTC).

- `users`: email VARCHAR(100) UNIQUE, username VARCHAR(50) UNIQUE, password_hash VARCHAR(255), status VARCHAR(20) ∈ {ACTIVE, INACTIVE, LOCKED}.
- `profiles`: user_id UUID UNIQUE FK, full_name VARCHAR(100), phone VARCHAR(20) NULL, avatar_url VARCHAR(500) NULL, address VARCHAR(255) NULL, date_of_birth DATE NULL.
- `password_reset_tokens`: user_id FK, token_hash VARCHAR(64) UNIQUE, expires_at, used_at NULL.
- `permissions`: code VARCHAR(100) UNIQUE, description NULL.
- `roles`: name VARCHAR(50) UNIQUE, description NULL.
- `role_permissions` (role_id, permission_id) PK pair.
- `user_roles` (user_id, role_id) PK pair.
- `addresses`: user_id FK, receiver_name VARCHAR(100), receiver_phone VARCHAR(20), address VARCHAR(255), is_default BOOLEAN DEFAULT FALSE.

Seed data (must ship in migrations, idempotent):
- Roles: `CUSTOMER` ("Khách hàng"), `ADMIN` ("Quản trị viên").
- Permissions: `product:manage`, `role:manage`, `user:manage-roles`, `order:manage`, `saga-settings:manage`, `catalog:manage`. ADMIN gets all.
- Admin user: email `admin@example.com`, username `admin`, password `Admin@123` (hash `$2b$12$1UjHn8ti8Y.Wqi//fNBQ4uGmrgAN0p9RE.C8nMzTPjO2c0y6sRXGO`), ACTIVE, profile full_name "Quản trị viên", role ADMIN.

## 6. Gotchas

- `POST /addresses` returns 200; `POST /register`, `POST /roles`, `POST /users/{id}/roles` return 201.
- `expiresIn` in seconds; config in ms.
- JWT secret Base64-decoded before use — raw-string keying breaks gateway interop.
- 401 = missing/bad token; 403 = valid token, missing permission; internal key failure = 403 with its own message.
- No messaging — pure synchronous HTTP.

## 7. Design requirements (beyond the raw contract)

- Auth via a central authentication class/middleware — never per-view manual token parsing.
- JWT secret + internal API key are env-only with no default — fail fast at startup when missing/invalid.
- Full pytest suite that runs without external infra.
- CI job runs the suite.
- Password reset token is logged at INFO as a dev stand-in for email — documented, never for production.
