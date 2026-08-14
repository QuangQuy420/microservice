// Mirrors order-service's cart DTOs field-for-field. See order-service/app/routers/carts.py,
// app/schemas.py (AddCartItemRequest/UpdateCartItemRequest), and the cart response shape built
// in app/services/cart_service.py.

// Mirrors CartItemResponse.
export interface CartItem {
  productId: string;
  variantId: string;
  productName: string;
  skuVariant: string;
  color: string;
  colorHex: string | null;
  size: string;
  productImageUrl: string | null;
  basePrice: number;
  extraPrice: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

// Mirrors CartResponse.
export interface Cart {
  userId: string;
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

// Mirrors AddCartItemRequest.
export interface AddCartItemPayload {
  productId: string;
  variantId: string;
  quantity: number;
}

// Mirrors UpdateCartItemRequest.
export interface UpdateCartItemPayload {
  quantity: number;
}
