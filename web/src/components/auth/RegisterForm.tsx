"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
        errors.username = "Tên đăng nhập là bắt buộc.";
    }

    if (!fullName.trim()) {
        errors.fullName = "Họ và tên là bắt buộc.";
    }

    if (!email.trim()) {
        errors.email = "Email là bắt buộc.";
    } else if (!EMAIL_PATTERN.test(email)) {
        errors.email = "Email không hợp lệ.";
    }

    if (!password) {
        errors.password = "Mật khẩu là bắt buộc.";
    } else if (password.length < 8) {
        errors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
    }

    if (confirmPassword !== password) {
        errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    }

    return errors;
}

export function RegisterForm() {
    const router = useRouter();

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
                Tên đăng nhập
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
            {fieldErrors.username}
          </span>
                )}
            </label>

            <label htmlFor="register-full-name" className={LABEL_CLASS}>
                Họ và tên
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
            {fieldErrors.fullName}
          </span>
                )}
            </label>

            <label htmlFor="register-email" className={LABEL_CLASS}>
                Email
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
            {fieldErrors.email}
          </span>
                )}
            </label>

            <label htmlFor="register-phone" className={LABEL_CLASS}>
                Số điện thoại
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
            </label>

            <label htmlFor="register-password" className={LABEL_CLASS}>
                Mật khẩu
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
            {fieldErrors.password}
          </span>
                )}
            </label>

            <label htmlFor="register-confirm-password" className={LABEL_CLASS}>
                Xác nhận mật khẩu
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
            {fieldErrors.confirmPassword}
          </span>
                )}
            </label>

            <button type="submit" className={SUBMIT_CLASS} disabled={isSubmitting}>
                {isSubmitting
                    ? "Đang tạo tài khoản..."
                    : "Đăng ký"}
            </button>

            {error && (
                <p role="alert" className="my-[1em] text-[#a92828]">
                    {error}
                </p>
            )}

            {success && (
                <p role="status" className="text-[0.84rem] text-[#3d6654]">
                    Đăng ký thành công. Đang chuyển sang đăng nhập...
                </p>
            )}
        </form>
    );
}