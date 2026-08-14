"""RabbitMQ names — must match the original service and the saga contract."""

EXCHANGE = "order-saga-events"
DLX = "order-saga-events.dlx"
QUEUE = "order-saga-events.order-service"
DLQ = "order-saga-events.dlq"

# consumed routing keys
STOCK_RESERVED = "stock.reserved"
STOCK_RESERVE_REJECTED = "stock.reserve.rejected"
PAYMENT_COMPLETED = "payment.completed"
PAYMENT_FAILED = "payment.failed"

CONSUMED_KEYS = (STOCK_RESERVED, STOCK_RESERVE_REJECTED, PAYMENT_COMPLETED, PAYMENT_FAILED)
