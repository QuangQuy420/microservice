"""Saga event consumer tests — idempotency via order-status guards.

These call the handler functions directly (the AMQP consumer dispatches to
the same functions), so no broker is needed.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.json_utils import loads
from app.models import Order, OrderSagaLog, OutboxEvent
from app.services import saga_events
from tests.conftest import add_cart, cart_item, create_order

USER = str(uuid.uuid4())


def _outbox(session):
    return session.scalars(select(OutboxEvent)).all()


def _stages(session, order_id):
    return [
        log.stage
        for log in session.scalars(
            select(OrderSagaLog)
            .where(OrderSagaLog.order_id == order_id)
            .order_by(OrderSagaLog.occurred_at)
        ).all()
    ]


class TestStockReserved:
    def test_pending_moves_to_awaiting_payment_and_requests_payment(self, session):
        order = create_order(session, user_id=USER, status="PENDING", total="240000.00")
        saga_events.handle_stock_reserved(session, str(order.id))

        session.refresh(order)
        assert order.status == "AWAITING_PAYMENT"
        assert order.status_histories[-1].note == "Đã giữ hàng thành công, chờ thanh toán"

        events = _outbox(session)
        assert [e.routing_key for e in events] == ["payment.create.requested"]
        payload = loads(events[0].payload)
        assert payload["orderId"] == str(order.id)
        assert payload["userId"] == USER
        assert payload["orderCode"] == order.order_code
        assert payload["amount"] == 240000.00
        assert payload["paymentMethod"] == "CARD"
        assert "occurredAt" in payload

        stages = _stages(session, order.id)
        assert stages == ["STOCK_RESERVED", "PAYMENT_CREATE_REQUESTED"]

    @pytest.mark.parametrize(
        "status", ["AWAITING_PAYMENT", "CONFIRMED", "PROCESSING", "SHIPPING", "DELIVERED", "COMPLETED"]
    )
    def test_ignored_in_other_states(self, session, status):
        order = create_order(session, user_id=USER, status=status)
        saga_events.handle_stock_reserved(session, str(order.id))
        session.refresh(order)
        assert order.status == status
        assert _outbox(session) == []
        assert _stages(session, order.id) == []

    def test_late_reserved_on_cancelled_order_triggers_release_via_outbox(self, session):
        vid = uuid.uuid4()
        order = create_order(
            session, user_id=USER, status="CANCELLED", items=[(vid, 2, "100000.00")]
        )
        saga_events.handle_stock_reserved(session, str(order.id))

        session.refresh(order)
        assert order.status == "CANCELLED"  # never advanced
        events = _outbox(session)
        assert [e.routing_key for e in events] == ["stock.release.requested"]
        payload = loads(events[0].payload)
        assert payload["items"] == [{"variantId": str(vid), "quantity": 2}]
        assert _stages(session, order.id) == ["STOCK_RELEASE_REQUESTED"]

    def test_unknown_order_is_ignored(self, session):
        saga_events.handle_stock_reserved(session, str(uuid.uuid4()))
        assert _outbox(session) == []

    def test_duplicate_delivery_is_noop(self, session):
        order = create_order(session, user_id=USER, status="PENDING")
        saga_events.handle_stock_reserved(session, str(order.id))
        saga_events.handle_stock_reserved(session, str(order.id))  # redelivery
        assert len(_outbox(session)) == 1  # only one payment request


class TestStockReserveRejected:
    def test_pending_is_cancelled_with_reason(self, session):
        order = create_order(session, user_id=USER, status="PENDING")
        saga_events.handle_stock_reserve_rejected(session, str(order.id), "Hết hàng size 52")
        session.refresh(order)
        assert order.status == "CANCELLED"
        assert order.status_histories[-1].note == "Hết hàng size 52"
        assert _outbox(session) == []  # nothing reserved → no release
        assert _stages(session, order.id) == ["STOCK_RESERVE_REJECTED"]

    def test_default_reason(self, session):
        order = create_order(session, user_id=USER, status="PENDING")
        saga_events.handle_stock_reserve_rejected(session, str(order.id), None)
        session.refresh(order)
        assert order.status_histories[-1].note == "Không đủ hàng trong kho"

    @pytest.mark.parametrize("status", ["AWAITING_PAYMENT", "CONFIRMED", "CANCELLED", "COMPLETED"])
    def test_ignored_in_other_states(self, session, status):
        order = create_order(session, user_id=USER, status=status)
        saga_events.handle_stock_reserve_rejected(session, str(order.id), "lý do")
        session.refresh(order)
        assert order.status == status


class TestPaymentCompleted:
    def test_awaiting_payment_confirms_sets_fields_and_clears_cart_items(
        self, session, cart_repo
    ):
        ordered_vid = uuid.uuid4()
        other_vid = uuid.uuid4()
        order = create_order(
            session,
            user_id=USER,
            status="AWAITING_PAYMENT",
            items=[(ordered_vid, 1, "100000.00")],
        )
        add_cart(
            cart_repo,
            USER,
            [
                cart_item(uuid.uuid4(), ordered_vid),
                cart_item(uuid.uuid4(), other_vid),
            ],
        )
        payment_id = str(uuid.uuid4())
        saga_events.handle_payment_completed(
            session, cart_repo, str(order.id), payment_id, "TXN-000042"
        )
        session.refresh(order)
        assert order.status == "CONFIRMED"
        assert order.payment_status == "PAID"
        assert str(order.payment_id) == payment_id
        assert order.transaction_code == "TXN-000042"
        assert order.status_histories[-1].note == "Thanh toán thành công"
        assert _stages(session, order.id) == ["PAYMENT_COMPLETED"]
        # only the ordered variant is removed from the cart
        cart = cart_repo.load(USER)
        remaining = [i["variantId"] for i in cart["items"]]
        assert remaining == [str(other_vid)]

    def test_cart_key_deleted_when_all_items_ordered(self, session, cart_repo):
        vid = uuid.uuid4()
        order = create_order(
            session, user_id=USER, status="AWAITING_PAYMENT", items=[(vid, 1, "1.00")]
        )
        add_cart(cart_repo, USER, [cart_item(uuid.uuid4(), vid)])
        saga_events.handle_payment_completed(
            session, cart_repo, str(order.id), str(uuid.uuid4()), "TXN-1"
        )
        assert cart_repo.load(USER) is None

    @pytest.mark.parametrize("status", ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"])
    def test_ignored_in_other_states(self, session, cart_repo, status):
        order = create_order(session, user_id=USER, status=status)
        saga_events.handle_payment_completed(
            session, cart_repo, str(order.id), str(uuid.uuid4()), "TXN-9"
        )
        session.refresh(order)
        assert order.status == status
        assert order.payment_id is None

    def test_duplicate_delivery_is_noop(self, session, cart_repo):
        order = create_order(session, user_id=USER, status="AWAITING_PAYMENT")
        first_payment = str(uuid.uuid4())
        saga_events.handle_payment_completed(
            session, cart_repo, str(order.id), first_payment, "TXN-1"
        )
        saga_events.handle_payment_completed(
            session, cart_repo, str(order.id), str(uuid.uuid4()), "TXN-2"
        )
        session.refresh(order)
        assert str(order.payment_id) == first_payment
        assert order.transaction_code == "TXN-1"


class TestPaymentFailed:
    def test_awaiting_payment_cancels_and_releases_stock(self, session):
        vid = uuid.uuid4()
        order = create_order(
            session, user_id=USER, status="AWAITING_PAYMENT", items=[(vid, 2, "50000.00")]
        )
        saga_events.handle_payment_failed(session, str(order.id), "Thẻ bị từ chối")
        session.refresh(order)
        assert order.status == "CANCELLED"
        assert order.payment_status == "FAILED"
        assert order.status_histories[-1].note == "Thẻ bị từ chối"
        events = _outbox(session)
        assert [e.routing_key for e in events] == ["stock.release.requested"]
        assert _stages(session, order.id) == ["PAYMENT_FAILED", "STOCK_RELEASE_REQUESTED"]

    def test_default_reason(self, session):
        order = create_order(session, user_id=USER, status="AWAITING_PAYMENT")
        saga_events.handle_payment_failed(session, str(order.id), None)
        session.refresh(order)
        assert order.status_histories[-1].note == "Thanh toán thất bại"

    @pytest.mark.parametrize("status", ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"])
    def test_ignored_in_other_states(self, session, status):
        order = create_order(session, user_id=USER, status=status)
        saga_events.handle_payment_failed(session, str(order.id), "lý do")
        session.refresh(order)
        assert order.status == status
        assert _outbox(session) == []


class TestDeadLetterLog:
    def test_records_warn_saga_log(self, session):
        order = create_order(session, user_id=USER)
        saga_events.record_dead_letter(session, str(order.id), "payment.completed", 10)
        log = session.scalars(select(OrderSagaLog)).one()
        assert log.stage == "DEAD_LETTERED"
        assert log.level == "WARN"
        assert log.source_service == "MESSAGE_BROKER"
        assert (
            log.message
            == "Message 'payment.completed' bị chuyển vào dead-letter queue sau 10 lần redeliver"
        )

    def test_unknown_order_is_ignored(self, session):
        saga_events.record_dead_letter(session, str(uuid.uuid4()), "stock.reserved", 3)
        assert session.scalars(select(OrderSagaLog)).all() == []
