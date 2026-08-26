"""Error codes → (HTTP status, English message).

The code is the stable machine-readable contract; the message is a
developer-facing English fallback — clients translate by code.
"""

ERROR_CATALOG: dict[str, tuple[int, str]] = {
    "EMAIL_ALREADY_EXISTS": (409, "Email already exists"),
    "USERNAME_ALREADY_EXISTS": (409, "Username already exists"),
    "INVALID_TOKEN": (401, "Token is invalid or has expired"),
    "INVALID_CREDENTIALS": (401, "Email, username or password is incorrect"),
    "PROFILE_NOT_FOUND": (404, "User profile not found"),
    "USER_NOT_FOUND": (404, "User not found"),
    "CURRENT_PASSWORD_INCORRECT": (400, "Current password is incorrect"),
    "NEW_PASSWORD_SAME_AS_CURRENT": (
        400,
        "New password must be different from the current password",
    ),
    "RESET_TOKEN_INVALID": (400, "Reset token is invalid"),
    "RESET_TOKEN_EXPIRED": (400, "Reset token has expired"),
    "RESET_TOKEN_USED": (400, "Reset token has already been used"),
    "ROLE_NOT_FOUND": (404, "Role not found"),
    "ROLE_ALREADY_EXISTS": (409, "Role name already exists"),
    "ROLE_IN_USE": (409, "Cannot delete a role that is assigned to users"),
    "PERMISSION_NOT_FOUND": (404, "Permission not found"),
    "USER_ROLE_NOT_ASSIGNED": (404, "User does not have this role"),
    "FORBIDDEN": (403, "You do not have permission to perform this action"),
    "INVALID_INTERNAL_KEY": (403, "Invalid internal request"),
    "ADDRESS_NOT_FOUND": (404, "Address not found"),
    # Generic protocol/framework fallbacks
    "MALFORMED_REQUEST": (400, "Malformed request"),
    "NOT_FOUND": (404, "Resource not found"),
    "METHOD_NOT_ALLOWED": (405, "Method not allowed"),
    "UNSUPPORTED_MEDIA_TYPE": (415, "Unsupported media type"),
    "VALIDATION_ERROR": (422, "Invalid input"),
    "THROTTLED": (429, "Too many requests"),
    "INTERNAL_ERROR": (500, "Internal server error"),
}


class ApiError(Exception):
    """Business exception carrying an error code from the catalog."""

    def __init__(self, code: str):
        if code not in ERROR_CATALOG:
            raise ValueError(f"Unknown error code: {code}")
        self.code = code
        self.http_status, self.message = ERROR_CATALOG[code]
        super().__init__(f"{code}: {self.message}")
