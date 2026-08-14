from __future__ import annotations

from fastapi import APIRouter

from app.json_utils import VNJSONResponse

router = APIRouter()


@router.get("/health")
def health():
    return VNJSONResponse(content={"status": "UP"})
