"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { ApiError, apiErrorDetails, useApiError } from "@/lib/api";
import { LOCALES, isLocale, type Locale } from "@/i18n/config";
import { saveLocale } from "@/lib/i18n/locale";
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

const FIELD_ERROR_CLASS = "text-[0.78rem] font-normal text-[#a92828]";

// Each language names itself (Intl.DisplayNames in its own locale) instead of coming from the
// message files, so a locale added to LOCALES shows up here with no new translation key.
function localeLabel(locale: Locale): string {
    try {
        const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale);
        if (name) return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
        // Intl.DisplayNames unavailable for this locale — fall through to the raw code.
    }
    return locale.toUpperCase();
}

export default function ProfilePage() {
    const t = useTranslations("profile");
    const tCommon = useTranslations("common");
    const translateError = useApiError();
    const activeLocale = useLocale() as Locale;

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
    // Empty until the profile carries a saved language; the select then falls back to the
    // locale the page is currently rendered in.
    const [preferredLanguage, setPreferredLanguage] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

    const selectedLanguage: Locale = isLocale(preferredLanguage)
        ? preferredLanguage
        : activeLocale;

    function renderFieldErrors(field: string) {
        return fieldErrors[field]?.map((detail) => (
            <span key={detail} role="alert" className={FIELD_ERROR_CLASS}>
                {detail}
            </span>
        ));
    }

    useEffect(() => {
        async function loadProfile() {
            const token = getAccessToken();

            if (!token) {
                router.replace("/login");
                return;
            }

            try {
                const user = await getMyProfile(token);

                setProfile(user);
                setFullName(user.fullName ?? "");
                setPhone(user.phone ?? "");
                setAvatarUrl(user.avatarUrl ?? "");
                setDateOfBirth(user.dateOfBirth ?? "");
                setPreferredLanguage(
                    isLocale(user.preferredLanguage) ? user.preferredLanguage : "",
                );
            } catch (err) {
                if (err instanceof ApiError && err.status === 401) {
                    removeAccessToken();
                    router.replace("/login");
                    return;
                }

                setError(translateError(err));
            } finally {
                setLoading(false);
            }
        }

        void loadProfile();
    }, [router, translateError]);

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
        setFieldErrors({});

        try {
            const updated = await updateMyProfile(token, {
                fullName,
                phone,
                avatarUrl,
                dateOfBirth: dateOfBirth || undefined,
                preferredLanguage: selectedLanguage,
            });

            setProfile(updated);
            setMessage(t("updateSuccess"));

            // saveLocale writes the NEXT_LOCALE cookie and fires "locale-change"; LocaleSync turns
            // that into a soft refresh, so the page must not reload itself here.
            if (selectedLanguage !== activeLocale) {
                saveLocale(selectedLanguage);
            }
        } catch (err) {
            setError(translateError(err));
            setFieldErrors(apiErrorDetails(err));
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <main className={PAGE_CLASS}>
                <p className="my-[1em]">{tCommon("loading")}</p>
            </main>
        );
    }

    if (!profile) {
        return (
            <main className={PAGE_CLASS}>
                <p className="my-[1em]">{error || t("notFound")}</p>
            </main>
        );
    }

    return (
        <main className={PAGE_CLASS}>
            <section className={cn(SECTION_CLASS, "grid grid-cols-2 items-center gap-x-5 gap-y-3 max-[700px]:items-start max-sm:grid-cols-1")}>
                <div>
                    <p className={cn(SUMMARY_PILL_CLASS, "text-[0.75rem] font-bold tracking-[0.1em] uppercase")}>
                        {t("eyebrow")}
                    </p>

                    <h1 className="mb-4 font-heading text-[clamp(1.75rem,3vw,2.25rem)] font-bold text-text">
                        {t("title")}
                    </h1>

                    <p className={cn(SUMMARY_PILL_CLASS, "leading-[1.6]")}>
                        {t("summary")}
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
                <h2 className={HEADING_CLASS}>{t("accountSectionTitle")}</h2>

                <div className={TWO_COL_GRID_CLASS}>
                    <div className="rounded-xl bg-[rgba(43,36,32,0.035)] p-4">
                        <span className={DETAIL_LABEL_CLASS}>{t("usernameLabel")}</span>
                        <strong className="block">{profile.username}</strong>
                    </div>

                    <div className="rounded-xl bg-[rgba(43,36,32,0.035)] p-4">
                        <span className={DETAIL_LABEL_CLASS}>{t("emailLabel")}</span>
                        <strong className="block">{profile.email}</strong>
                    </div>
                </div>
            </section>

            <section className={SECTION_CLASS}>
                <div>
                    <div>
                        <h2 className={HEADING_CLASS}>{t("editSectionTitle")}</h2>
                        <p className="leading-[1.6] text-text-secondary">
                            {t("editSectionSubtitle")}
                        </p>
                    </div>
                </div>

                <form
                    className={TWO_COL_GRID_CLASS}
                    onSubmit={handleUpdateProfile}
                >
                    <label className={LABEL_CLASS}>
                        {t("fullNameLabel")}
                        <input
                            className={INPUT_CLASS}
                            type="text"
                            value={fullName}
                            onChange={(event) =>
                                setFullName(event.target.value)
                            }
                        />
                        {renderFieldErrors("fullName")}
                    </label>

                    <label className={LABEL_CLASS}>
                        {t("phoneLabel")}
                        <input
                            className={INPUT_CLASS}
                            type="tel"
                            value={phone}
                            onChange={(event) =>
                                setPhone(event.target.value)
                            }
                        />
                        {renderFieldErrors("phone")}
                    </label>

                    <label className={LABEL_CLASS}>
                        {t("dateOfBirthLabel")}
                        <input
                            className={INPUT_CLASS}
                            type="date"
                            value={dateOfBirth}
                            onChange={(event) =>
                                setDateOfBirth(event.target.value)
                            }
                        />
                        {renderFieldErrors("dateOfBirth")}
                    </label>

                    <label className={LABEL_CLASS}>
                        {t("languageLabel")}
                        <select
                            className={INPUT_CLASS}
                            value={selectedLanguage}
                            onChange={(event) =>
                                setPreferredLanguage(event.target.value)
                            }
                        >
                            {LOCALES.map((locale) => (
                                <option key={locale} value={locale}>
                                    {localeLabel(locale)}
                                </option>
                            ))}
                        </select>
                        {renderFieldErrors("preferredLanguage")}
                    </label>

                    <label className={cn(LABEL_CLASS, FULL_WIDTH_CLASS)}>
                        {t("avatarUrlLabel")}
                        <input
                            className={INPUT_CLASS}
                            type="url"
                            value={avatarUrl}
                            onChange={(event) =>
                                setAvatarUrl(event.target.value)
                            }
                        />
                        {renderFieldErrors("avatarUrl")}
                    </label>

                    <div className={FULL_WIDTH_CLASS}>
                        <button type="submit" className={SUBMIT_CLASS} disabled={saving}>
                            {saving
                                ? tCommon("saving")
                                : tCommon("save")}
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
                        <h2 className={HEADING_CLASS}>{t("addressSectionTitle")}</h2>
                        <p className="leading-[1.6] text-text-secondary">{t("addressSectionSubtitle")}</p>
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