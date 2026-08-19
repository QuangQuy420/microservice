"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/lib/api";
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

    const [currentPassword, setCurrentPassword] =
        useState("");
    const [newPassword, setNewPassword] =
        useState("");
    const [confirmPassword, setConfirmPassword] =
        useState("");

    const [submitting, setSubmitting] =
        useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");
        setMessage("");

        if (newPassword.length < 8) {
            setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Mật khẩu xác nhận không khớp.");
            return;
        }

        const token = getAccessToken();

        if (!token) {
            router.replace("/login");
            return;
        }

        setSubmitting(true);

        try {
            await changePassword(token, {
                currentPassword,
                newPassword,
            });

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setMessage("Đổi mật khẩu thành công.");
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                removeAccessToken();
                router.replace("/login");
                return;
            }

            setError(
                err instanceof ApiError
                    ? err.message
                    : "Đổi mật khẩu thất bại.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="mx-auto grid min-h-[calc(100vh-180px)] max-w-[1100px] place-items-center p-6 max-sm:px-4">
        <section className="w-[min(100%,520px)] rounded-[18px] border border-border bg-surface p-[clamp(1.5rem,4vw,2.25rem)] shadow-[0_16px_40px_rgba(43,36,32,0.07)]">
        <p className="mb-[0.45rem] text-[0.75rem] font-bold tracking-[0.1em] text-accent-dark uppercase">
            Bảo mật tài khoản
    </p>

    <h1 className="mb-[0.65rem] font-heading text-[clamp(1.8rem,4vw,2.35rem)] font-bold">Đổi mật khẩu</h1>

    <p className="leading-[1.6] text-text-secondary">
        Sử dụng mật khẩu mạnh và không chia sẻ với người khác.
    </p>

    <form
    className="mt-6 flex flex-col gap-4"
    onSubmit={handleSubmit}
        >
        <label className={LABEL_CLASS}>
            Mật khẩu hiện tại
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
    </label>

    <label className={LABEL_CLASS}>
    Mật khẩu mới
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
    </label>

    <label className={LABEL_CLASS}>
    Xác nhận mật khẩu mới
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
        ? "Đang cập nhật..."
        : "Đổi mật khẩu"}
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