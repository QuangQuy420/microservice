from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.deps import get_cart_service
from app.json_utils import VNJSONResponse
from app.schemas import AddCartItemRequest, UpdateCartItemRequest
from app.services.cart_service import CartService

router = APIRouter(prefix="/api/v1/carts")


@router.get("/{user_id}")
def get_cart(user_id: str, service: CartService = Depends(get_cart_service)):
    return VNJSONResponse(content={"data": service.get_cart(user_id)})


@router.post("/{user_id}/items")
def add_item(
    user_id: str,
    body: AddCartItemRequest,
    service: CartService = Depends(get_cart_service),
):
    cart = service.add_item(user_id, str(body.productId), str(body.variantId), body.quantity)
    return VNJSONResponse(content={"data": cart}, status_code=201)


@router.put("/{user_id}/items/{variant_id}")
def update_item(
    user_id: str,
    variant_id: str,
    body: UpdateCartItemRequest,
    service: CartService = Depends(get_cart_service),
):
    return VNJSONResponse(
        content={"data": service.update_item(user_id, variant_id, body.quantity)}
    )


@router.delete("/{user_id}/items/{variant_id}")
def remove_item(
    user_id: str, variant_id: str, service: CartService = Depends(get_cart_service)
):
    return VNJSONResponse(content={"data": service.remove_item(user_id, variant_id)})


@router.delete("/{user_id}")
def clear_cart(user_id: str, service: CartService = Depends(get_cart_service)):
    service.clear_cart(user_id)
    return Response(status_code=204)
