from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import messages
from app.errors import BadRequestError, NotFoundError
from app.models import ReconciliationSettings
from app.schemas import UpdateSagaSettingsRequest
from app.time_utils import now_vn


def _serialize(settings: ReconciliationSettings) -> dict:
    return {
        "intervalMs": settings.interval_ms,
        "stuckThresholdMinutes": settings.stuck_threshold_minutes,
        "maxAttempts": settings.max_attempts,
        "updatedAt": settings.updated_at,
        "updatedBy": str(settings.updated_by) if settings.updated_by else None,
    }


def get_settings_row(session: Session) -> ReconciliationSettings | None:
    return session.scalars(select(ReconciliationSettings).limit(1)).first()


def get_settings(session: Session) -> dict:
    row = get_settings_row(session)
    if row is None:
        raise NotFoundError(messages.SETTINGS_NOT_FOUND, code="SETTINGS_NOT_FOUND")
    return _serialize(row)


def update_settings(
    session: Session, request: UpdateSagaSettingsRequest, updated_by: str
) -> dict:
    row = get_settings_row(session)
    if row is None:
        row = ReconciliationSettings(
            interval_ms=request.intervalMs,
            stuck_threshold_minutes=request.stuckThresholdMinutes,
            max_attempts=request.maxAttempts,
        )
        session.add(row)
    else:
        row.interval_ms = request.intervalMs
        row.stuck_threshold_minutes = request.stuckThresholdMinutes
        row.max_attempts = request.maxAttempts
    row.updated_at = now_vn()
    try:
        row.updated_by = uuid.UUID(str(updated_by))
    except (ValueError, TypeError):
        session.rollback()
        raise BadRequestError(
            messages.MALFORMED_REQUEST,
            code="MALFORMED_REQUEST",
            details={"X-User-Id": ["X-User-Id must be a valid UUID"]},
        )
    session.commit()
    return _serialize(row)
