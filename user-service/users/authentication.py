"""Central Bearer-JWT authentication (DRF authentication class).

Any missing/invalid token on a protected endpoint yields the 401
INVALID_TOKEN envelope via the central exception handler.
"""
import uuid

import jwt as pyjwt
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication

from .jwt_utils import decode_token
from .models import User


class JwtAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header:
            return None  # No credentials -> NotAuthenticated on protected views

        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            raise exceptions.AuthenticationFailed()

        try:
            payload = decode_token(parts[1])
        except pyjwt.PyJWTError:
            raise exceptions.AuthenticationFailed()

        try:
            user_id = uuid.UUID(str(payload.get("userId")))
        except (ValueError, TypeError):
            raise exceptions.AuthenticationFailed()

        user = User.objects.filter(id=user_id).first()
        if user is None:
            raise exceptions.AuthenticationFailed()

        return (user, payload)

    def authenticate_header(self, request):
        return self.keyword
