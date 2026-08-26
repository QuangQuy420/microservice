// Admin-only user-management calls, kept separate from the profile-only `users.ts` (which
// only ever acts on the *caller's own* account via /users/me). Everything here acts on an
// arbitrary user by id and requires the caller to hold `user:manage-roles`.

import type { PaginatedResponse } from "@/types/api";
import { apiFetch, apiFetchList } from "./client";

// Mirrors user-service's UserResponse (id, email, username, roles: string[], status) —
// returned by both the assign- and remove-role endpoints.
export interface AdminUser {
    id: string;
    email: string;
    username: string;
    roles: string[];
    status: string;
}

function authHeaders(token: string): HeadersInit {
    return {
        Authorization: `Bearer ${token}`,
    };
}

export function listUsers(
    token: string,
    page: number,
    pageSize: number,
): Promise<PaginatedResponse<AdminUser>> {
    return apiFetchList<AdminUser>(
        `/users?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`,
        {
            method: "GET",
            headers: authHeaders(token),
        },
    );
}

export function assignRoleToUser(
    token: string,
    userId: string,
    roleId: string,
): Promise<AdminUser> {
    return apiFetch<AdminUser>(`/users/${encodeURIComponent(userId)}/roles`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ roleId }),
    });
}

export function removeRoleFromUser(
    token: string,
    userId: string,
    roleId: string,
): Promise<AdminUser> {
    return apiFetch<AdminUser>(
        `/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
        {
            method: "DELETE",
            headers: authHeaders(token),
        },
    );
}
