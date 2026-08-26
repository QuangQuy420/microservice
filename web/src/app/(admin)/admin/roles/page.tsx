"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
    apiErrorDetails,
    createRole,
    deleteRole,
    listPermissions,
    listRoles,
    updateRole,
    useApiError,
} from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import type { Permission, Role } from "@/types/user";

const ROW =
    "grid grid-cols-[1fr_1.4fr_1.6fr_90px] items-center gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
    "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";
const ICON_BTN =
    "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-transparent no-underline";
const FORM_FIELD = "mb-1.5 block text-[0.8rem] font-medium";

// Roles admin page (T21, AC1) — list/create/edit/delete a role with a permission checkbox
// grid, modeled on admin/products/page.tsx's search+table layout. The create/edit form is
// a modal (same overlay/panel utilities as AddToCartModal.tsx) rather than a
// separate route, since a role is just {name, description, permissionIds} — small enough
// not to need its own page the way the product form does.
export default function AdminRolesPage() {
    const t = useTranslations("admin");
    const common = useTranslations("common");
    const translateError = useApiError();

    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState("");

    const [editingRole, setEditingRole] = useState<Role | null | undefined>(undefined);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // `run` is called directly after a create/edit/delete completes (no unmount race to
    // guard against there). The mount-time effect below duplicates this body inside its own
    // `runEffect` instead of calling `run()` — eslint's react-hooks/set-state-in-effect rule
    // requires the setState calls to happen inside a function declared in the effect body,
    // not one hoisted out of it; same split as useProducts.ts's run/runEffect.
    async function run() {
        setIsLoading(true);
        setLoadError(null);

        const token = getAccessToken();
        if (!token) {
            setLoadError(t("roles.sessionExpired"));
            setIsLoading(false);
            return;
        }

        try {
            const [rolesResponse, permissionsResponse] = await Promise.all([
                listRoles(token),
                listPermissions(token),
            ]);
            setRoles(rolesResponse);
            setPermissions(permissionsResponse);
        } catch (err) {
            setLoadError(translateError(err));
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function runEffect() {
            setIsLoading(true);
            setLoadError(null);

            const token = getAccessToken();
            if (!token) {
                if (!cancelled) {
                    setLoadError(t("roles.sessionExpired"));
                    setIsLoading(false);
                }
                return;
            }

            try {
                const [rolesResponse, permissionsResponse] = await Promise.all([
                    listRoles(token),
                    listPermissions(token),
                ]);
                if (!cancelled) {
                    setRoles(rolesResponse);
                    setPermissions(permissionsResponse);
                }
            } catch (err) {
                if (!cancelled) {
                    setLoadError(translateError(err));
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void runEffect();

        return () => {
            cancelled = true;
        };
    }, [t, translateError]);

    const term = searchInput.trim().toLowerCase();
    const filteredRoles = useMemo(
        () => (term ? roles.filter((r) => r.name.toLowerCase().includes(term)) : roles),
        [roles, term],
    );

    async function handleDelete(role: Role) {
        if (!window.confirm(t("roles.deleteConfirm", { name: role.name }))) {
            return;
        }

        const token = getAccessToken();
        if (!token) {
            setActionError(t("roles.sessionExpired"));
            return;
        }

        setActionError(null);
        setDeletingId(role.id);
        try {
            await deleteRole(token, role.id);
            await run();
        } catch (err) {
            setActionError(translateError(err));
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <>
            <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
                <div className="font-heading text-[1.35rem] font-semibold">{t("roles.title")}</div>
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
                    AD
                </div>
            </header>

            <section className="p-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="relative m-0 max-w-[380px] min-w-[220px] flex-1">
                        <svg
                            className="pointer-events-none absolute top-1/2 left-[14px] -translate-y-1/2 text-text-muted"
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                        >
                            <circle cx="11" cy="11" r="7" />
                            <path d="M21 21l-4.3-4.3" />
                        </svg>
                        <input
                            type="search"
                            className="w-full rounded-full border border-border bg-surface py-3 pr-4 pl-10 font-body text-[0.9rem] text-text"
                            aria-label={t("roles.searchLabel")}
                            placeholder={t("roles.searchPlaceholder")}
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setEditingRole(null)}
                    >
                        {t("roles.addRole")}
                    </button>
                </div>

                {actionError && <ErrorState message={actionError} />}

                {isLoading && <LoadingState label={t("roles.loading")} />}
                {!isLoading && loadError && <ErrorState message={loadError} />}
                {!isLoading && !loadError && (
                    <div className="overflow-hidden rounded-lg border border-border bg-surface">
                        <div className={cn(ROW, ROW_HEAD)}>
                            <span>{t("roles.columnName")}</span>
                            <span>{t("roles.columnDescription")}</span>
                            <span>{t("roles.columnPermissions")}</span>
                            <span></span>
                        </div>
                        {filteredRoles.map((role) => (
                            <div key={role.id} className={cn(ROW, ROW_BODY)}>
                                <div>
                                    <div className="font-semibold">{role.name}</div>
                                </div>
                                <span>{role.description || common("notAvailable")}</span>
                                <span>
                                    {role.permissions.length > 0
                                        ? role.permissions.map((p) => p.code).join(", ")
                                        : t("roles.noPermissions")}
                                </span>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        className={cn(ICON_BTN, "text-text")}
                                        aria-label={t("roles.editAria", { name: role.name })}
                                        onClick={() => setEditingRole(role)}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        className={cn(ICON_BTN, "text-[#b4483a]")}
                                        aria-label={t("roles.deleteAria", { name: role.name })}
                                        disabled={deletingId === role.id}
                                        onClick={() => handleDelete(role)}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 6h18" />
                                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {filteredRoles.length === 0 && (
                            <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                                {t("roles.noResults", { term: searchInput })}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {editingRole !== undefined && (
                <RoleFormModal
                    role={editingRole}
                    permissions={permissions}
                    onClose={() => setEditingRole(undefined)}
                    onSaved={async () => {
                        setEditingRole(undefined);
                        await run();
                    }}
                />
            )}
        </>
    );
}

interface RoleFormModalProps {
    role: Role | null;
    permissions: Permission[];
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}

function RoleFormModal({ role, permissions, onClose, onSaved }: RoleFormModalProps) {
    const t = useTranslations("admin");
    const common = useTranslations("common");
    const translateError = useApiError();

    const isEditing = role !== null;

    const [name, setName] = useState(role?.name ?? "");
    const [description, setDescription] = useState(role?.description ?? "");
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(
        () => new Set(role?.permissions.map((p) => p.id) ?? []),
    );
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    function togglePermission(id: string) {
        setSelectedPermissionIds((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    async function handleSubmit() {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setSubmitError(t("roles.form.nameRequired"));
            return;
        }

        const token = getAccessToken();
        if (!token) {
            setSubmitError(t("roles.form.loginRequired"));
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);
        setFieldErrors({});
        try {
            const payload = {
                name: trimmedName,
                description: description.trim() || undefined,
                permissionIds: [...selectedPermissionIds],
            };

            if (isEditing) {
                await updateRole(token, role.id, payload);
            } else {
                await createRole(token, payload);
            }

            await onSaved();
        } catch (err) {
            setSubmitError(translateError(err));
            setFieldErrors(apiErrorDetails(err));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[200] grid animate-account-menu-in place-items-center bg-[rgba(43,36,32,0.45)] p-6"
            role="presentation"
            onClick={onClose}
        >
            <div
                className="max-h-[calc(100vh-3rem)] w-[min(100%,480px)] overflow-y-auto rounded-[18px] border border-border bg-surface p-[clamp(1.25rem,3vw,1.75rem)] shadow-[0_20px_50px_rgba(43,36,32,0.16)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="role-form-heading"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-4">
                    <h2 id="role-form-heading" className="font-heading text-[1.3rem] text-text">
                        {isEditing ? t("roles.form.editHeading") : t("roles.form.createHeading")}
                    </h2>
                    <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[1.4rem] leading-none text-text-muted hover:bg-[rgba(43,36,32,0.06)] hover:text-text"
                        onClick={onClose}
                        aria-label={common("close")}
                    >
                        ×
                    </button>
                </div>

                <div className={FORM_FIELD}>
                    <label htmlFor="role-name">{t("roles.form.nameLabel")}</label>
                    <input
                        id="role-name"
                        type="text"
                        className="input mb-4"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t("roles.form.namePlaceholder")}
                    />
                    {fieldErrors.name?.map((msg) => (
                        <p key={msg} role="alert" className="field-error mb-4">
                            {msg}
                        </p>
                    ))}
                </div>

                <div className={FORM_FIELD}>
                    <label htmlFor="role-description">{t("roles.form.descriptionLabel")}</label>
                    <textarea
                        id="role-description"
                        className="input mb-4 resize-y"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder={t("roles.form.descriptionPlaceholder")}
                        rows={2}
                    />
                    {fieldErrors.description?.map((msg) => (
                        <p key={msg} role="alert" className="field-error mb-4">
                            {msg}
                        </p>
                    ))}
                </div>

                <section aria-label={t("roles.form.selectPermissionsLabel")} className="mb-5">
                    <p className="mb-[0.6rem] text-[0.78rem] font-semibold tracking-[0.06em] text-text-muted uppercase">
                        {t("roles.form.permissionsLabel")}
                    </p>
                    {permissions.length === 0 ? (
                        <p className="my-[1em]">{t("roles.form.noPermissionsInSystem")}</p>
                    ) : (
                        <ul className="grid gap-2.5">
                            {permissions.map((permission) => (
                                <li
                                    key={permission.id}
                                    className="rounded-lg border border-border px-3 py-2.5"
                                >
                                    <label className="flex cursor-pointer items-start gap-2.5 text-[0.88rem]">
                                        <input
                                            type="checkbox"
                                            className="mt-[0.2rem]"
                                            checked={selectedPermissionIds.has(permission.id)}
                                            onChange={() => togglePermission(permission.id)}
                                        />
                                        <span>
                                            <strong>{permission.code}</strong>
                                            {permission.description && (
                                                <span className="text-text-muted">
                                                    {" "}
                                                    — {permission.description}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    {fieldErrors.permissionIds?.map((msg) => (
                        <p key={msg} role="alert" className="field-error mt-2">
                            {msg}
                        </p>
                    ))}
                </section>

                {submitError && (
                    <p role="alert" className="my-[1em] text-[#a92828]">
                        {submitError}
                    </p>
                )}

                <div className="mt-6 flex gap-3">
                    <button
                        type="button"
                        className="btn btn-outline flex-1"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        {common("cancel")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary flex-1"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? common("saving") : t("roles.form.submit")}
                    </button>
                </div>
            </div>
        </div>
    );
}
