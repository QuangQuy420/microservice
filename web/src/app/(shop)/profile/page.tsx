"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AddressBook } from "@/components/account/AddressBook";
import { useAddresses } from "@/hooks/useAddresses";
import {
    getMyProfile,
    updateMyProfile,
} from "@/lib/api";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";
import type { UserProfile } from "@/types/user";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

// Ported from the old `.profile-page` block. The page shell repeats the bare `main { ... }` rule
// (this <main> is nested inside the storefront shell's own <main>) minus its vertical padding.
const PAGE_CLASS = "mx-auto max-w-[1050px] px-6 py-[clamp(1.5rem,4vw,3rem)] max-sm:px-4";

// `.profile-page > section` — one surface card per section.
const SECTION_CLASS =
    "mb-5 rounded-2xl border border-border bg-surface p-[clamp(1.2rem,3vw,1.75rem)] " +
    "shadow-[0_14px_36px_rgba(43,36,32,0.06)]";

// `.profile-page h1/h2`.
const HEADING_CLASS = "mb-[1.1rem] font-heading text-[1.35rem] font-bold text-text";

// The old `.profile-page section:first-child p` rule out-specified `.profile-summary__*`, so the
// summary card's eyebrow and description render as tinted pills — kept as-is for visual parity.
const SUMMARY_PILL_CLASS =
    "rounded-[10px] bg-[rgba(43,36,32,0.035)] px-[0.9rem] py-3 text-text-secondary";

// The account-details grid and the edit form share one two-column layout, single column under 700px.
const TWO_COL_GRID_CLASS = "grid grid-cols-2 gap-4 max-[700px]:grid-cols-1";

// Rows that span both columns of that grid: the avatar-URL field, the actions row, status+alert.
const FULL_WIDTH_CLASS = "col-span-full max-[700px]:col-auto";

const DETAIL_LABEL_CLASS =
    "mb-1 block text-[0.72rem] font-bold tracking-[0.05em] text-text-muted uppercase";

// Profile/password fields keep `font: inherit` (they read their size/weight from the label), so
// they don't reuse the `.input` shared class the auth screens build on.
const LABEL_CLASS = "flex flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary";

const INPUT_CLASS =
    "min-h-[46px] rounded-[10px] border border-border bg-[#fffdf9] px-[0.85rem] py-[0.72rem] " +
    "text-text outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(201,123,74,0.13)]";

const SUBMIT_CLASS =
    "min-h-[46px] cursor-pointer rounded-[10px] border-0 bg-text px-5 py-3 font-bold text-surface " +
    "max-[700px]:w-full";

