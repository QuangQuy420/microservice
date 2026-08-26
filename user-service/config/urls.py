"""Root URL configuration + JSON error handlers.

Error handlers keep the error envelope even for errors raised outside
DRF views (unknown routes, malformed requests, middleware failures).
"""
from django.http import JsonResponse
from django.urls import include, path

from users.errors import ERROR_CATALOG


def _envelope(code: str) -> JsonResponse:
    status, message = ERROR_CATALOG[code]
    return JsonResponse({"error": {"code": code, "message": message}}, status=status)


def handler400(request, exception=None):
    return _envelope("MALFORMED_REQUEST")


def handler404(request, exception=None):
    return _envelope("NOT_FOUND")


def handler500(request):
    return _envelope("INTERNAL_ERROR")


urlpatterns = [
    path("", include("users.urls")),
]
