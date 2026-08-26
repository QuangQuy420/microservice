import type {
    CreateRoleRequest,
    Permission,
    Role,
    UpdateRoleRequest,
} from "@/types/user";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
    return {
        Authorization: `Bearer ${token}`,
    };
}

export function listRoles(token: string): Promise<Role[]> {
    return apiFetch<Role[]>("/roles", {
        method: "GET",
        headers: authHeaders(token),
    });
}

export function createRole(
    token: string,
    payload: CreateRoleRequest,
): Promise<Role> {
    return apiFetch<Role>("/roles", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function updateRole(
    token: string,
    id: string,
    payload: UpdateRoleRequest,
): Promise<Role> {
    return apiFetch<Role>(`/roles/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function deleteRole(token: string, id: string): Promise<null> {
    return apiFetch<null>(`/roles/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
}

export function listPermissions(token: string): Promise<Permission[]> {
    return apiFetch<Permission[]>("/permissions", {
        method: "GET",
        headers: authHeaders(token),
    });
}
