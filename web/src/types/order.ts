import type { PaginatedResponse } from "./api";

// Mirrors order-service's order DTOs field-for-field (api-gateway passes these through
// unchanged — see plan NFR1, no response reshaping in the proxy). See
// order-service/app/services/serializers.py (responses) and app/schemas.py (requests),
// plus OrderStatus / PaymentStatus in order-service/app/enums.py.

// Mirrors order-service/app/enums.py OrderStatus.
export type OrderStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

// Mirrors order-service/app/enums.py PaymentStatus.
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

// Mirrors OrderItemResponse.
export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  skuVariant: string;
  color: string;
  colorHex: string | null;
  size: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

// Mirrors OrderStatusHistoryResponse.
export interface OrderStatusHistoryEntry {
  id: string;
  status: OrderStatus;
  changedBy: string | null;
  note: string | null;
  changedAt: string;
}

// Mirrors OrderSummaryResponse (the row shape used in the paginated order list).
export interface OrderSummary {
  id: string;
  orderCode: string;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  receiverName: string;
  receiverPhone: string;
  createdAt: string;
}

// Mirrors OrderResponse (order detail).
export interface Order {
  id: string;
  orderCode: string;
  userId: string;
  totalAmount: number;
  status: OrderStatus;
  paymentId: string | null;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  receiverName: string;
  receiverPhone: string;
  shippingAddress: string;
  note: string | null;
  items: OrderItem[];
  statusHistories: OrderStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// Mirrors CheckoutRequest. `variantIds` (T-checkout-select) is the subset of the cart the user
// picked to check out — order-service creates the order from just these and leaves the rest of
// the cart untouched (see CartService.removeItems, used instead of clearCart post-payment).
export interface CheckoutPayload {
  receiverName: string;
  receiverPhone: string;
  shippingAddress: string;
  note?: string;
  paymentMethod: string;
  variantIds: string[];
}

// Mirrors CheckoutResponse.
export interface CheckoutResult {
  orderId: string;
  orderCode: string;
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentId: string;
  paymentStatus: PaymentStatus;
  paymentUrl: string | null;
}

// Mirrors CancelOrderRequest.
export interface CancelOrderPayload {
  reason: string;
}

// Order lists use the same `{data, meta}` envelope as every other paginated endpoint now
// (order-service/app/services/serializers.py page_response) — see @/types/api.
export type OrderPageResponse<T> = PaginatedResponse<T>;

// Mirrors OrderController.getOrders' query params — `page` is 1-based.
export interface GetOrdersParams {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}

// Mirrors order-service's admin summary (app/services/order_service.py, admin_summary) —
// the admin dashboard's order totals. `ordersByStatus` is Partial since the backend's Map only
// contains statuses that have at least one order.
export interface AdminOrdersSummary {
  totalOrders: number;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
}
