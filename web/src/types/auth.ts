export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// Mirrors user-service's user_response (users/presenters.py) — the account summary POST
// /auth/login returns alongside the token, and the body POST /auth/register returns.
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  roles: string[];
  status: string;
}

// Mirrors the `data` of POST /auth/login (user-service views/auth.py LoginView).
export interface LoginData {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}
