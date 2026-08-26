"""Public auth endpoints: register, login, forgot-password, reset-password."""
import base64
import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone

from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView

from ..errors import ApiError
from ..jwt_utils import issue_token
from ..models import PasswordResetToken, Profile, Role, User, UserRole
from ..presenters import user_response
from ..responses import data_response
from ..security import check_password, hash_password
from ..serializers import (
    ForgotPasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
)

logger = logging.getLogger(__name__)

RESET_TOKEN_TTL = timedelta(minutes=15)


class PublicAPIView(APIView):
    authentication_classes = []
    permission_classes = []


class RegisterView(PublicAPIView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            if User.objects.filter(email=data["email"]).exists():
                raise ApiError("EMAIL_ALREADY_EXISTS")
            if User.objects.filter(username=data["username"]).exists():
                raise ApiError("USERNAME_ALREADY_EXISTS")

            customer_role = Role.objects.filter(name="CUSTOMER").first()
            if customer_role is None:
                raise ApiError("ROLE_NOT_FOUND")

            user = User.objects.create(
                email=data["email"],
                username=data["username"],
                password_hash=hash_password(data["password"]),
                status=User.STATUS_ACTIVE,
            )
            Profile.objects.create(
                user=user,
                full_name=data["fullName"],
                phone=data.get("phone") or None,
            )
            UserRole.objects.create(user=user, role=customer_role)

        return data_response(user_response(user), status=201)


class LoginView(PublicAPIView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        identifier = data["identifier"].strip().lower()
        user = User.objects.filter(
            Q(email=identifier) | Q(username=identifier)
        ).first()

        # Same 401 for unknown identifier, wrong password and non-ACTIVE
        # status — never leak which one failed.
        if (
            user is None
            or not check_password(data["password"], user.password_hash)
            or user.status != User.STATUS_ACTIVE
        ):
            raise ApiError("INVALID_CREDENTIALS")

        token, expires_in_seconds = issue_token(user)
        return data_response(
            {
                "accessToken": token,
                "tokenType": "Bearer",
                "expiresIn": expires_in_seconds,
                "user": user_response(user),
            }
        )


class ForgotPasswordView(PublicAPIView):
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email=email).first()
        if user is not None:
            with transaction.atomic():
                PasswordResetToken.objects.filter(user=user).delete()
                raw_token = (
                    base64.urlsafe_b64encode(os.urandom(32)).decode("ascii").rstrip("=")
                )
                PasswordResetToken.objects.create(
                    user=user,
                    token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
                    expires_at=datetime.now(timezone.utc) + RESET_TOKEN_TTL,
                )
            # Dev stand-in for sending an email — do NOT ship to
            # production with real users.
            logger.info("Password reset token for %s: %s", email, raw_token)

        return data_response(None)


class ResetPasswordView(PublicAPIView):
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        token_hash = hashlib.sha256(
            data["token"].strip().encode("utf-8")
        ).hexdigest()
        reset_token = (
            PasswordResetToken.objects.select_related("user")
            .filter(token_hash=token_hash)
            .first()
        )
        if reset_token is None:
            raise ApiError("RESET_TOKEN_INVALID")
        if reset_token.used_at is not None:  # checked before expiry (spec)
            raise ApiError("RESET_TOKEN_USED")
        if reset_token.expires_at < datetime.now(timezone.utc):
            raise ApiError("RESET_TOKEN_EXPIRED")

        user = reset_token.user
        if check_password(data["newPassword"], user.password_hash):
            raise ApiError("NEW_PASSWORD_SAME_AS_CURRENT")

        with transaction.atomic():
            user.password_hash = hash_password(data["newPassword"])
            user.save(update_fields=["password_hash", "updated_at"])
            reset_token.used_at = datetime.now(timezone.utc)
            reset_token.save(update_fields=["used_at", "updated_at"])

        return data_response(None)
