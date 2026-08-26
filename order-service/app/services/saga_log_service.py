"""Admin saga-log queries. Day grouping uses occurred_at::date (naive VN time)."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import messages
from app.enums import SagaLogLevel
from app.errors import BadRequestError
from app.models import Order, OrderSagaLog
from app.services.serializers import saga_log_response


def _to_date_str(value) -> str:
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m-%d")
    return str(value)[:10]


def list_days(session: Session) -> list[dict]:
    day = func.date(OrderSagaLog.occurred_at)
    rows = session.execute(select(day.label("day"), func.count()).group_by(day)).all()
    warn_days = {
        _to_date_str(row[0])
        for row in session.execute(
            select(day).where(OrderSagaLog.level == SagaLogLevel.WARN.value).group_by(day)
        ).all()
    }
    result = [
        {
            "date": _to_date_str(row[0]),
            "totalCount": row[1],
            "hasWarning": _to_date_str(row[0]) in warn_days,
        }
        for row in rows
    ]
    result.sort(key=lambda item: item["date"], reverse=True)
    return result


def list_day_orders(session: Session, date_str: str) -> list[dict]:
    try:
        target = date.fromisoformat(date_str)
    except ValueError:
        raise BadRequestError(
            messages.MALFORMED_REQUEST,
            code="MALFORMED_REQUEST",
            details={"date": ["Invalid date (expected format yyyy-MM-dd)"]},
        )
    day = func.date(OrderSagaLog.occurred_at)
    rows = session.execute(
        select(OrderSagaLog, Order.order_code)
        .join(Order, Order.id == OrderSagaLog.order_id)
        .where(day == target)
        .order_by(OrderSagaLog.occurred_at)
    ).all()
    grouped: dict[str, dict] = {}
    for log, order_code in rows:
        key = str(log.order_id)
        entry = grouped.setdefault(
            key,
            {
                "orderId": key,
                "orderCode": order_code,
                "entryCount": 0,
                "worstLevel": SagaLogLevel.INFO.value,
                "lastOccurredAt": log.occurred_at,
            },
        )
        entry["entryCount"] += 1
        if log.level == SagaLogLevel.WARN.value:
            entry["worstLevel"] = SagaLogLevel.WARN.value
        if log.occurred_at > entry["lastOccurredAt"]:
            entry["lastOccurredAt"] = log.occurred_at
    result = list(grouped.values())
    result.sort(key=lambda item: item["lastOccurredAt"], reverse=True)
    return result


def list_order_logs(session: Session, order_id: str) -> list[dict]:
    try:
        oid = uuid.UUID(str(order_id))
    except ValueError:
        return []
    rows = session.scalars(
        select(OrderSagaLog)
        .where(OrderSagaLog.order_id == oid)
        .order_by(OrderSagaLog.occurred_at)
    ).all()
    return [saga_log_response(log) for log in rows]
