"""Business error codes → (HTTP status, byte-identical Vietnamese message)."""

VALIDATION_FAILED_MESSAGE = "Dữ liệu đầu vào không hợp lệ"
INTERNAL_SERVER_ERROR_MESSAGE = "Đã xảy ra lỗi hệ thống"
INTERNAL_KEY_INVALID_MESSAGE = "Yêu cầu nội bộ không hợp lệ"

ERROR_CATALOG: dict[str, tuple[int, str]] = {
    "EMAIL_ALREADY_EXISTS": (409, "Email đã được sử dụng"),
    "USERNAME_ALREADY_EXISTS": (409, "Username đã được sử dụng"),
    "INVALID_TOKEN": (401, "Token không hợp lệ hoặc đã hết hạn"),
    "INVALID_CREDENTIALS": (401, "Email, username hoặc mật khẩu không chính xác"),
    "PROFILE_NOT_FOUND": (404, "Không tìm thấy hồ sơ người dùng"),
    "USER_NOT_FOUND": (404, "Không tìm thấy người dùng"),
    "CURRENT_PASSWORD_INCORRECT": (400, "Mật khẩu hiện tại không chính xác"),
    "NEW_PASSWORD_SAME_AS_CURRENT": (
        400,
        "Mật khẩu mới không được giống mật khẩu hiện tại",
    ),
    "VALIDATION_FAILED": (400, VALIDATION_FAILED_MESSAGE),
    "RESET_TOKEN_INVALID": (400, "Reset token không hợp lệ"),
    "RESET_TOKEN_EXPIRED": (400, "Reset token đã hết hạn"),
    "RESET_TOKEN_USED": (400, "Reset token đã được sử dụng"),
    "ROLE_NOT_FOUND": (404, "Không tìm thấy vai trò"),
    "ROLE_ALREADY_EXISTS": (409, "Tên vai trò đã tồn tại"),
    "ROLE_IN_USE": (409, "Không thể xóa vai trò đang được gán cho người dùng"),
    "PERMISSION_NOT_FOUND": (404, "Không tìm thấy quyền"),
    "USER_ROLE_NOT_ASSIGNED": (404, "Người dùng chưa được gán vai trò này"),
    "FORBIDDEN": (403, "Bạn không có quyền thực hiện thao tác này"),
    "ADDRESS_NOT_FOUND": (404, "Không tìm thấy địa chỉ"),
    "INTERNAL_SERVER_ERROR": (500, INTERNAL_SERVER_ERROR_MESSAGE),
}


class ApiError(Exception):
    """Business exception carrying an error code from the catalog."""

    def __init__(self, code: str):
        if code not in ERROR_CATALOG:
            raise ValueError(f"Unknown error code: {code}")
        self.code = code
        self.http_status, self.message = ERROR_CATALOG[code]
        super().__init__(f"{code}: {self.message}")
