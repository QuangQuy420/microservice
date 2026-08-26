"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

// Field errors hold message keys, not text, so the rendered copy follows the active locale.
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
    errors.identifier = "login.errors.identifierRequired";
  }

  if (!password) {
    errors.password = "login.errors.passwordRequired";
  } else if (password.length < 8) {
    errors.password = "login.errors.passwordTooShort";
  }

  return errors;
}

export function LoginForm() {
  const router = useRouter();
  const t = useTranslations("auth");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] =
      useState<FieldErrors>({});

  const {
    isSubmitting,
    error,
    details,
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

    saveAccessToken(response.accessToken);
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
          {t("login.identifierLabel")}
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
            {t(fieldErrors.identifier)}
          </span>
          )}

          {/* Server-side 422 details are English text authored by the backend (FR5 fallback). */}
          {details.identifier?.map((msg) => (
              <span key={msg} className="field-error">
            {msg}
          </span>
          ))}
        </label>

        <label htmlFor="login-password" className={LABEL_CLASS}>
          {t("login.passwordLabel")}
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
              {t("login.forgotPassword")}
            </Link>
          </div>

          {fieldErrors.password && (
              <span className="field-error">
            {t(fieldErrors.password)}
          </span>
          )}

          {details.password?.map((msg) => (
              <span key={msg} className="field-error">
            {msg}
          </span>
          ))}
        </label>

        <button type="submit" className={SUBMIT_CLASS} disabled={isSubmitting}>
          {isSubmitting
              ? t("login.submitting")
              : t("login.submit")}
        </button>

        {error && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {error}
            </p>
        )}
      </form>
  );
}
