"""Internal service-to-service endpoints (gated by InternalKeyMiddleware)."""
from rest_framework.views import APIView

from ..responses import ok
from .helpers import get_user_or_404


class InternalUserPermissionsView(APIView):
    # The X-Internal-Key check happens in InternalKeyMiddleware, before this
    # view runs. No Bearer token is involved on /internal/** routes.
    authentication_classes = []
    permission_classes = []

    def get(self, request, user_id):
        user = get_user_or_404(user_id)
        return ok(
            "Lấy danh sách quyền của người dùng thành công",
            {"permissions": user.permission_codes()},
        )


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return ok("OK", {"status": "UP"})
