"""All developer-facing English strings — part of the public contract.

Clients translate the machine-readable `error.code`; these messages are the
fallback text shown when a code is unknown — keep them short and factual.
"""

# --- generic error envelope ---
VALIDATION_FAILED = "Invalid request data"
MALFORMED_REQUEST = "Malformed request"
MALFORMED_JSON = "Request body is not valid JSON"
MISSING_HEADER = "Missing required header: {name}"
INTERNAL_ERROR = "An internal error occurred"

# --- cart ---
CART_NOT_FOUND = "Cart does not exist or is empty"
CART_VARIANT_NOT_FOUND = "Product variant is not in the cart"
QUANTITY_BOUNDS = "Quantity must be between 1 and 99"
PRODUCT_NOT_PURCHASABLE = "Product is not available for purchase"
PRODUCT_NO_PRICE = "Product has no price"
PRODUCT_INVALID_PRICE = "Product price is invalid"
STOCK_LEFT = "Only {n} item(s) left in stock"
PRODUCT_NO_VARIANTS = "Product has no variants"
VARIANT_NOT_FOUND = "Product variant not found"

# --- checkout / orders ---
PHONE_INVALID = "Phone number is invalid"
VARIANT_IDS_EMPTY = "Select at least 1 product to check out"
CHECKOUT_ITEMS_NOT_IN_CART = "Some selected products are not in the cart"
PAGE_NEGATIVE = "Page must be 1 or greater"
PAGE_SIZE_RANGE = "Page size must be between 1 and 100"
ORDER_NOT_FOUND = "Order not found"
ORDER_STATUS_INVALID = "Invalid order status"
CANCEL_NOT_ALLOWED = "Cannot cancel an order in status {status}"
TRANSITION_NOT_ALLOWED = "Cannot change status from {cur} to {target}"

# --- reconciliation settings ---
SETTINGS_NOT_FOUND = "No reconciliation settings have been initialized"

# --- status history notes ---
HISTORY_ORDER_CREATED = "Order created"
HISTORY_STOCK_RESERVED = "Stock reserved, awaiting payment"
HISTORY_PAYMENT_COMPLETED = "Payment succeeded"
HISTORY_PAYMENT_FAILED_DEFAULT = "Payment failed"
HISTORY_STOCK_REJECTED_DEFAULT = "Not enough stock available"
HISTORY_AUTO_CANCELLED = "Auto-cancelled: exceeded the automatic saga retry limit"

# --- saga log messages ---
SAGA_ORDER_CREATED = "Order created"
SAGA_STOCK_RESERVE_REQUESTED = "Stock reservation requested"
SAGA_STOCK_RESERVED = "Product Service reserved the stock"
SAGA_PAYMENT_CREATE_REQUESTED = "Payment creation requested"
SAGA_PAYMENT_COMPLETED = "Payment succeeded"
SAGA_STOCK_RELEASE_REQUESTED = "Stock release requested"
SAGA_RECONCILIATION_RESENT = "Saga command resent (attempt {n})"
SAGA_RECONCILIATION_EXHAUSTED = "Exceeded the automatic saga retry limit"
SAGA_DEAD_LETTERED = "Message '{rk}' was dead-lettered after {n} redeliveries"

# --- product-service client errors ---
PRODUCT_CLIENT_NOT_FOUND = "Product not found: {id}"
PRODUCT_CLIENT_4XX = "Product Service rejected the request with status {code}"
PRODUCT_CLIENT_5XX = "Product Service returned an error"
PRODUCT_CLIENT_EMPTY = "Product Service returned an empty response"
PRODUCT_CLIENT_CONNECT = "Cannot connect to Product Service"
