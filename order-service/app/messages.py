"""All user-facing Vietnamese strings — part of the public contract.

Clients (web, api-gateway tests) assert on these byte-for-byte — do not reword.
"""

# --- generic error envelope ---
VALIDATION_FAILED = "Dữ liệu gửi lên không hợp lệ"
MISSING_HEADER = "Thiếu header bắt buộc: {name}"
INTERNAL_ERROR = "Đã xảy ra lỗi trong hệ thống"

# --- cart ---
CART_NOT_FOUND = "Giỏ hàng không tồn tại hoặc đang trống"
CART_VARIANT_NOT_FOUND = "Biến thể sản phẩm không tồn tại trong giỏ hàng"
QUANTITY_BOUNDS = "Số lượng sản phẩm phải từ 1 đến 99"
PRODUCT_NOT_PURCHASABLE = "Sản phẩm hiện không được phép đặt mua"
PRODUCT_NO_PRICE = "Sản phẩm chưa có giá bán"
PRODUCT_INVALID_PRICE = "Giá sản phẩm không hợp lệ"
STOCK_LEFT = "Chỉ còn {n} sản phẩm trong kho"
PRODUCT_NO_VARIANTS = "Sản phẩm không có biến thể"
VARIANT_NOT_FOUND = "Không tìm thấy biến thể sản phẩm"

# --- checkout / orders ---
PHONE_INVALID = "Số điện thoại không hợp lệ"
VARIANT_IDS_EMPTY = "Vui lòng chọn ít nhất 1 sản phẩm để thanh toán"
CHECKOUT_ITEMS_NOT_IN_CART = "Một số sản phẩm đã chọn không có trong giỏ hàng"
PAGE_NEGATIVE = "Trang không được nhỏ hơn 0"
PAGE_SIZE_RANGE = "Kích thước trang phải từ 1 đến 100"
ORDER_NOT_FOUND = "Không tìm thấy đơn hàng"
CANCEL_NOT_ALLOWED = "Không thể hủy đơn ở trạng thái {status}"
TRANSITION_NOT_ALLOWED = "Không thể chuyển trạng thái từ {cur} sang {target}"

# --- reconciliation settings ---
SETTINGS_NOT_FOUND = "Chưa có cấu hình reconciliation nào được khởi tạo"

# --- status history notes ---
HISTORY_ORDER_CREATED = "Đơn hàng được tạo"
HISTORY_STOCK_RESERVED = "Đã giữ hàng thành công, chờ thanh toán"
HISTORY_PAYMENT_COMPLETED = "Thanh toán thành công"
HISTORY_PAYMENT_FAILED_DEFAULT = "Thanh toán thất bại"
HISTORY_STOCK_REJECTED_DEFAULT = "Không đủ hàng trong kho"
HISTORY_AUTO_CANCELLED = "Hệ thống tự hủy do vượt quá số lần thử xử lý saga tự động"

# --- saga log messages ---
SAGA_ORDER_CREATED = "Đơn hàng được tạo"
SAGA_STOCK_RESERVE_REQUESTED = "Đã gửi yêu cầu giữ hàng"
SAGA_STOCK_RESERVED = "Product Service đã giữ hàng thành công"
SAGA_PAYMENT_CREATE_REQUESTED = "Đã gửi yêu cầu tạo thanh toán"
SAGA_PAYMENT_COMPLETED = "Thanh toán thành công"
SAGA_STOCK_RELEASE_REQUESTED = "Đã gửi yêu cầu hoàn kho"
SAGA_RECONCILIATION_RESENT = "Đã gửi lại lệnh saga (lần thử {n})"
SAGA_RECONCILIATION_EXHAUSTED = "Đã vượt quá số lần thử xử lý saga tự động"
SAGA_DEAD_LETTERED = "Message '{rk}' bị chuyển vào dead-letter queue sau {n} lần redeliver"

# --- product-service client errors ---
PRODUCT_CLIENT_NOT_FOUND = "Không tìm thấy sản phẩm: {id}"
PRODUCT_CLIENT_4XX = "Product Service từ chối yêu cầu với mã lỗi {code}"
PRODUCT_CLIENT_5XX = "Product Service đang xảy ra lỗi"
PRODUCT_CLIENT_EMPTY = "Product Service trả về dữ liệu rỗng"
PRODUCT_CLIENT_CONNECT = "Không thể kết nối đến Product Service"
