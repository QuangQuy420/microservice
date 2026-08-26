import type {
    Address,
    ChangePasswordRequest,
    CreateAddressRequest,
    UpdateProfileRequest,
    UserProfile,
} from "@/types/user";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
    return {
        Authorization: `Bearer ${token}`,
    };
}

export function getMyProfile(token: string): Promise<UserProfile> {
    return apiFetch<UserProfile>("/users/me", {
        method: "GET",
        headers: authHeaders(token),
    });
}

export function updateMyProfile(
    token: string,
    payload: UpdateProfileRequest,
): Promise<UserProfile> {
    return apiFetch<UserProfile>("/users/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function changePassword(
    token: string,
    payload: ChangePasswordRequest,
): Promise<null> {
    return apiFetch<null>("/users/change-password", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function getMyAddresses(token: string): Promise<Address[]> {
    return apiFetch<Address[]>("/users/me/addresses", {
        method: "GET",
        headers: authHeaders(token),
    });
}

export function createMyAddress(
    token: string,
    payload: CreateAddressRequest,
): Promise<Address> {
    return apiFetch<Address>("/users/me/addresses", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function updateMyAddress(
    token: string,
    addressId: string,
    payload: CreateAddressRequest,
): Promise<Address> {
    return apiFetch<Address>(`/users/me/addresses/${addressId}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function deleteMyAddress(
    token: string,
    addressId: string,
): Promise<null> {
    return apiFetch<null>(`/users/me/addresses/${addressId}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
}
