from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_session
from app.json_utils import VNJSONResponse
from app.services import saga_log_service

router = APIRouter(prefix="/api/v1/admin/saga-logs")


@router.get("/days")
def list_days(session: Session = Depends(get_session)):
    return VNJSONResponse(content={"data": saga_log_service.list_days(session)})


@router.get("/days/{date_str}")
def list_day_orders(date_str: str, session: Session = Depends(get_session)):
    return VNJSONResponse(
        content={"data": saga_log_service.list_day_orders(session, date_str)}
    )


@router.get("/orders/{order_id}")
def list_order_logs(order_id: str, session: Session = Depends(get_session)):
    return VNJSONResponse(
        content={"data": saga_log_service.list_order_logs(session, order_id)}
    )
