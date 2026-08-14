"""Root URL configuration + JSON error handlers.

Error handlers keep the ApiResponse envelope even for errors raised outside
DRF views (unknown routes, malformed requests, middleware failures).
"""
from django.http import JsonResponse
from django.urls import include, path

from users.errors import INTERNAL_SERVER_ERROR_MESSAGE


def _envelope(message: str, status: int) -> JsonResponse:
    return JsonResponse(
        {"success": False, "message": message, "data": None}, status=status
    )


def handler400(request, exception=None):
    return _envelope("Dữ liệu đầu vào không hợp lệ", 400)


def handler404(request, exception=None):
    return _envelope("Không tìm thấy tài nguyên", 404)


def handler500(request):
    return _envelope(INTERNAL_SERVER_ERROR_MESSAGE, 500)


urlpatterns = [
    path("", include("users.urls")),
]
