const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
import type { Movie, MovieStatus } from "./cinemaApi";

async function parseJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const obj = typeof data === "object" && data !== null ? (data as { message?: unknown; error?: unknown }) : null;
    const message =
      obj && "message" in obj && obj.message != null && String(obj.message).trim() !== ""
        ? String(obj.message)
        : obj && "error" in obj && obj.error != null && String(obj.error).trim() !== ""
          ? String(obj.error)
          : fallbackMessage;
    throw new Error(message);
  }

  return data as T;
}

const fetchDefaults: RequestInit = {
  credentials: "include",
};

export type AdminUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role?: string;
  status?: string;
};

export type Showroom = {
  id: number;
  name: string;
  capacity?: number;
};

export type Showtime = {
  id: number;
  movie_title: string;
  show_date: string;
  show_time: string;
  showroom_name: string;
};

export type CreateMovieInput = {
  title: string;
  genre: string;
  rating: string;
  description: string;
  status: MovieStatus;
  runtime?: number;
  show_date?: string;
  poster_url?: string;
  trailer_url?: string;
};

export type CreateShowtimeInput = {
  movie_id: number;
  show_date: string;
  show_time: string;
  showroom_id: number;
};

export type Promotion = {
  id: number;
  title: string;
  description?: string;
  discount_code?: string;
  start_date?: string;
  end_date?: string;
};

export async function createMovie(input: CreateMovieInput): Promise<Movie> {
  const res = await fetch(`${API_BASE_URL}/api/movies`, {
    ...fetchDefaults,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<Movie>(res, "Failed to create movie");
}

export async function getShowtimes(): Promise<Showtime[]> {
  const res = await fetch(`${API_BASE_URL}/api/showtimes`, fetchDefaults);
  const data = await parseJsonResponse<Showtime[] | { showtimes?: Showtime[] }>(
    res,
    "Failed to load showtimes"
  );

  return Array.isArray(data) ? data : data.showtimes ?? [];
}

export async function createShowtime(input: CreateShowtimeInput): Promise<Showtime> {
  const res = await fetch(`${API_BASE_URL}/api/showtimes`, {
    ...fetchDefaults,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<Showtime>(res, "Failed to create showtime");
}

export async function getShowrooms(): Promise<Showroom[]> {
  const res = await fetch(`${API_BASE_URL}/api/showrooms`, fetchDefaults);
  const data = await parseJsonResponse<Showroom[] | { showrooms?: Showroom[] }>(
    res,
    "Failed to load showrooms"
  );

  return Array.isArray(data) ? data : data.showrooms ?? [];
}

export async function getUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE_URL}/api/users`, fetchDefaults);
  const data = await parseJsonResponse<AdminUser[] | { users?: AdminUser[] }>(
    res,
    "Failed to load users"
  );

  return Array.isArray(data) ? data : data.users ?? [];
}

export async function getPromotions(): Promise<Promotion[]> {
  const res = await fetch(`${API_BASE_URL}/api/promotions`, fetchDefaults);
  const data = await parseJsonResponse<Promotion[] | { promotions?: Promotion[] }>(
    res,
    "Failed to load promotions"
  );

  return Array.isArray(data) ? data : data.promotions ?? [];
}