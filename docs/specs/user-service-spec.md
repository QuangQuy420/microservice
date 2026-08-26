# user-service — Functional Specification

Complete behavioral spec of user-service. The implementation must match every externally visible detail (paths, JSON keys, status codes, the response envelope and the machine-readable `error.code` values) because api-gateway and web depend on them. Human-readable text is **English** and developer-facing only — clients translate by `error.code` and author their own success messages; the exact English wording is a fallback, not a frozen contract.

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
- `/internal/**`: header `X-Internal-Key` must equal `INTERNAL_API_KEY` exactly, else **403** JSON `{"error":{"code":"INVALID_INTERNAL_KEY","message":"Invalid internal request"}}`. The check runs in middleware, before any view.

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
- `error.code` is the stable machine-readable contract; `error.message` is an English developer-facing fallback.
- `error.details` is present only on validation failures and is always `{"<field>": ["<msg>", ...]}` — values are ALWAYS arrays of strings.
- A delete that has a useful body still returns **200** with that body (`DELETE /users/{id}/roles/{roleId}` → updated user). Deletes with nothing useful to return use 200 + `{"data": null}` here (`DELETE /roles/{id}`, `DELETE /addresses/{id}`); no user-service endpoint returns 204.
- Field validation fails with **422** `VALIDATION_ERROR` + `details`. An unparseable JSON body is **400** `MALFORMED_REQUEST`. Business-rule failures (wrong current password, expired reset token…) stay **400** with their own code.
- A malformed UUID in a path is treated as "row not found" and yields the entity's 404 code (`USER_NOT_FOUND`, `ROLE_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `USER_ROLE_NOT_ASSIGNED`) — it never surfaces as `MALFORMED_REQUEST`.

Error codes (`users/errors.py` `ERROR_CATALOG` is the authoritative list):

| Code | HTTP | Message |
|---|---|---|
| EMAIL_ALREADY_EXISTS | 409 | Email already exists |
| USERNAME_ALREADY_EXISTS | 409 | Username already exists |
| INVALID_TOKEN | 401 | Token is invalid or has expired |
| INVALID_CREDENTIALS | 401 | Email, username or password is incorrect |
| PROFILE_NOT_FOUND | 404 | User profile not found |
| USER_NOT_FOUND | 404 | User not found |
| CURRENT_PASSWORD_INCORRECT | 400 | Current password is incorrect |
| NEW_PASSWORD_SAME_AS_CURRENT | 400 | New password must be different from the current password |
| RESET_TOKEN_INVALID | 400 | Reset token is invalid |
| RESET_TOKEN_EXPIRED | 400 | Reset token has expired |
| RESET_TOKEN_USED | 400 | Reset token has already been used |
| ROLE_NOT_FOUND | 404 | Role not found |
| ROLE_ALREADY_EXISTS | 409 | Role name already exists |
| ROLE_IN_USE | 409 | Cannot delete a role that is assigned to users |
| PERMISSION_NOT_FOUND | 404 | Permission not found |
| USER_ROLE_NOT_ASSIGNED | 404 | User does not have this role |
| FORBIDDEN | 403 | You do not have permission to perform this action |
| INVALID_INTERNAL_KEY | 403 | Invalid internal request |
| ADDRESS_NOT_FOUND | 404 | Address not found |
| MALFORMED_REQUEST | 400 | Malformed request |
| NOT_FOUND | 404 | Resource not found |
| METHOD_NOT_ALLOWED | 405 | Method not allowed |
| UNSUPPORTED_MEDIA_TYPE | 415 | Unsupported media type |
| VALIDATION_ERROR | 422 | Invalid input |
| THROTTLED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Internal server error |

The last seven are generic protocol/framework fallbacks: unknown route → `NOT_FOUND`, wrong verb → `METHOD_NOT_ALLOWED`, unhandled exception → `INTERNAL_ERROR`. Missing/invalid bearer token → `INVALID_TOKEN`; valid token without the required permission → `FORBIDDEN`.

Validation failure example:

```json
{"error": {"code": "VALIDATION_ERROR", "message": "Invalid input",
           "details": {"password": ["Password is too short",
                                    "Password must contain at least one letter and one digit"]}}}
```

Serializer field messages are English and follow `"<Label> is required｜must not be blank｜is invalid｜is not supported｜is too short｜is too long"`, plus rule-specific sentences (e.g. `"Phone number must be 10 digits starting with 0"`). They are fallback text, not a frozen contract.

**GET /health** → 200 raw `{"status": "UP"}` — deliberately **not** enveloped (ops probe).

## 4. Endpoints

### Auth — `/api/v1/auth` (public)

