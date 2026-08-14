from __future__ import annotations

from typing import Iterator

from fastapi import Header, Request
from sqlalchemy.orm import Session

from app.errors import MissingHeaderError
from app.repositories.cart_repository import CartRepository
from app.services.cart_service import CartService
from app.services.order_service import OrderService
from app.services.product_client import ProductClient


def get_session(request: Request) -> Iterator[Session]:
    session: Session = request.app.state.sessionmaker()
    try:
        yield session
    finally:
        session.close()


def get_cart_repo(request: Request) -> CartRepository:
    return request.app.state.cart_repo


def get_product_client(request: Request) -> ProductClient:
    return request.app.state.product_client


def get_cart_service(request: Request) -> CartService:
    return CartService(request.app.state.cart_repo, request.app.state.product_client)


def make_order_service(request: Request, session: Session) -> OrderService:
    return OrderService(
        session, request.app.state.cart_repo, request.app.state.product_client
    )


def require_user_id_header(x_user_id: str | None = Header(default=None)) -> str:
    if not x_user_id:
        raise MissingHeaderError("X-User-Id")
    return x_user_id
