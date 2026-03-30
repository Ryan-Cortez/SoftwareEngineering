const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5000";

export async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let message = "Request failed";

        try {
            const errorData = await response.json();
            message = 
                errorData.message ||
                errorData.error || errorData.detail || message;
        } catch {

        }

        throw new Error(message);    
    }

    return response.json() as Promise<T>;
}

export type UserProfile = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
};

export type UpdateProfilePayload = {
    firstName: string;
    lastName: string;
    phone: string;
};

function normalizeUserProfile(raw: any): UserProfile {
    return {
        firstName: raw.firstName ?? raw.first_name ?? " ",
        lastName: raw.lastName ?? raw.last_name ?? " ",
        email: raw.email ?? " ",
        phone: raw.phone ?? " ",
    };
}

export async function getProfile(): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: "GET",
        credentials: "include",
    });

    const data = await handleResponse<any>(response);
    return normalizeUserProfile(data);
}

export async function updateProfile(
    payload: UpdateProfilePayload): Promise<{ message: string; profile?: UserProfile }> {
        const response = await fetch(`${API_BASE_URL}/api/profile`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json", 
            },
            credentials: "include",
            body: JSON.stringify(payload),
        });

        const data = await handleResponse<any>(response);

        return {
            message: data.message ?? "Profile updated successfully",
            profile: data.profile ? normalizeUserProfile(data.profile) : undefined,
        };
    }
