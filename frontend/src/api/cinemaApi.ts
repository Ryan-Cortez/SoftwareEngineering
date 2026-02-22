export type MovieStatus = "CURRNETLY_RUNNING" | "COMING_SOON";

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
}

export type MovieDetails = Movie & {
    showtimes: string[]; // time of day (hardcoded)
}

function normalizeMovie (raw: any): Movie {
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
    };
}

export async function getMovies( search: string = " ", genre: string = " ", showDate: string = " "): Promise<Movie[]> {
    const res = await fetch(`/api/movies?search=${search}&genre=${genre}&showDate=${showDate}`);
    if (!res.ok) throw new Error("Failed to load movies");
    const data = await res.json();
    return Array.isArray(data) ? data.map(normalizeMovie) : [];
} 

export async function getMovieById(id: number): Promise<MovieDetails> {
    const res = await fetch(`/api/movies/${id}`);
    if (!res.ok) throw new Error("Failed to load movie details");
    const raw = await res.json();
    const base = normalizeMovie(raw);

    const showtimes = 
      raw.showtimes ?? (Array.isArray(raw.shows) ? raw.shows.map((s: any) => String (s.show_time)) : ["2:00 PM", "5:00 PM", "8:00 PM"]);
    return {...base, showtimes };

}
    