# user-service

Auth + RBAC service for the Smart Eyewear platform: register/login, JWT
issuance, roles/permissions, profile, addresses, password reset. Built with
**Django 6 + Django REST Framework**. Every externally visible detail (paths,
JSON keys, status codes, Vietnamese messages) follows the spec in
`docs/specs/user-service-spec.md` — api-gateway and web depend on them.

## Stack

- Django 6.0 + Django REST Framework (Python 3.13/3.14)
- PostgreSQL (`psycopg`), sqlite for tests
- PyJWT (HS512, base64-decoded secret), bcrypt, gunicorn

## Run locally

```bash
cd user-service
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# Env vars are read from the environment first, then from ./.env
# (see .env.example). You need a reachable Postgres from DATABASE_URL,
# e.g. via infra/docker-compose.yml.
.venv/bin/python manage.py migrate     # schema + idempotent seed data
.venv/bin/python manage.py runserver 0.0.0.0:3001
```

With Docker (the Compose way):

```bash
docker build -t user-service .
docker run --env-file .env -p 3001:3001 user-service
```

The container runs `manage.py migrate` first and then starts gunicorn on
`$PORT` (default 3001).

## Run tests

Tests need **no external infra**: they run on an in-memory sqlite database
with deterministic secrets (`config/settings_test.py`).

```bash
.venv/bin/python -m pytest
```

## Environment variables

| Var | Meaning |
|---|---|
| `PORT` | HTTP port (default 3001) |
| `DATABASE_URL` | `postgresql://user:pass@host:port/db` |
| `JWT_SECRET` | **Base64** string; decoded to raw bytes and used as the HMAC key (must match api-gateway). Must decode to ≥ 32 bytes; 64 bytes is recommended for HS512 (`openssl rand -base64 64`), otherwise PyJWT logs a key-length warning. Required — the service refuses to start without it. |
| `JWT_EXPIRES_IN` | Bare digits = milliseconds, or `<digits>(ms\|s\|m\|h\|d)`, e.g. `1d`. Invalid value = startup error. |
| `INTERNAL_API_KEY` | Shared secret for `/internal/**` (`X-Internal-Key` header); must match api-gateway. Required. |
| `BCRYPT_ROUNDS` | Optional, default 12 (tests use 4). |
| `DEBUG` | Optional, default false. |

Seeded data (migration `users/0002_seed_data`, idempotent): roles `CUSTOMER`
and `ADMIN`, the 6 permission codes, and admin user `admin` / `Admin@123`.

## Endpoints

Full request/response details are in the spec:

- `POST /api/v1/auth/register|login|forgot-password|reset-password`
- `GET /api/v1/users` (needs `user:manage-roles`), `GET|PUT /api/v1/users/me`,
  `PUT /api/v1/users/change-password`
- `POST /api/v1/users/{userId}/roles`, `DELETE /api/v1/users/{userId}/roles/{roleId}`
- `GET|POST /api/v1/roles`, `PUT|DELETE /api/v1/roles/{roleId}`,
  `GET /api/v1/permissions` (all need `role:manage`)
- `GET|POST /api/v1/addresses`, `PUT|DELETE /api/v1/addresses/{id}`
  (note: POST returns **200**, per spec)
- `GET /internal/v1/users/{userId}/permissions` (`X-Internal-Key`)
- `GET /health` (simple liveness check)

## Design notes

1. **Central auth.** A DRF
   authentication class (`users/authentication.py`) handles Bearer JWT for
   every protected view; RBAC checks are DRF permission classes
   (`users/permissions.py`); the `/internal/**` key check is one middleware
   (`users/middleware.py`).
2. **No hard-coded secrets.** `JWT_SECRET` and `INTERNAL_API_KEY` come only
   from the environment; the service fails fast at startup with a clear
   error when they are missing or invalid.
3. **Test coverage.** 120 pytest tests cover auth, JWT gateway interop,
   password reset, profile, addresses, roles and permission gating — running
   on sqlite with no infra.
4. **One exception handler** (`users/exceptions.py`) produces the
   `{success, message, data}` envelope for every error, including validation
   errors, instead of scattered handlers.
5. **Password reset token is logged at INFO** as a dev stand-in for
   email (deliberate, local-dev only) — do not run this in
   production with real users without wiring a real email sender.

Behavior notes (locked by the spec): `POST /addresses` returns 200 (not
201); `expiresIn` in the login response is in seconds while the config is in
milliseconds; login failures never reveal whether the identifier or the
password was wrong. Tokens are always signed with **HS512**;
api-gateway verifies with any HS* algorithm, so interop is unaffected.
