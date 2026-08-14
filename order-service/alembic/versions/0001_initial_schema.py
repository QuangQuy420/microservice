"""Initial schema — the full schema in a single revision, including the
transactional outbox table. Seeds the single
reconciliation_settings row (60000 ms, 2 min, 3 attempts).

Revision ID: 0001
Revises:
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

ORDER_STATUSES = (
    "PENDING",
    "AWAITING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
)
PAYMENT_STATUSES = ("UNPAID", "PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED")


def _in_list(values) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("order_code", sa.String(50), nullable=False, unique=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("total_amount", sa.Numeric(19, 2), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
        sa.Column("payment_id", sa.Uuid(), nullable=True),
        sa.Column("transaction_code", sa.String(100), nullable=True),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("payment_status", sa.String(30), nullable=False, server_default="UNPAID"),
        sa.Column("receiver_name", sa.String(150), nullable=False),
        sa.Column("receiver_phone", sa.String(20), nullable=False),
        sa.Column("shipping_address", sa.String(500), nullable=False),
        sa.Column("note", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("reconciliation_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reconciliation_attempt_at", sa.DateTime(), nullable=True),
        sa.Column(
            "reconciliation_exhausted", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "stock_release_pending", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.CheckConstraint(f"status IN ({_in_list(ORDER_STATUSES)})", name="ck_orders_status"),
        sa.CheckConstraint(
            f"payment_status IN ({_in_list(PAYMENT_STATUSES)})", name="ck_orders_payment_status"
        ),
        sa.CheckConstraint("total_amount >= 0", name="ck_orders_total_amount"),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])

    op.create_table(
        "order_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "order_id",
            sa.Uuid(),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("variant_id", sa.Uuid(), nullable=False),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("sku_variant", sa.String(100), nullable=True),
        sa.Column("color", sa.String(100), nullable=True),
        sa.Column("color_hex", sa.String(7), nullable=True),
        sa.Column("size", sa.String(100), nullable=True),
        sa.Column("product_image_url", sa.String(1000), nullable=True),
        sa.Column("unit_price", sa.Numeric(19, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("subtotal", sa.Numeric(19, 2), nullable=False),
        sa.CheckConstraint("unit_price >= 0", name="ck_order_items_unit_price"),
        sa.CheckConstraint("quantity > 0", name="ck_order_items_quantity"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])

    op.create_table(
        "order_status_histories",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "order_id",
            sa.Uuid(),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("changed_by", sa.Uuid(), nullable=True),
        sa.Column("note", sa.String(1000), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_order_status_histories_order_id", "order_status_histories", ["order_id"]
    )

    op.create_table(
        "order_saga_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "order_id",
            sa.Uuid(),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(40), nullable=False),
        sa.Column("level", sa.String(10), nullable=False),
        sa.Column("message", sa.String(1000), nullable=False),
        sa.Column("source_service", sa.String(20), nullable=False),
        sa.Column("target_service", sa.String(20), nullable=True),
        sa.Column("error_detail", sa.String(1000), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_order_saga_logs_order_id", "order_saga_logs", ["order_id"])
    op.create_index("ix_order_saga_logs_occurred_at", "order_saga_logs", ["occurred_at"])

    op.create_table(
        "reconciliation_settings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("interval_ms", sa.Integer(), nullable=False),
        sa.Column("stuck_threshold_minutes", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
    )
    op.execute(
        "INSERT INTO reconciliation_settings "
        "(id, interval_ms, stuck_threshold_minutes, max_attempts, updated_at) "
        "VALUES ('00000000-0000-0000-0000-000000000001', 60000, 2, 3, now())"
    )

    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("routing_key", sa.String(100), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_outbox_events_order_id", "outbox_events", ["order_id"])
    op.create_index("ix_outbox_events_created_at", "outbox_events", ["created_at"])
    op.create_index(
        "ix_outbox_events_unpublished",
        "outbox_events",
        ["published_at"],
        postgresql_where=sa.text("published_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("outbox_events")
    op.drop_table("reconciliation_settings")
    op.drop_table("order_saga_logs")
    op.drop_table("order_status_histories")
    op.drop_table("order_items")
    op.drop_table("orders")
