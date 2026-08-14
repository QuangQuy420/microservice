from __future__ import annotations

from sqlalchemy.orm import Session

from app.enums import SagaLogLevel, SagaLogService, SagaLogStage
from app.models import OrderSagaLog
from app.time_utils import now_vn


def add_log(
    session: Session,
    order_id,
    stage: SagaLogStage,
    message: str,
    *,
    level: SagaLogLevel = SagaLogLevel.INFO,
    source: SagaLogService = SagaLogService.ORDER_SERVICE,
    target: SagaLogService | None = None,
    error_detail: str | None = None,
    retry_count: int | None = None,
) -> OrderSagaLog:
    log = OrderSagaLog(
        order_id=order_id,
        stage=stage.value,
        level=level.value,
        message=message[:1000],
        source_service=source.value,
        target_service=target.value if target else None,
        error_detail=error_detail[:1000] if error_detail else None,
        retry_count=retry_count,
        occurred_at=now_vn(),
    )
    session.add(log)
    return log
