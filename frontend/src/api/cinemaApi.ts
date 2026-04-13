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
    showtimes: string[]; // time of day (hardcoded)
    directors?: string[];
    actors?: string[];
}

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

    const showtimes =
      raw.showtimes ??
      (Array.isArray(raw.shows)
        ? raw.shows.map((s: any) => {
            const t = s.start_time ?? s.show_time;
            if (!t) return "";
            try {
              const d = new Date(t);
              return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            } catch {
              return String(t);
            }
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

    // this is not yet used because the booking page doe not use an id (just a prototype)
}
    