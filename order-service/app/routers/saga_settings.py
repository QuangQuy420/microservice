from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_session, require_user_id_header
from app.json_utils import VNJSONResponse
from app.schemas import UpdateSagaSettingsRequest
from app.services import settings_service

router = APIRouter(prefix="/api/v1/admin/saga-settings")


@router.get("")
def get_settings(session: Session = Depends(get_session)):
    return VNJSONResponse(content={"data": settings_service.get_settings(session)})


@router.put("")
def update_settings(
    body: UpdateSagaSettingsRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(require_user_id_header),
):
    return VNJSONResponse(
        content={"data": settings_service.update_settings(session, body, user_id)}
    )
