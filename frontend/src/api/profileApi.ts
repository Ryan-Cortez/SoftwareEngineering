const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let message = "Request failed";

        try {
            const errorData = await response.json();
            message =
                errorData.message ||
                errorData.error ||
                errorData.detail ||
                message;
        } catch {
            // ignore
        }

        throw new Error(message);
    }

    return response.json() as Promise<T>;
}

export type Address = {
    address_id?: number;
    street: string;
    city: string;
    state: string;
    zip_code: string;
};

export type PaymentCardPublic = {
    card_id: number;
    card_number: string;
    expiration_date: string;
    billing_street: string;
    billing_city: string;
    billing_state: string;
    billing_zip_code: string;
    billing_apt?: string | null;
};

export type UserProfile = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: Address | null;
    payment_cards: PaymentCardPublic[];
};

export type UpdateProfilePayload = {
    firstName: string;
    lastName: string;
    phone: string;
    address?: Address | null;
    current_password?: string;
    new_password?: string;
};

function normalizeAddress(raw: any): Address | null {
    if (!raw || typeof raw !== "object") return null;
    return {
        address_id: raw.address_id,
        street: raw.street ?? "",
        city: raw.city ?? "",
        state: raw.state ?? "",
        zip_code: raw.zip_code ?? raw.zipCode ?? "",
    };
}

function normalizeCards(raw: any): PaymentCardPublic[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((c) => ({
        card_id: Number(c.card_id ?? c.cardId),
        card_number: String(c.card_number ?? c.cardNumber ?? ""),
        expiration_date: String(c.expiration_date ?? c.expirationDate ?? ""),
        billing_street: String(c.billing_street ?? c.billingStreet ?? ""),
        billing_city: String(c.billing_city ?? c.billingCity ?? ""),
        billing_state: String(c.billing_state ?? c.billingState ?? ""),
        billing_zip_code: String(c.billing_zip_code ?? c.billingZipCode ?? ""),
        billing_apt: c.billing_apt ?? c.billingApt ?? null,
    }));
}

function normalizeUserProfile(raw: any): UserProfile {
    return {
        firstName: raw.firstName ?? raw.first_name ?? "",
        lastName: raw.lastName ?? raw.last_name ?? "",
        email: raw.email ?? "",
        phone: raw.phone ?? raw.phone_number ?? "",
        address: normalizeAddress(raw.address),
        payment_cards: normalizeCards(raw.payment_cards ?? raw.paymentCards),
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
    payload: UpdateProfilePayload
): Promise<{ message: string; profile?: Partial<UserProfile> }> {
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
        profile: data.profile
            ? {
                  firstName: data.profile.firstName ?? data.profile.first_name ?? "",
                  lastName: data.profile.lastName ?? data.profile.last_name ?? "",
                  email: data.profile.email ?? "",
                  phone: data.profile.phone ?? "",
              }
            : undefined,
    };
}

export type NewCardPayload = {
    card_number: string;
    expiration_date: string;
    billing_street: string;
    billing_city: string;
    billing_state: string;
    billing_zip_code: string;
    billing_apt?: string;
};

export async function addPaymentCard(payload: NewCardPayload): Promise<{ message: string; card: PaymentCardPublic }> {
    const response = await fetch(`${API_BASE_URL}/api/profile/payment-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
    });
    const data = await handleResponse<any>(response);
    return {
        message: data.message,
        card: normalizeCards([data.card])[0],
    };
}

export async function updatePaymentCard(
    cardId: number,
    payload: Partial<NewCardPayload>
): Promise<{ message: string; card: PaymentCardPublic }> {
    const response = await fetch(`${API_BASE_URL}/api/profile/payment-cards/${cardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
    });
    const data = await handleResponse<any>(response);
    return {
        message: data.message,
        card: normalizeCards([data.card])[0],
    };
}

export async function deletePaymentCard(cardId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/profile/payment-cards/${cardId}`, {
        method: "DELETE",
        credentials: "include",
    });
    return handleResponse<{ message: string }>(response);
}
