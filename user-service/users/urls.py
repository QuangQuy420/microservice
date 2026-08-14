"""URL routes — exact paths from the spec, no trailing slashes (the gateway
forwards without them)."""
from django.urls import path

from .views.addresses import AddressDetailView, AddressesView
from .views.auth import (
    ForgotPasswordView,
    LoginView,
    RegisterView,
    ResetPasswordView,
)
from .views.internal import HealthView, InternalUserPermissionsView
from .views.roles import PermissionListView, RoleDetailView, RolesView
from .views.users import (
    ChangePasswordView,
    MeView,
    UserListView,
    UserRoleDetailView,
    UserRolesView,
)

urlpatterns = [
    path("health", HealthView.as_view()),
    # Auth (public)
    path("api/v1/auth/register", RegisterView.as_view()),
    path("api/v1/auth/login", LoginView.as_view()),
    path("api/v1/auth/forgot-password", ForgotPasswordView.as_view()),
    path("api/v1/auth/reset-password", ResetPasswordView.as_view()),
    # Users
    path("api/v1/users", UserListView.as_view()),
    path("api/v1/users/me", MeView.as_view()),
    path("api/v1/users/change-password", ChangePasswordView.as_view()),
    path("api/v1/users/<str:user_id>/roles", UserRolesView.as_view()),
    path(
        "api/v1/users/<str:user_id>/roles/<str:role_id>",
        UserRoleDetailView.as_view(),
    ),
    # Roles / permissions
    path("api/v1/roles", RolesView.as_view()),
    path("api/v1/roles/<str:role_id>", RoleDetailView.as_view()),
    path("api/v1/permissions", PermissionListView.as_view()),
    # Addresses
    path("api/v1/addresses", AddressesView.as_view()),
    path("api/v1/addresses/<str:address_id>", AddressDetailView.as_view()),
    # Internal (X-Internal-Key)
    path(
        "internal/v1/users/<str:user_id>/permissions",
        InternalUserPermissionsView.as_view(),
    ),
]
