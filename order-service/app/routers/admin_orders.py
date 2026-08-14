from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.deps import get_session, make_order_service, require_user_id_header
from app.json_utils import VNJSONResponse
from app.schemas import UpdateOrderStatusRequest

router = APIRouter(prefix="/api/v1/admin/orders")


@router.get("")
def list_orders(
    request: Request,
    status: str | None = Query(default=None),
    page: int = Query(default=0),
    size: int = Query(default=20),
    session: Session = Depends(get_session),
):
    service = make_order_service(request, session)
    return VNJSONResponse(content=service.list_admin_orders(status, page, size))


@router.get("/summary")
def summary(request: Request, session: Session = Depends(get_session)):
    service = make_order_service(request, session)
    return VNJSONResponse(content=service.admin_summary())


@router.get("/{order_id}")
def get_order(
    order_id: str, request: Request, session: Session = Depends(get_session)
):
    service = make_order_service(request, session)
    return VNJSONResponse(content=service.get_admin_order(order_id))


@router.patch("/{order_id}/status")
def update_status(
    order_id: str,
    body: UpdateOrderStatusRequest,
    request: Request,
    session: Session = Depends(get_session),
    user_id: str = Depends(require_user_id_header),
):
    service = make_order_service(request, session)
    return VNJSONResponse(content=service.update_status_admin(order_id, user_id, body))