export default function ProfilePage() {
    const router = useRouter();
    const {
        addresses,
        isLoading: isLoadingAddresses,
        error: addressesError,
        refetch: refetchAddresses,
    } = useAddresses();

    const [profile, setProfile] = useState<UserProfile | null>(null);

    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    useEffect(() => {
        async function loadProfile() {
            const token = getAccessToken();

            if (!token) {
                router.replace("/login");
                return;
            }

            try {
                const response = await getMyProfile(token);
                const user = response.data;

                setProfile(user);
                setFullName(user.fullName ?? "");
                setPhone(user.phone ?? "");
                setAvatarUrl(user.avatarUrl ?? "");
                setDateOfBirth(user.dateOfBirth ?? "");
            } catch (err) {
                if (err instanceof ApiError && err.status === 401) {
                    removeAccessToken();
                    router.replace("/login");
                    return;
                }

                setError(
                    err instanceof ApiError
                        ? err.message
                        : "Không thể tải thông tin người dùng.",
                );
            } finally {
                setLoading(false);
            }
        }

        void loadProfile();
    }, [router]);

    async function handleUpdateProfile(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        const token = getAccessToken();

        if (!token) {
            router.replace("/login");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            const response = await updateMyProfile(token, {
                fullName,
                phone,
                avatarUrl,
                dateOfBirth: dateOfBirth || undefined,
            });

            setProfile(response.data);
            setMessage("Cập nhật thông tin thành công.");
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Cập nhật thông tin thất bại.",
            );
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <main className={PAGE_CLASS}>
                <p className="my-[1em]">Đang tải thông tin...</p>
            </main>
        );
    }

    if (!profile) {
        return (
            <main className={PAGE_CLASS}>
                <p className="my-[1em]">{error || "Không tìm thấy thông tin người dùng."}</p>
            </main>
        );
    }

    return (
        <main className={PAGE_CLASS}>
            <section className={cn(SECTION_CLASS, "grid grid-cols-2 items-center gap-x-5 gap-y-3 max-[700px]:items-start max-sm:grid-cols-1")}>
                <div>
                    <p className={cn(SUMMARY_PILL_CLASS, "text-[0.75rem] font-bold tracking-[0.1em] uppercase")}>
                        Tài khoản của bạn
                    </p>

                    <h1 className="mb-4 font-heading text-[clamp(1.75rem,3vw,2.25rem)] font-bold text-text">
                        Thông tin cá nhân
                    </h1>

                    <p className={cn(SUMMARY_PILL_CLASS, "leading-[1.6]")}>
                        Quản lý thông tin liên hệ và hồ sơ cá nhân.
                    </p>
                </div>

                <div className="flex min-w-[230px] items-center gap-[0.85rem]">
                    <div className="grid size-[54px] place-items-center rounded-full bg-[image:linear-gradient(145deg,var(--color-text),var(--color-accent-dark))] text-[1.1rem] font-bold text-surface">
                        {profile.fullName?.trim()?.charAt(0).toUpperCase() ||
                            profile.username.charAt(0).toUpperCase()}
                    </div>

                    <div>
                        <strong className="mb-[0.18rem] block text-[0.72rem] tracking-[0.05em] text-text-muted uppercase">
                            {profile.fullName || profile.username}
                        </strong>
                        <span className="mt-[0.2rem] block text-[0.84rem] text-text-muted">{profile.email}</span>
                    </div>
                </div>
            </section>

            <section className={SECTION_CLASS}>
                <h2 className={HEADING_CLASS}>Thông tin tài khoản</h2>

                <div className={TWO_COL_GRID_CLASS}>
                    <div className="rounded-xl bg-[rgba(43,36,32,0.035)] p-4">
                        <span className={DETAIL_LABEL_CLASS}>Tên đăng nhập</span>
                        <strong className="block">{profile.username}</strong>
                    </div>

                    <div className="rounded-xl bg-[rgba(43,36,32,0.035)] p-4">
                        <span className={DETAIL_LABEL_CLASS}>Email</span>
                        <strong className="block">{profile.email}</strong>
                    </div>
                </div>
            </section>

            <section className={SECTION_CLASS}>
                <div>
                    <div>
                        <h2 className={HEADING_CLASS}>Cập nhật hồ sơ</h2>
                        <p className="leading-[1.6] text-text-secondary">
                            Thay đổi thông tin cá nhân của bạn.
                        </p>
                    </div>
                </div>

                <form
                    className={TWO_COL_GRID_CLASS}
                    onSubmit={handleUpdateProfile}
                >
                    <label className={LABEL_CLASS}>
                        Họ và tên
                        <input
                            className={INPUT_CLASS}
                            type="text"
                            value={fullName}
                            onChange={(event) =>
                                setFullName(event.target.value)
                            }
                        />
                    </label>

                    <label className={LABEL_CLASS}>
                        Số điện thoại
                        <input
                            className={INPUT_CLASS}
                            type="tel"
                            value={phone}
                            onChange={(event) =>
                                setPhone(event.target.value)
                            }
                        />
                    </label>

                    <label className={LABEL_CLASS}>
                        Ngày sinh
                        <input
                            className={INPUT_CLASS}
                            type="date"
                            value={dateOfBirth}
                            onChange={(event) =>
                                setDateOfBirth(event.target.value)
                            }
                        />
                    </label>

                    <label className={cn(LABEL_CLASS, FULL_WIDTH_CLASS)}>
                        URL ảnh đại diện
                        <input
                            className={INPUT_CLASS}
                            type="url"
                            value={avatarUrl}
                            onChange={(event) =>
                                setAvatarUrl(event.target.value)
                            }
                        />
                    </label>

                    <div className={FULL_WIDTH_CLASS}>
                        <button type="submit" className={SUBMIT_CLASS} disabled={saving}>
                            {saving
                                ? "Đang lưu..."
                                : "Lưu thay đổi"}
                        </button>
                    </div>

                    {message && (
                        <p role="status" className={FULL_WIDTH_CLASS}>{message}</p>
                    )}

                    {error && (
                        <p role="alert" className={cn(FULL_WIDTH_CLASS, "my-[1em] text-[#a92828]")}>
                            {error}
                        </p>
                    )}
                </form>
            </section>

            <section className={SECTION_CLASS}>
                <div>
                    <div>
                        <h2 className={HEADING_CLASS}>Sổ địa chỉ</h2>
                        <p className="leading-[1.6] text-text-secondary">Quản lý các địa chỉ giao hàng đã lưu, dùng để chọn nhanh khi thanh toán.</p>
                    </div>
                </div>

                <AddressBook
                    mode="manage"
                    addresses={addresses}
                    isLoading={isLoadingAddresses}
                    error={addressesError}
                    onAddressesChange={refetchAddresses}
                />
            </section>
        </main>
    );
}