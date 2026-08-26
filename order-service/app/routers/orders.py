from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.deps import get_session, make_order_service
from app.json_utils import VNJSONResponse
from app.schemas import CancelOrderRequest, CheckoutRequest

router = APIRouter(prefix="/api/v1/users")


@router.post("/{user_id}/checkout")
def checkout(
    user_id: str,
    body: CheckoutRequest,
    request: Request,
    session: Session = Depends(get_session),
):
    service = make_order_service(request, session)
    return VNJSONResponse(content={"data": service.checkout(user_id, body)}, status_code=201)


@router.get("/{user_id}/orders")
def list_orders(
    user_id: str,
    request: Request,
    status: str | None = Query(default=None),
    page: int = Query(default=1),
    page_size: int = Query(default=20, alias="pageSize"),
    session: Session = Depends(get_session),
):
    service = make_order_service(request, session)
    # already the {"data", "meta"} list envelope
    return VNJSONResponse(content=service.list_user_orders(user_id, status, page, page_size))


@router.get("/{user_id}/orders/{order_id}")
def get_order(
    user_id: str,
    order_id: str,
    request: Request,
    session: Session = Depends(get_session),
):
    service = make_order_service(request, session)
    return VNJSONResponse(content={"data": service.get_user_order(user_id, order_id)})


@router.post("/{user_id}/orders/{order_id}/cancel")
def cancel_order(
    user_id: str,
    order_id: str,
    body: CancelOrderRequest,
    request: Request,
    session: Session = Depends(get_session),
):
    service = make_order_service(request, session)
    return VNJSONResponse(
        content={"data": service.cancel_order(user_id, order_id, body)}
    )
