import { handleResponse } from "./profileApi";
import { normalizeMovie, type Movie } from "./cinemaApi";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function getFavorites(): Promise<Movie[]> {
    const response = await fetch(`${API_BASE_URL}/api/favorites`, {
        method: "GET",
        credentials: "include",
    });

    const data = await handleResponse<any[]>(response);
    return Array.isArray(data) ? data.map(normalizeMovie) : [];
}

export async function addFavorite(movieId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/favorites`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ movieId }),
    });

    return handleResponse<{ message: string }>(response);
}

export async function removeFavorite(movieId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/favorites`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ movieId }),
    });

    return handleResponse<{ message: string }>(response);
}
