"use client";

import { useEffect, useState } from "react";
import {
    ApiError,
    assignRoleToUser,
    listRoles,
    listUsers,
    removeRoleFromUser,
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
// modal-based edit pattern.
export default function AdminUsersPage() {
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
            setLoadError("Vui lòng đăng nhập lại.");
            setIsLoading(false);
            return;
        }

        try {
            const response = await listUsers(token, targetPage, PAGE_SIZE);
            setUsers(response.data.items);
            setTotal(response.data.total);
            setTotalPages(response.data.totalPages);
            setPage(response.data.page);
        } catch (err) {
            setLoadError(
                err instanceof ApiError ? err.message : "Không thể tải danh sách người dùng.",
            );
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
                    setLoadError("Vui lòng đăng nhập lại.");
                    setIsLoading(false);
                }
                return;
            }

            try {
                const response = await listUsers(token, page, PAGE_SIZE);
                if (!cancelled) {
                    setUsers(response.data.items);
                    setTotal(response.data.total);
                    setTotalPages(response.data.totalPages);
                    setPage(response.data.page);
                }
            } catch (err) {
                if (!cancelled) {
                    setLoadError(
                        err instanceof ApiError
                            ? err.message
                            : "Không thể tải danh sách người dùng.",
                    );
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void runEffect();

        return () => {
            cancelled = true;
        };
    }, [page]);

    useEffect(() => {
        let cancelled = false;

        async function loadRoles() {
            const token = getAccessToken();
            if (!token) return;
            try {
                const response = await listRoles(token);
                if (!cancelled) setRoles(response.data);
            } catch (err) {
                if (!cancelled) {
                    setRolesError(
                        err instanceof ApiError
                            ? err.message
                            : "Không thể tải danh sách vai trò.",
                    );
                }
            }
        }

        void loadRoles();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <>
            <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
                <div className="font-heading text-[1.35rem] font-semibold">Quản lý khách hàng</div>
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
                    AD
                </div>
            </header>

            <section className="p-7">
                {rolesError && <ErrorState message={rolesError} />}

                {isLoading && <LoadingState label="Đang tải người dùng..." />}
                {!isLoading && loadError && <ErrorState message={loadError} />}
                {!isLoading && !loadError && (
                    <div className="overflow-hidden rounded-lg border border-border bg-surface">
                        <div className={cn(ROW, ROW_HEAD)}>
                            <span>Email</span>
                            <span>Tên đăng nhập</span>
                            <span>Vai trò</span>
                            <span></span>
                        </div>
                        {users.map((user) => (
                            <div key={user.id} className={cn(ROW, ROW_BODY)}>
                                <span>{user.email}</span>
                                <span>{user.username}</span>
                                <span>
                                    {user.roles.length > 0 ? user.roles.join(", ") : "Chưa có vai trò"}
                                </span>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-small"
                                        onClick={() => setManagingUser(user)}
                                    >
                                        Quản lý vai trò
                                    </button>
                                </div>
                            </div>
                        ))}
                        {users.length === 0 && (
                            <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                                Chưa có người dùng nào.
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
                            Trang trước
                        </button>
                        <span>
                            Trang {page} / {totalPages} ({total} người dùng)
                        </span>
                        <button
                            type="button"
                            className="btn btn-outline btn-small"
                            onClick={() => run(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                        >
                            Trang sau
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
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

    const assignedRoleIds = new Set(
        roles.filter((role) => user.roles.includes(role.name)).map((role) => role.id),
    );

    async function handleToggle(role: Role) {
        const token = getAccessToken();
        if (!token) {
            setSubmitError("Bạn cần đăng nhập lại để thực hiện thao tác này.");
            return;
        }

        setSubmitError(null);
        setPendingRoleId(role.id);
        try {
            const isAssigned = assignedRoleIds.has(role.id);
            const response = isAssigned
                ? await removeRoleFromUser(token, user.id, role.id)
                : await assignRoleToUser(token, user.id, role.id);
            await onChanged(response.data);
        } catch (err) {
            setSubmitError(
                err instanceof ApiError ? err.message : "Không thể cập nhật vai trò. Vui lòng thử lại.",
            );
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
                        Quản lý vai trò — {user.email}
                    </h2>
                    <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[1.4rem] leading-none text-text-muted hover:bg-[rgba(43,36,32,0.06)] hover:text-text"
                        onClick={onClose}
                        aria-label="Đóng"
                    >
                        ×
                    </button>
                </div>

                <section aria-label="Chọn vai trò" className="mb-5">
                    <p className="mb-[0.6rem] text-[0.78rem] font-semibold tracking-[0.06em] text-text-muted uppercase">
                        Vai trò
                    </p>
                    {roles.length === 0 ? (
                        <p className="my-[1em]">Chưa có vai trò nào trong hệ thống.</p>
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
                        Xong
                    </button>
                </div>
            </div>
        </div>
    );
}
