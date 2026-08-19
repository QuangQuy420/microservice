"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { saveAccessToken } from "@/lib/auth/session";
import { useAuthForm } from "@/hooks/useAuthForm";
import Link from  "next/link";

// The auth screens share one field/submit look; `.input` (globals.css) carries the common
// border/focus ring, the extras here are the auth-only deltas (taller box, rounder corners,
// warmer fill). `motion-reduce:` replaces the old global prefers-reduced-motion override.
const LABEL_CLASS = "flex flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary";

const INPUT_CLASS =
  "input min-h-[46px] rounded-[10px] bg-[#fffdf9] px-[0.85rem] py-[0.72rem] text-[0.92rem] " +
  "motion-reduce:transition-none";

const SUBMIT_CLASS =
  "mt-1 min-h-[46px] cursor-pointer rounded-[10px] border border-text bg-text px-4 py-3 " +
  "font-body text-[0.9rem] font-bold text-surface " +
  "transition-[background-color,translate,box-shadow] duration-200 ease-in-out " +
  "enabled:hover:-translate-y-px enabled:hover:border-accent-dark enabled:hover:bg-accent-dark " +
  "enabled:hover:shadow-[0_10px_22px_rgba(43,36,32,0.14)] " +
  "disabled:cursor-not-allowed disabled:opacity-[0.58] motion-reduce:transition-none";

interface FieldErrors {
  identifier?: string;
  password?: string;
}

function validate(
    identifier: string,
    password: string,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!identifier.trim()) {
    errors.identifier = "Email hoặc tên đăng nhập là bắt buộc.";
  }

  if (!password) {
    errors.password = "Mật khẩu là bắt buộc.";
  } else if (password.length < 8) {
    errors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
  }

  return errors;
}

export function LoginForm() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] =
      useState<FieldErrors>({});

  const {
    isSubmitting,
    error,
    submit,
  } = useAuthForm(login);

  async function handleSubmit(
      event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const errors = validate(identifier, password);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const response = await submit({
      identifier,
      password,
    });

    if (!response) {
      return;
    }

    const token =
        response.data.accessToken ??
        response.data.token;

    if (!token) {
      return;
    }

    saveAccessToken(token);
    router.push("/");
    router.refresh();
  }

  return (
      <form
          className="flex w-full flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
      >
        <label htmlFor="login-identifier" className={LABEL_CLASS}>
          Email hoặc tên đăng nhập
          <input
              id="login-identifier"
              className={INPUT_CLASS}
              type="text"
              value={identifier}
              onChange={(event) =>
                  setIdentifier(event.target.value)
              }
              autoComplete="username"
          />

          {fieldErrors.identifier && (
              <span className="field-error">
            {fieldErrors.identifier}
          </span>
          )}
        </label>

        <label htmlFor="login-password" className={LABEL_CLASS}>
          Mật khẩu
          <input
              id="login-password"
              className={INPUT_CLASS}
              type="password"
              value={password}
              onChange={(event) =>
                  setPassword(event.target.value)
              }
              autoComplete="current-password"
          />
          <div className="-mt-[0.35rem] flex justify-end">
            <Link
                href="/forgot-password"
                className="text-[0.8rem] font-[650] text-accent-dark no-underline hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>

          {fieldErrors.password && (
              <span className="field-error">
            {fieldErrors.password}
          </span>
          )}
        </label>

        <button type="submit" className={SUBMIT_CLASS} disabled={isSubmitting}>
          {isSubmitting
              ? "Đang đăng nhập..."
              : "Đăng nhập"}
        </button>

        {error && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {error}
            </p>
        )}
      </form>
  );
}