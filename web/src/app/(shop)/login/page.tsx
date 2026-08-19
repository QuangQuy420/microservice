import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
    return (
        <main className="mx-auto grid min-h-[calc(100vh-190px)] max-w-[1100px] place-items-center px-6 py-[clamp(2rem,6vw,4.5rem)] max-sm:px-4">
            <section
                className="w-[min(100%,450px)] rounded-[18px] border border-border bg-surface p-[clamp(1.4rem,4vw,2.25rem)] shadow-[0_22px_55px_rgba(43,36,32,0.09)]"
                aria-labelledby="login-heading"
            >
                <p className="mb-[0.55rem] text-[0.76rem] font-bold tracking-[0.11em] text-accent-dark uppercase">
                    Chào mừng trở lại
                </p>

                <h1
                    id="login-heading"
                    className="mb-[0.6rem] font-heading text-[clamp(1.7rem,4vw,2.25rem)] font-[650]"
                >
                    Đăng nhập
                </h1>

                <p className="mb-6 text-[0.92rem] leading-[1.6] text-text-secondary">
                    Đăng nhập để quản lý hồ sơ và trải nghiệm mua sắm.
                </p>

                <LoginForm />

                <div className="mt-5 text-center text-[0.86rem] text-text-secondary">
                    Chưa có tài khoản?{" "}
                    <Link href="/register" className="font-bold no-underline hover:underline">
                        Đăng ký ngay
                    </Link>
                </div>
            </section>
        </main>
    );
}