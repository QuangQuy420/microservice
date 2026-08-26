"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiErrorDetails, changePassword, useApiError } from "@/lib/api";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";
import { ApiError } from "@/lib/api";

// Profile/password fields keep `font: inherit` (they read their size/weight from the label), so
// they don't reuse the `.input` shared class the auth screens build on.
const LABEL_CLASS = "flex flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary";

const INPUT_CLASS =
    "min-h-[46px] rounded-[10px] border border-border bg-[#fffdf9] px-[0.85rem] py-[0.72rem] " +
    "text-text outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(201,123,74,0.13)]";

const SUBMIT_CLASS =
    "min-h-[46px] cursor-pointer rounded-[10px] border-0 bg-text px-5 py-3 font-bold text-surface";

export default function ChangePasswordPage() {
    const router = useRouter();
    const t = useTranslations("auth");
    const translateError = useApiError();

    const [currentPassword, setCurrentPassword] =
        useState("");
    const [newPassword, setNewPassword] =
        useState("");
    const [confirmPassword, setConfirmPassword] =
        useState("");

    const [submitting, setSubmitting] =
        useState(false);
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

        if (newPassword.length < 8) {
            setError(t("changePassword.errors.passwordTooShort"));
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(t("changePassword.errors.confirmPasswordMismatch"));
            return;
        }

        const token = getAccessToken();

        if (!token) {
            router.replace("/login");
            return;
        }

        setSubmitting(true);

        try {
            // Resolves to null — the backend sends no success message, so the copy lives here.
            await changePassword(token, {
                currentPassword,
                newPassword,
            });

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setMessage(t("changePassword.success"));
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                removeAccessToken();
                router.replace("/login");
                return;
            }

            setError(translateError(err));
            setFieldErrors(apiErrorDetails(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="mx-auto grid min-h-[calc(100vh-180px)] max-w-[1100px] place-items-center p-6 max-sm:px-4">
        <section className="w-[min(100%,520px)] rounded-[18px] border border-border bg-surface p-[clamp(1.5rem,4vw,2.25rem)] shadow-[0_16px_40px_rgba(43,36,32,0.07)]">
        <p className="mb-[0.45rem] text-[0.75rem] font-bold tracking-[0.1em] text-accent-dark uppercase">
            {t("changePassword.eyebrow")}
    </p>

    <h1 className="mb-[0.65rem] font-heading text-[clamp(1.8rem,4vw,2.35rem)] font-bold">{t("changePassword.title")}</h1>

    <p className="leading-[1.6] text-text-secondary">
        {t("changePassword.subtitle")}
    </p>

    <form
    className="mt-6 flex flex-col gap-4"
    onSubmit={handleSubmit}
        >
        <label className={LABEL_CLASS}>
            {t("changePassword.currentPasswordLabel")}
    <input
    className={INPUT_CLASS}
    type="password"
    value={currentPassword}
    onChange={(event) =>
    setCurrentPassword(event.target.value)
}
    autoComplete="current-password"
    required
    />

    {/* Server-side 422 details are English text authored by the backend (FR5 fallback). */}
    {fieldErrors.currentPassword?.map((msg) => (
        <span key={msg} className="field-error">
        {msg}
        </span>
    ))}
    </label>

    <label className={LABEL_CLASS}>
    {t("changePassword.newPasswordLabel")}
    <input
    className={INPUT_CLASS}
    type="password"
    value={newPassword}
    onChange={(event) =>
    setNewPassword(event.target.value)
}
    autoComplete="new-password"
    minLength={8}
    required
    />

    {fieldErrors.newPassword?.map((msg) => (
        <span key={msg} className="field-error">
        {msg}
        </span>
    ))}
    </label>

    <label className={LABEL_CLASS}>
    {t("changePassword.confirmPasswordLabel")}
    <input
    className={INPUT_CLASS}
    type="password"
    value={confirmPassword}
    onChange={(event) =>
    setConfirmPassword(event.target.value)
}
    autoComplete="new-password"
    minLength={8}
    required
    />
    </label>

    <button
    className={SUBMIT_CLASS}
    type="submit"
    disabled={submitting}
    >
    {submitting
        ? t("changePassword.submitting")
        : t("changePassword.submit")}
    </button>

    {message && (
        <p role="status" className="my-[1em]">{message}</p>
    )}

    {error && (
        <p role="alert" className="my-[1em] text-[#a92828]">
        {error}
        </p>
    )}
    </form>
    </section>
    </main>
);
}