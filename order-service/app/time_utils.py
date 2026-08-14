"""Naive Asia/Ho_Chi_Minh local timestamps — the service-wide time convention.

DB values and JSON timestamps are *naive local VN time* (no zone offset), and the
saga-log day grouping does `occurred_at::date` in that local time. Clients and the
spec (docs/specs/order-service-spec.md §1) depend on this exact convention.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def now_vn() -> datetime:
    """Current wall-clock time in VN, as a naive datetime."""
    return datetime.now(VN_TZ).replace(tzinfo=None)
