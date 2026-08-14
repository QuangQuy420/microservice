"""Gate for /internal/** service-to-service routes.

The X-Internal-Key header must equal INTERNAL_API_KEY exactly, otherwise the
request is rejected with 403 and the exact envelope from the spec — before it
reaches any view.
"""
import hmac

from django.conf import settings
from django.http import JsonResponse

from .errors import INTERNAL_KEY_INVALID_MESSAGE


class InternalKeyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/internal/"):
            provided = request.headers.get("X-Internal-Key", "")
            if not hmac.compare_digest(provided, settings.INTERNAL_API_KEY):
                return JsonResponse(
                    {
                        "success": False,
                        "message": INTERNAL_KEY_INVALID_MESSAGE,
                        "data": None,
                    },
                    status=403,
                )
        return self.get_response(request)
