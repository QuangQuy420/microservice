"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
    assignRoleToUser,
    listRoles,
    listUsers,
    removeRoleFromUser,
    useApiError,
    type AdminUser,
} from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import type { Role } from "@/types/user";

const PAGE_SIZE = 20;

const ROW =
    "grid grid-cols-[2fr_1.4fr_1fr_160px] items-center gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
    "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";

// Users admin page (T22, AC2) — list users (email, username, roles) with pagination, and a
// "manage roles" modal per user that assigns/removes roles via a multi-select, reusing
// assignRoleToUser/removeRoleFromUser (already implemented) and listRoles to populate the
// picker. Modeled on admin/products/page.tsx's search+table layout and admin/roles/page.tsx's
// modal-based edit pattern. Paging is 1-based (`meta.page`); `totalPages` is derived from
// meta.total/meta.pageSize since the envelope no longer carries it.
export default function AdminUsersPage() {
    const t = useTranslations("admin");
    const translateError = useApiError();

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [roles, setRoles] = useState<Role[]>([]);
    const [rolesError, setRolesError] = useState<string | null>(null);

    const [managingUser, setManagingUser] = useState<AdminUser | null>(null);

    async function run(targetPage: number) {
        setIsLoading(true);
        setLoadError(null);

        const token = getAccessToken();
        if (!token) {
            setLoadError(t("users.sessionExpired"));
            setIsLoading(false);
            return;
        }

        try {
            const response = await listUsers(token, targetPage, PAGE_SIZE);
            const pageSize = response.meta?.pageSize ?? PAGE_SIZE;
            const totalCount = response.meta?.total ?? response.data.length;
            setUsers(response.data);
            setTotal(totalCount);
            setTotalPages(pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1);
            setPage(response.meta?.page ?? targetPage);
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
                    setLoadError(t("users.sessionExpired"));
                    setIsLoading(false);
                }
                return;
            }

            try {
                const response = await listUsers(token, page, PAGE_SIZE);
                if (!cancelled) {
                    const pageSize = response.meta?.pageSize ?? PAGE_SIZE;
                    const totalCount = response.meta?.total ?? response.data.length;
                    setUsers(response.data);
                    setTotal(totalCount);
                    setTotalPages(
                        pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1,
                    );
                    setPage(response.meta?.page ?? page);
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
    }, [page, t, translateError]);

    useEffect(() => {
        let cancelled = false;

        async function loadRoles() {
            const token = getAccessToken();
            if (!token) return;
            try {
                const response = await listRoles(token);
                if (!cancelled) setRoles(response);
            } catch (err) {
                if (!cancelled) {
                    setRolesError(translateError(err));
                }
            }
        }

        void loadRoles();

        return () => {
            cancelled = true;
        };
    }, [translateError]);

    return (
        <>
            <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
                <div className="font-heading text-[1.35rem] font-semibold">{t("users.title")}</div>
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
                    AD
                </div>
            </header>

            <section className="p-7">
                {rolesError && <ErrorState message={rolesError} />}

                {isLoading && <LoadingState label={t("users.loading")} />}
                {!isLoading && loadError && <ErrorState message={loadError} />}
                {!isLoading && !loadError && (
                    <div className="overflow-hidden rounded-lg border border-border bg-surface">
                        <div className={cn(ROW, ROW_HEAD)}>
                            <span>{t("users.columnEmail")}</span>
                            <span>{t("users.columnUsername")}</span>
                            <span>{t("users.columnRoles")}</span>
                            <span></span>
                        </div>
                        {users.map((user) => (
                            <div key={user.id} className={cn(ROW, ROW_BODY)}>
                                <span>{user.email}</span>
                                <span>{user.username}</span>
                                <span>
                                    {user.roles.length > 0
                                        ? user.roles.join(", ")
                                        : t("users.noRoles")}
                                </span>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-small"
                                        onClick={() => setManagingUser(user)}
                                    >
                                        {t("users.manageRoles")}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {users.length === 0 && (
                            <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                                {t("users.empty")}
                            </div>
                        )}
                    </div>
                )}

                {!isLoading && !loadError && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 text-[0.85rem] text-text-secondary">
                        <button
                            type="button"
                            className="btn btn-outline btn-small"
                            onClick={() => run(Math.max(1, page - 1))}
                            disabled={page <= 1}
                        >
                            {t("users.previousPage")}
                        </button>
                        <span>{t("users.pageInfo", { page, totalPages, total })}</span>
                        <button
                            type="button"
                            className="btn btn-outline btn-small"
                            onClick={() => run(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                        >
                            {t("users.nextPage")}
                        </button>
                    </div>
                )}
            </section>

            {managingUser && (
                <ManageUserRolesModal
                    user={managingUser}
                    roles={roles}
                    onClose={() => setManagingUser(null)}
                    onChanged={async (updatedUser) => {
                        setManagingUser(updatedUser);
                        setUsers((current) =>
                            current.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
                        );
                    }}
                />
            )}
        </>
    );
}

interface ManageUserRolesModalProps {
    user: AdminUser;
    roles: Role[];
    onClose: () => void;
    onChanged: (updatedUser: AdminUser) => void | Promise<void>;
}

function ManageUserRolesModal({ user, roles, onClose, onChanged }: ManageUserRolesModalProps) {
    const t = useTranslations("admin");
    const common = useTranslations("common");
    const translateError = useApiError();

    const [submitError, setSubmitError] = useState<string | null>(null);
    const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

    const assignedRoleIds = new Set(
        roles.filter((role) => user.roles.includes(role.name)).map((role) => role.id),
    );

    async function handleToggle(role: Role) {
        const token = getAccessToken();
        if (!token) {
            setSubmitError(t("users.modal.loginRequired"));
            return;
        }

        setSubmitError(null);
        setPendingRoleId(role.id);
        try {
            const isAssigned = assignedRoleIds.has(role.id);
            const response = isAssigned
                ? await removeRoleFromUser(token, user.id, role.id)
                : await assignRoleToUser(token, user.id, role.id);
            await onChanged(response);
        } catch (err) {
            setSubmitError(translateError(err));
        } finally {
            setPendingRoleId(null);
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
                aria-labelledby="manage-user-roles-heading"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between gap-4">
                    <h2 id="manage-user-roles-heading" className="font-heading text-[1.3rem] text-text">
                        {t("users.modal.heading", { email: user.email })}
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

                <section aria-label={t("users.modal.selectRolesLabel")} className="mb-5">
                    <p className="mb-[0.6rem] text-[0.78rem] font-semibold tracking-[0.06em] text-text-muted uppercase">
                        {t("users.modal.rolesLabel")}
                    </p>
                    {roles.length === 0 ? (
                        <p className="my-[1em]">{t("users.modal.noRolesInSystem")}</p>
                    ) : (
                        <ul className="grid gap-2.5">
                            {roles.map((role) => (
                                <li key={role.id} className="rounded-lg border border-border px-3 py-2.5">
                                    <label className="flex cursor-pointer items-start gap-2.5 text-[0.88rem]">
                                        <input
                                            type="checkbox"
                                            className="mt-[0.2rem]"
                                            checked={assignedRoleIds.has(role.id)}
                                            disabled={pendingRoleId === role.id}
                                            onChange={() => handleToggle(role)}
                                        />
                                        <span>
                                            <strong>{role.name}</strong>
                                            {role.description && (
                                                <span className="text-text-muted">
                                                    {" "}
                                                    — {role.description}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {submitError && (
                    <p role="alert" className="my-[1em] text-[#a92828]">
                        {submitError}
                    </p>
                )}

                <div className="mt-6 flex gap-3">
                    <button type="button" className="btn btn-primary flex-1" onClick={onClose}>
                        {t("users.modal.done")}
                    </button>
                </div>
            </div>
        </div>
    );
}