**POST /register** → **201** `{"data": UserResponse}`, UserResponse = `{id, email, username, roles: string[], status}`.
Fields: `email` (required, email, ≤50), `username` (required, 4–30, `^[a-zA-Z0-9_]+$`), `password` (required, 8–24, must contain letter+digit: `^(?=.*[A-Za-z])(?=.*\d).+$`), `fullName` (required, 2–50, `^[\p{L} .'-]+$`), `phone` (optional, `^$|^0\d{9}$`).
Normalization: email/username lowercased+trimmed; fullName trimmed + inner whitespace collapsed. New user gets role CUSTOMER (404 ROLE_NOT_FOUND if role row missing), status ACTIVE, and a profile row (phone blank→null, `preferred_language` defaults to `vi`).
Errors: 409 EMAIL_ALREADY_EXISTS / USERNAME_ALREADY_EXISTS; 422 VALIDATION_ERROR.

**POST /login** → 200 `{"data": {accessToken, tokenType:"Bearer", expiresIn:<seconds>, user: UserResponse}}`.
Fields: `identifier` (email OR username, required, ≤50), `password` (required, ≤24). Unknown identifier, wrong password, or status != ACTIVE → all 401 INVALID_CREDENTIALS (same code and message; don't leak which).

**POST /forgot-password** → always 200 `{"data": null}` (no hint about whether the email exists).
If user exists: delete prior tokens for user; raw token = 32 random bytes, Base64 URL-safe no padding (43 chars); store SHA-256 lowercase-hex (64 chars); expires in 15 min; log raw token at INFO (dev stand-in for email).

**POST /reset-password** → 200 `{"data": null}`.
Fields: `token` (required), `newPassword` (required, 8–24, letter+digit).
Lookup by SHA-256 hex of trimmed token → 400 RESET_TOKEN_INVALID; used (checked before expiry) → RESET_TOKEN_USED; expired → RESET_TOKEN_EXPIRED; same as current password → NEW_PASSWORD_SAME_AS_CURRENT. On success set hash + `used_at=now`.

### Users — `/api/v1/users`

**GET /?page=1&pageSize=20** — Bearer + permission `user:manage-roles`. → 200 `{"data": UserResponse[], "meta": {page, pageSize, total}}`, ordered by `created_at`. `page` is **1-based**; `pageSize` defaults to 20. Both params are clamped, not validated: a value below 1 or a non-numeric value falls back (`page` → 1, `pageSize` → 20) instead of raising 422. A page past the end returns an empty `data` with the real `total`.

**GET /me** — Bearer. → 200 `{"data": ProfileResponse}`, ProfileResponse = `{userId, email, username, roles, permissions, status, fullName, phone, avatarUrl, address, dateOfBirth, preferredLanguage}`. 404 PROFILE_NOT_FOUND / USER_NOT_FOUND.

**PUT /me** — Bearer. Partial update: `fullName` (2–50, letters), `phone`, `avatarUrl` (≤500), `address` (≤255), `dateOfBirth` (`yyyy-MM-dd`, past), `preferredLanguage` (one of `SUPPORTED_LANGUAGES` = `["vi","en"]`; anything else → 422 VALIDATION_ERROR with `details.preferredLanguage`). Only keys that are present AND non-null are applied; blank string → null for phone/avatarUrl/address; fullName only applied when non-blank (normalized). → 200 `{"data": ProfileResponse}`.

**PUT /change-password** — Bearer. `currentPassword` (required ≤24), `newPassword` (required 8–24 letter+digit). Errors: 400 CURRENT_PASSWORD_INCORRECT, 400 NEW_PASSWORD_SAME_AS_CURRENT. → 200 `{"data": null}`.

### User roles — `/api/v1/users/{userId}/roles` — Bearer + `user:manage-roles`

**POST /** → **201** `{"data": UserResponse}`, body `{roleId: UUID}` (required). Idempotent. 404 USER_NOT_FOUND / ROLE_NOT_FOUND.
**DELETE /{roleId}** → **200** `{"data": UserResponse}` — the delete returns the updated user, so it keeps a body instead of 204. 404 USER_ROLE_NOT_ASSIGNED if not assigned (also for a malformed `roleId`).

### Roles/permissions — Bearer + `role:manage`

**GET /api/v1/roles** → 200 `{"data": [{id, name, description, permissions: [{id, code, description}]}]}`, ordered by name. Unpaginated — no `meta`.
**POST /api/v1/roles** → **201** `{"data": RoleResponse}`. Body: `name` (required 2–50), `description` (≤255, nullable), `permissionIds` (required list, may be empty). 409 ROLE_ALREADY_EXISTS (case-insensitive), 404 PERMISSION_NOT_FOUND (any unknown id — compare resolved count vs requested).
**PUT /api/v1/roles/{roleId}** → 200 `{"data": RoleResponse}`. Same fields; permissions replaced wholesale. 409 only when renaming onto another existing name.
**DELETE /api/v1/roles/{roleId}** → 200 `{"data": null}`. 409 ROLE_IN_USE if any user has it.
**GET /api/v1/permissions** → 200 `{"data": [{id, code, description}]}`, ordered by code.

### Addresses — `/api/v1/addresses` — Bearer, owner-scoped

AddressResponse = `{id, receiverName, receiverPhone, address, isDefault, createdAt}` — JSON key is **`isDefault`**. List ordered `is_default DESC, created_at DESC`.

**GET /** → 200 `{"data": AddressResponse[]}` (unpaginated, no `meta`).
**POST /** → **200** (not 201!) `{"data": AddressResponse}`. Fields: `receiverName` (required 2–100), `receiverPhone` (required `^0\d{9}$`), `address` (required ≤255), `isDefault` (bool, default false). First address is always default; setting default demotes others (bulk update).
**PUT /{id}** → 200 `{"data": AddressResponse}`. A default address cannot be demoted by editing itself — only by making another default. 404 ADDRESS_NOT_FOUND (also when owned by another user, or when `{id}` is not a UUID).
**DELETE /{id}** → 200 `{"data": null}`. If the deleted address was default, promote first of remaining (default DESC, created DESC).

Normalization: receiverName/address trim + collapse whitespace; receiverPhone trim.

### Internal — `/internal/v1/users/{userId}/permissions` (X-Internal-Key)

**GET** → 200 `{"data": {"permissions": string[]}}` (distinct codes across the user's roles). 404 USER_NOT_FOUND; 403 INVALID_INTERNAL_KEY on a bad/missing key. Gateway reads `response.data.data.permissions` (unchanged under this envelope).

## 5. Data model (Postgres `auth_db`)

All tables: `id UUID PK`, `created_at`, `updated_at` (UTC).

- `users`: email VARCHAR(100) UNIQUE, username VARCHAR(50) UNIQUE, password_hash VARCHAR(255), status VARCHAR(20) ∈ {ACTIVE, INACTIVE, LOCKED}.
- `profiles`: user_id UUID UNIQUE FK, full_name VARCHAR(100), phone VARCHAR(20) NULL, avatar_url VARCHAR(500) NULL, address VARCHAR(255) NULL, date_of_birth DATE NULL, preferred_language VARCHAR(10) NOT NULL DEFAULT `'vi'` (ISO 639-1; 10 chars leaves room for regional tags like `pt-BR`; migration `0003_add_preferred_language`).
- `password_reset_tokens`: user_id FK, token_hash VARCHAR(64) UNIQUE, expires_at, used_at NULL.
- `permissions`: code VARCHAR(100) UNIQUE, description NULL.
- `roles`: name VARCHAR(50) UNIQUE, description NULL.
- `role_permissions` (role_id, permission_id) PK pair.
- `user_roles` (user_id, role_id) PK pair.
- `addresses`: user_id FK, receiver_name VARCHAR(100), receiver_phone VARCHAR(20), address VARCHAR(255), is_default BOOLEAN DEFAULT FALSE.

Seed data (must ship in migrations, idempotent) — display labels are **English** (`users/migrations/0002_seed_data.py`):
- Roles: `CUSTOMER` ("Customer"), `ADMIN` ("Administrator").
- Permissions: `product:manage`, `role:manage`, `user:manage-roles`, `order:manage`, `saga-settings:manage`, `catalog:manage`. ADMIN gets all.
- Admin user: email `admin@example.com`, username `admin`, password `Admin@123` (hash `$2b$12$1UjHn8ti8Y.Wqi//fNBQ4uGmrgAN0p9RE.C8nMzTPjO2c0y6sRXGO`), ACTIVE, profile full_name "Administrator", role ADMIN.

`0002_seed_data.py` was edited in place rather than superseded by a new data migration (local-only project), so a database created before this change keeps the old Vietnamese labels — recreate the volume (`docker compose down -v`) to pick up the English ones.

## 6. Gotchas

- `POST /addresses` returns 200; `POST /register`, `POST /roles`, `POST /users/{id}/roles` return 201.
- `expiresIn` in seconds; config in ms.
- JWT secret Base64-decoded before use — raw-string keying breaks gateway interop.
- 401 INVALID_TOKEN = missing/bad token; 403 FORBIDDEN = valid token, missing permission; internal key failure = 403 INVALID_INTERNAL_KEY.
- 422 is **only** field validation. Business-rule failures keep 400 (`CURRENT_PASSWORD_INCORRECT`, `RESET_TOKEN_*`, `NEW_PASSWORD_SAME_AS_CURRENT`).
- Nothing returns 204 here — the two "empty" deletes answer 200 `{"data": null}`.
- Paging params are clamped, never rejected: `?page=0` behaves as `?page=1`.
- `GET /health` is the only unenveloped response.
- No messaging — pure synchronous HTTP.

## 7. Design requirements (beyond the raw contract)

- Auth via a central authentication class/middleware — never per-view manual token parsing.
- JWT secret + internal API key are env-only with no default — fail fast at startup when missing/invalid.
- Full pytest suite that runs without external infra.
- CI job runs the suite.
- Password reset token is logged at INFO as a dev stand-in for email — documented, never for production.
