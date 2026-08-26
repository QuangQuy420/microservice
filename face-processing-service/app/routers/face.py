"""`POST /analyze`, `GET /analyses`, and `GET /health` — thin routers, no business logic.

Validates content-type/size at the boundary (HTTP-level constraints on the raw upload,
not domain logic), then delegates the actual analyze/store/persist orchestration to
`FaceAnalysisService` via `Depends` — per coder.md §3, routers must not call
repositories (S3/DB) directly.

`X-User-Id` is trusted as-is: `api-gateway` has already verified the caller's JWT and
forwards this header — this service does not re-verify the JWT itself (Q4).
"""
import uuid

from fastapi import APIRouter, Depends, Header, UploadFile, status

from app.errors import BadRequestError, NotFoundError, UnprocessableError
from app.schemas.face import AnalysisListEnvelope, AnalyzeEnvelope
from app.services.face_analysis_service import (
    FaceAnalysisService,
    HistoryItemNotFoundError,
    get_face_analysis_service,
)
from app.services.face_shape_service import (
    InvalidImageError,
    MultipleFacesDetectedError,
    NoFaceDetectedError,
)

router = APIRouter()

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB (NFR2)


def _require_user_id(x_user_id: str | None) -> uuid.UUID:
    """Parse the `X-User-Id` header, raising 400 (not FastAPI's default 422) if it's
    missing or not a valid UUID — gateway guarantees it's present, but the router still
    validates defensively (Q4: this service trusts, but does not skip presence checks)."""
    if not x_user_id:
        raise BadRequestError("MISSING_HEADER", "Required header 'X-User-Id' is missing.")
    try:
        return uuid.UUID(x_user_id)
    except ValueError as exc:
        raise BadRequestError(
            "MALFORMED_REQUEST", "Header 'X-User-Id' must be a valid UUID."
        ) from exc


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/analyze", response_model=AnalyzeEnvelope)
async def analyze(
    file: UploadFile,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> AnalyzeEnvelope:
    user_id = _require_user_id(x_user_id)

    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise UnprocessableError(
            "FILE_TYPE_INVALID",
            (
                f"File type '{file.content_type}' is not supported — "
                "only image/jpeg, image/png, or image/webp are accepted."
            ),
        )

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise UnprocessableError(
            "FILE_TOO_LARGE", "Image is too large — the maximum allowed size is 10MB."
        )

    try:
        result = await service.analyze_and_store(
            user_id=user_id, data=data, filename=file.filename, content_type=file.content_type
        )
    except NoFaceDetectedError as exc:
        raise UnprocessableError("NO_FACE_DETECTED", str(exc)) from exc
    except MultipleFacesDetectedError as exc:
        raise UnprocessableError("MULTIPLE_FACES_DETECTED", str(exc)) from exc
    except InvalidImageError as exc:
        raise UnprocessableError("INVALID_IMAGE", str(exc)) from exc

    return AnalyzeEnvelope(data=result)


@router.get("/analyses", response_model=AnalysisListEnvelope)
async def list_analyses(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> AnalysisListEnvelope:
    user_id = _require_user_id(x_user_id)
    return AnalysisListEnvelope(data=await service.list_history(user_id))


@router.delete("/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis(
    analysis_id: uuid.UUID,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> None:
    user_id = _require_user_id(x_user_id)
    try:
        await service.delete_history_item(user_id=user_id, analysis_id=analysis_id)
    except HistoryItemNotFoundError as exc:
        raise NotFoundError("ANALYSIS_NOT_FOUND", "Face analysis not found.") from exc
