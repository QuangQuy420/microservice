"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { apiErrorDetails, resetPassword, useApiError } from "@/lib/api";

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

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ResetPasswordForm />
        </Suspense>
    );
}

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const t = useTranslations("auth");
    const translateError = useApiError();

    const tokenFromUrl = searchParams.get("token") ?? "";

    const [token, setToken] = useState(tokenFromUrl);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] =
        useState("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] =
        useState<Record<string, string[]>>({});
    const [message, setMessage] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");
        setFieldErrors({});
        setMessage("");

        if (!token.trim()) {
            setError(t("resetPassword.errors.tokenRequired"));
            return;
        }

        if (newPassword.length < 8) {
            setError(t("resetPassword.errors.passwordTooShort"));
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(t("resetPassword.errors.confirmPasswordMismatch"));
            return;
        }

        setSubmitting(true);

        try {
            // Resolves to null — the backend sends no success message, so the copy lives here.
            await resetPassword({
                token: token.trim(),
                newPassword,
            });

            setNewPassword("");
            setConfirmPassword("");

            setMessage(t("resetPassword.success"));
        } catch (err) {
            setError(translateError(err));
            setFieldErrors(apiErrorDetails(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="mx-auto grid min-h-[calc(100vh-190px)] max-w-[1100px] place-items-center px-6 py-[clamp(2rem,6vw,4.5rem)] max-sm:px-4">
            <section className="w-[min(100%,450px)] rounded-[18px] border border-border bg-surface p-[clamp(1.4rem,4vw,2.25rem)] shadow-[0_22px_55px_rgba(43,36,32,0.09)]">
                <p className="mb-[0.55rem] text-[0.76rem] font-bold tracking-[0.11em] text-accent-dark uppercase">
                    {t("resetPassword.eyebrow")}
                </p>

                <h1 className="mb-[0.6rem] font-heading text-[clamp(1.7rem,4vw,2.25rem)] font-[650]">
                    {t("resetPassword.title")}
                </h1>

                <p className="mb-6 text-[0.92rem] leading-[1.6] text-text-secondary">
                    {t("resetPassword.subtitle")}
                </p>

                <form
                    className="flex w-full flex-col gap-4"
                    onSubmit={handleSubmit}
                    noValidate
                >
                    <label htmlFor="reset-token" className={LABEL_CLASS}>
                        {t("resetPassword.tokenLabel")}
                        <input
                            id="reset-token"
                            className={INPUT_CLASS}
                            type="text"
                            value={token}
                            onChange={(event) =>
                                setToken(event.target.value)
                            }
                            autoComplete="off"
                        />

                        {/* Server-side 422 details are English text authored by the backend (FR5 fallback). */}
                        {fieldErrors.token?.map((msg) => (
                            <span key={msg} className="field-error">
                                {msg}
                            </span>
                        ))}
                    </label>

                    <label htmlFor="reset-new-password" className={LABEL_CLASS}>
                        {t("resetPassword.newPasswordLabel")}
                        <input
                            id="reset-new-password"
                            className={INPUT_CLASS}
                            type="password"
                            value={newPassword}
                            onChange={(event) =>
                                setNewPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            minLength={8}
                        />

                        {fieldErrors.newPassword?.map((msg) => (
                            <span key={msg} className="field-error">
                                {msg}
                            </span>
                        ))}
                    </label>

                    <label htmlFor="reset-confirm-password" className={LABEL_CLASS}>
                        {t("resetPassword.confirmPasswordLabel")}
                        <input
                            id="reset-confirm-password"
                            className={INPUT_CLASS}
                            type="password"
                            value={confirmPassword}
                            onChange={(event) =>
                                setConfirmPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            minLength={8}
                        />
                    </label>

                    <button type="submit" className={SUBMIT_CLASS} disabled={submitting}>
                        {submitting
                            ? t("resetPassword.submitting")
                            : t("resetPassword.submit")}
                    </button>

                    {message && (
                        <p role="status" className="text-[0.84rem] text-[#3d6654]">{message}</p>
                    )}

                    {error && (
                        <p role="alert" className="my-[1em] text-[#a92828]">
                            {error}
                        </p>
                    )}
                </form>

                <div className="mt-5 text-center text-[0.86rem] text-text-secondary">
                    <Link href="/login" className="font-bold no-underline hover:underline">
                        {t("resetPassword.backToLogin")}
                    </Link>
                </div>
            </section>
        </main>
    );
}
