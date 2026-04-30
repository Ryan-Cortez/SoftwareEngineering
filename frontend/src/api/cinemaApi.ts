export type MovieStatus = "CURRENTLY_RUNNING" | "COMING_SOON" | "ARCHIVED";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type Movie = {
    id: number;
    title: string;
    rating: string;
    description: string;
    posterUrl: string;
    trailerUrl: string;
    genre: string;
    status: MovieStatus;
    showDate?: string; // YYYY-MM-DD
    runtime?: number; // in minutes
}

export type MovieDetails = Movie & {
    showtimes: Showtime[]
    directors?: string[];
    actors?: string[];
}

export type Showtime = {
  id: number;
  date: string; // e.g. "Friday, September 15"
  time: string; // e.g. "7:30 PM"
  raw: string; // original datetime string from API
};


export function normalizeMovie (raw: any): Movie {
  return {
    id: Number(raw.id ?? raw.movie_id),
    title: raw.title ?? "",
    genre: raw.genre ?? "",      
    status: (raw.status ?? "CURRENTLY_RUNNING") as MovieStatus,
    description: raw.description ?? raw.synopsis ?? "",
    posterUrl:
      raw.posterUrl ??
      raw.poster_url ??        
      raw.trailer_image_url ??
      "",
    trailerUrl:
      raw.trailerUrl ??
      raw.trailer_url ??
      raw.trailer_video_url ??
      "",
    rating:
      raw.rating ??
      raw.mpaa_rating ??
      "",
    showDate:
      raw.showDate ??
      raw.show_date ??
      undefined,
    runtime:
      typeof raw.runtime === "number"
        ? raw.runtime
        : raw.runtime != null
        ? Number(raw.runtime)
        : undefined,
    };
}


export async function getMovies( search: string = "", genre: string = "", showDate: string = ""): Promise<Movie[]> {
    const params = new URLSearchParams({
      search,
      genre,
      showDate,
    });
    const res = await fetch(`${API_BASE_URL}/api/movies?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load movies");
    const data = await res.json();
    return Array.isArray(data) ? data.map(normalizeMovie) : [];
} 

export async function getMovieById(id: number | string): Promise<MovieDetails> {
    const res = await fetch(`${API_BASE_URL}/api/movies/${id}`);
    if (!res.ok) throw new Error("Failed to load movie details");
    const raw = await res.json();
    const base = normalizeMovie(raw);

    const showtimes: Showtime[] = 
      (Array.isArray(raw.shows)
        ? raw.shows.map((s: any) => {
            const t = s.start_time ?? s.show_time;
            if (!t) return null;

            const d = new Date(t);
            return {
              id: Number(s.id ?? s.show_id ?? t), // fallback to timestamp if no ID
              date: d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
              time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
              raw: t,
            };  
          }).filter(Boolean)
        : ["2:00 PM", "5:00 PM", "8:00 PM"]);

    const contributors = Array.isArray(raw.contributors) ? raw.contributors : [];

    const directors = contributors
      .filter((c: any) =>
        String(c.role ?? "").toLowerCase().includes("director")
      )
      .map((c: any) => String(c.name ?? "").trim())
      .filter(Boolean);

    const actors = contributors
      .filter((c: any) => {
        const role = String(c.role ?? "").toLowerCase();
        return (
          role.includes("actor") ||
          role.includes("actress") ||
          role.includes("cast")
        );
      })
    .map((c: any) => String(c.name ?? "").trim())
    .filter(Boolean);

    return {...base, showtimes, directors, actors };

}

export type CreateBookingPayload = {
  showId: number;
  cardId: number;
  selectedSeats: string[];
  ticketCounts: {
    adult: number;
    child: number;
    senior: number;
  };
};

export async function createBooking(payload: CreateBookingPayload) {
  const res = await fetch(`${API_BASE_URL}/api/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const rawText = await res.text().catch(() => "");
  const data = rawText ? (() => { try { return JSON.parse(rawText); } catch { return null; } })() : null;

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      (rawText && rawText.slice(0, 200)) ||
      `Request failed (${res.status})`;
    throw new Error(`Failed to create booking (${res.status}): ${msg}`);
  }

  return data ?? {};
}
    