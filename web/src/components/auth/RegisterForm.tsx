"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { register } from "@/lib/api";
import { useAuthForm } from "@/hooks/useAuthForm";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    username?: string;
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
}

function validate(
    username: string,
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string,
): FieldErrors {
    const errors: FieldErrors = {};

    if (!username.trim()) {
        errors.username = "register.errors.usernameRequired";
    }

    if (!fullName.trim()) {
        errors.fullName = "register.errors.fullNameRequired";
    }

    if (!email.trim()) {
        errors.email = "register.errors.emailRequired";
    } else if (!EMAIL_PATTERN.test(email)) {
        errors.email = "register.errors.emailInvalid";
    }

    if (!password) {
        errors.password = "register.errors.passwordRequired";
    } else if (password.length < 8) {
        errors.password = "register.errors.passwordTooShort";
    }

    if (confirmPassword !== password) {
        errors.confirmPassword = "register.errors.confirmPasswordMismatch";
    }

    return errors;
}

export function RegisterForm() {
    const router = useRouter();
    const t = useTranslations("auth");

    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] =
        useState("");

    const [fieldErrors, setFieldErrors] =
        useState<FieldErrors>({});

    const {
        isSubmitting,
        error,
        details,
        success,
        submit,
    } = useAuthForm(register);

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        const errors = validate(
            username,
            fullName,
            email,
            password,
            confirmPassword,
        );

        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            return;
        }

        const response = await submit({
            username,
            fullName,
            email,
            phone: phone || undefined,
            password,
        });

        if (!response) {
            return;
        }

        setTimeout(() => {
            router.push("/login");
        }, 700);
    }

    return (
        <form
            className="flex w-full flex-col gap-4"
            onSubmit={handleSubmit}
            noValidate
        >
            <label htmlFor="register-username" className={LABEL_CLASS}>
                {t("register.usernameLabel")}
                <input
                    id="register-username"
                    className={INPUT_CLASS}
                    type="text"
                    value={username}
                    onChange={(event) =>
                        setUsername(event.target.value)
                    }
                    autoComplete="username"
                />

                {fieldErrors.username && (
                    <span className="field-error">
            {t(fieldErrors.username)}
          </span>
                )}

                {/* Server-side 422 details are English text authored by the backend (FR5 fallback). */}
                {details.username?.map((msg) => (
                    <span key={msg} className="field-error">
            {msg}
          </span>
                ))}
            </label>

            <label htmlFor="register-full-name" className={LABEL_CLASS}>
                {t("register.fullNameLabel")}
                <input
                    id="register-full-name"
                    className={INPUT_CLASS}
                    type="text"
                    value={fullName}
                    onChange={(event) =>
                        setFullName(event.target.value)
                    }
                    autoComplete="name"
                />

                {fieldErrors.fullName && (
                    <span className="field-error">
            {t(fieldErrors.fullName)}
          </span>
                )}

                {details.fullName?.map((msg) => (
                    <span key={msg} className="field-error">
            {msg}
          </span>
                ))}
            </label>

            <label htmlFor="register-email" className={LABEL_CLASS}>
                {t("register.emailLabel")}
                <input
                    id="register-email"
                    className={INPUT_CLASS}
                    type="email"
                    value={email}
                    onChange={(event) =>
                        setEmail(event.target.value)
                    }
                    autoComplete="email"
                />

                {fieldErrors.email && (
                    <span className="field-error">
            {t(fieldErrors.email)}
          </span>
                )}

                {details.email?.map((msg) => (
                    <span key={msg} className="field-error">
            {msg}
          </span>
                ))}
            </label>

            <label htmlFor="register-phone" className={LABEL_CLASS}>
                {t("register.phoneLabel")}
                <input
                    id="register-phone"
                    className={INPUT_CLASS}
                    type="tel"
                    value={phone}
                    onChange={(event) =>
                        setPhone(event.target.value)
                    }
                    autoComplete="tel"
                />

                {details.phone?.map((msg) => (
                    <span key={msg} className="field-error">
            {msg}
          </span>
                ))}
            </label>

            <label htmlFor="register-password" className={LABEL_CLASS}>
                {t("register.passwordLabel")}
                <input
                    id="register-password"
                    className={INPUT_CLASS}
                    type="password"
                    value={password}
                    onChange={(event) =>
                        setPassword(event.target.value)
                    }
                    autoComplete="new-password"
                />

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

            <label htmlFor="register-confirm-password" className={LABEL_CLASS}>
                {t("register.confirmPasswordLabel")}
                <input
                    id="register-confirm-password"
                    className={INPUT_CLASS}
                    type="password"
                    value={confirmPassword}
                    onChange={(event) =>
                        setConfirmPassword(event.target.value)
                    }
                    autoComplete="new-password"
                />

                {fieldErrors.confirmPassword && (
                    <span className="field-error">
            {t(fieldErrors.confirmPassword)}
          </span>
                )}
            </label>

            <button type="submit" className={SUBMIT_CLASS} disabled={isSubmitting}>
                {isSubmitting
                    ? t("register.submitting")
                    : t("register.submit")}
            </button>

            {error && (
                <p role="alert" className="my-[1em] text-[#a92828]">
                    {error}
                </p>
            )}

            {success && (
                <p role="status" className="text-[0.84rem] text-[#3d6654]">
                    {t("register.success")}
                </p>
            )}
        </form>
    );
}
