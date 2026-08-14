"""ORM → response dict mapping (exact JSON keys of the original DTOs).

transactionCode and the reconciliation flags are internal — never exposed.
"""
from __future__ import annotations

import math

from app.models import Order, OrderItem, OrderSagaLog, OrderStatusHistory


def order_item_response(item: OrderItem) -> dict:
    return {
        "id": str(item.id),
        "productId": str(item.product_id),
        "variantId": str(item.variant_id),
        "productName": item.product_name,
        "skuVariant": item.sku_variant,
        "color": item.color,
        "colorHex": item.color_hex,
        "size": item.size,
        "productImageUrl": item.product_image_url,
        "unitPrice": item.unit_price,
        "quantity": item.quantity,
        "subtotal": item.subtotal,
    }


def status_history_response(history: OrderStatusHistory) -> dict:
    return {
        "id": str(history.id),
        "status": history.status,
        "changedBy": str(history.changed_by) if history.changed_by else None,
        "note": history.note,
        "changedAt": history.changed_at,
    }


def order_response(order: Order) -> dict:
    return {
        "id": str(order.id),
        "orderCode": order.order_code,
        "userId": str(order.user_id),
        "totalAmount": order.total_amount,
        "status": order.status,
        "paymentId": str(order.payment_id) if order.payment_id else None,
        "paymentMethod": order.payment_method,
        "paymentStatus": order.payment_status,
        "receiverName": order.receiver_name,
        "receiverPhone": order.receiver_phone,
        "shippingAddress": order.shipping_address,
        "note": order.note,
        "items": [order_item_response(i) for i in order.items],
        "statusHistories": [status_history_response(h) for h in order.status_histories],
        "createdAt": order.created_at,
        "updatedAt": order.updated_at,
    }


def order_summary_response(order: Order) -> dict:
    return {
        "id": str(order.id),
        "orderCode": order.order_code,
        "totalAmount": order.total_amount,
        "status": order.status,
        "paymentMethod": order.payment_method,
        "paymentStatus": order.payment_status,
        "receiverName": order.receiver_name,
        "receiverPhone": order.receiver_phone,
        "createdAt": order.created_at,
    }


def page_response(content: list, page: int, size: int, total_elements: int) -> dict:
    total_pages = math.ceil(total_elements / size) if total_elements else 0
    return {
        "content": content,
        "page": page,
        "size": size,
        "totalElements": total_elements,
        "totalPages": total_pages,
        "first": page == 0,
        "last": page >= total_pages - 1 if total_pages else True,
    }


def saga_log_response(log: OrderSagaLog) -> dict:
    return {
        "stage": log.stage,
        "level": log.level,
        "message": log.message,
        "sourceService": log.source_service,
        "targetService": log.target_service,
        "errorDetail": log.error_detail,
        "retryCount": log.retry_count,
        "occurredAt": log.occurred_at,
    }
