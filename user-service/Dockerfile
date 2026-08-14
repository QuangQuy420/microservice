# user-service — Django rewrite (was Spring Boot)
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY manage.py ./
COPY config ./config
COPY users ./users

# Same startup pattern as the original entrypoint: run migrations (schema +
# idempotent seed data), then serve on $PORT (default 3001).
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-3001} --workers ${GUNICORN_WORKERS:-3} --access-logfile -"]
