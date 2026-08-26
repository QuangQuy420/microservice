import type {
  AuthUser,
  ForgotPasswordRequest,
  LoginData,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from "@/types/auth";
import { apiFetch } from "./client";

export function login(payload: LoginRequest): Promise<LoginData> {
  return apiFetch<LoginData>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function register(payload: RegisterRequest): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function forgotPassword(payload: ForgotPasswordRequest): Promise<null> {
  return apiFetch<null>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetPassword(payload: ResetPasswordRequest): Promise<null> {
  return apiFetch<null>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
