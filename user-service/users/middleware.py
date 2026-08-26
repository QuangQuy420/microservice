"""Gate for /internal/** service-to-service routes.

The X-Internal-Key header must equal INTERNAL_API_KEY exactly, otherwise the
request is rejected with 403 INVALID_INTERNAL_KEY in the error envelope —
before it reaches any view.
"""
import hmac

from django.conf import settings
from django.http import JsonResponse

from .errors import ERROR_CATALOG


class InternalKeyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/internal/"):
            provided = request.headers.get("X-Internal-Key", "")
            if not hmac.compare_digest(provided, settings.INTERNAL_API_KEY):
                status, message = ERROR_CATALOG["INVALID_INTERNAL_KEY"]
                return JsonResponse(
                    {
                        "error": {
                            "code": "INVALID_INTERNAL_KEY",
                            "message": message,
                        }
                    },
                    status=status,
                )
        return self.get_response(request)
