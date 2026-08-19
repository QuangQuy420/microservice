"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { forgotPassword, ApiError } from "@/lib/api";

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

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");
        setMessage("");

        const normalizedEmail = email.trim();

        if (!normalizedEmail) {
            setError("Vui lòng nhập email.");
            return;
        }

        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            setError("Email không hợp lệ.");
            return;
        }

        setSubmitting(true);

        try {
            const response = await forgotPassword({
                email: normalizedEmail,
            });

            setMessage(
                response.message ??
                "Yêu cầu đặt lại mật khẩu đã được tiếp nhận.",
            );
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Không thể gửi yêu cầu đặt lại mật khẩu.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="mx-auto grid min-h-[calc(100vh-190px)] max-w-[1100px] place-items-center px-6 py-[clamp(2rem,6vw,4.5rem)] max-sm:px-4">
            <section className="w-[min(100%,450px)] rounded-[18px] border border-border bg-surface p-[clamp(1.4rem,4vw,2.25rem)] shadow-[0_22px_55px_rgba(43,36,32,0.09)]">
                <p className="mb-[0.55rem] text-[0.76rem] font-bold tracking-[0.11em] text-accent-dark uppercase">
                    Khôi phục tài khoản
                </p>

                <h1 className="mb-[0.6rem] font-heading text-[clamp(1.7rem,4vw,2.25rem)] font-[650]">
                    Quên mật khẩu
                </h1>

                <p className="mb-6 text-[0.92rem] leading-[1.6] text-text-secondary">
                    Nhập email đã đăng ký để nhận mã đặt lại mật khẩu.
                </p>

                <form
                    className="flex w-full flex-col gap-4"
                    onSubmit={handleSubmit}
                    noValidate
                >
                    <label htmlFor="forgot-password-email" className={LABEL_CLASS}>
                        Email
                        <input
                            id="forgot-password-email"
                            className={INPUT_CLASS}
                            type="email"
                            value={email}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            autoComplete="email"
                            placeholder="example@gmail.com"
                        />
                    </label>

                    <button type="submit" className={SUBMIT_CLASS} disabled={submitting}>
                        {submitting
                            ? "Đang gửi..."
                            : "Gửi yêu cầu"}
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
                        Quay lại đăng nhập
                    </Link>
                </div>
            </section>
        </main>
    );
}