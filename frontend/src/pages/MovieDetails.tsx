import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMovieById, type MovieDetails } from "../api/cinemaApi.ts";
import { addFavorite, getFavorites, removeFavorite } from "../api/favorites";

export default function MovieDetails() {
    const { id } = useParams();
    const movieId = Number(id);
    const navigate = useNavigate();

    const [movie, setMovie] = useState<MovieDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);

    const trailerEmbedUrl = useMemo(() => {
        if (!movie?.trailerUrl) return "";
        const url = movie.trailerUrl;

        // Handle youtu.be short links
        if (url.includes("youtu.be/")) {
            const idPart = url.split("youtu.be/")[1] ?? "";
            const videoId = idPart.split(/[?&]/)[0];
            return `https://www.youtube.com/embed/${videoId}`;
        }

        // Handle standard watch URLs
        if (url.includes("youtube.com/watch")) {
            const query = url.split("?")[1] ?? "";
            const params = new URLSearchParams(query);
            const videoId = params.get("v");
            if (videoId) {
                return `https://www.youtube.com/embed/${videoId}`;
            }
        }

        return url;
    }, [movie?.trailerUrl]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setError(null);
            try {
                const current = await getMovieById(movieId);
                if (!cancelled) setMovie(current);
            } catch {
                if (!cancelled) setError("Could not find movie details.");
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [movieId]);

    useEffect(() => {
        let cancelled = false;
        async function loadFavorites() {
            try {
                const favorites = await getFavorites();
                if (!cancelled) setIsFavorite(favorites.some((f) => f.id === movieId));
            } catch {
                if (!cancelled) setIsFavorite(false);
            }
        }
        loadFavorites();
        return () => {
            cancelled = true;
        };
    }, [movieId]);

    async function handleFavoriteToggle(e: React.MouseEvent<HTMLButtonElement>) {
        e.preventDefault();
        e.stopPropagation();
        try {
            setFavoriteLoading(true);
            if (isFavorite) {
                await removeFavorite(movieId);
                setIsFavorite(false);
            } else {
                await addFavorite(movieId);
                setIsFavorite(true);
            }
        } catch {
            // not logged in or network error
        } finally {
            setFavoriteLoading(false);
        }
    }

    if (error) return <div> {error} </div>;
    if (!movie) return <div>Loading...</div>;

    const showtimes = movie.showtimes?.length ? movie.showtimes : ["2:00 PM", "5:00 PM", "8:00 PM"];

    return (
        <main className="page">
            <div className="movie-details">
                <button className="movie-details__back" onClick={() => navigate(-1)}>
                    ← Back
                </button>

                <div className="movie-details__layout">
                    <div className="movie-details__poster-wrap">
                        <div className="movie-details__poster-frame">
                            <img
                                className="movie-details__poster"
                                src={movie.posterUrl}
                                alt={movie.title}
                            />
                        </div>
                    </div>

                    <div className="movie-details__content">
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <h1 className="movie-details__title" style={{ margin: 0 }}>
                                {movie.title}
                            </h1>
                            <button
                                type="button"
                                onClick={handleFavoriteToggle}
                                disabled={favoriteLoading}
                                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                                style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: "1.5rem",
                                    cursor: "pointer",
                                }}
                            >
                                {isFavorite ? "❤️" : "🤍"}
                            </button>
                        </div>
                        <div className="movie-details__meta">
                            <span>{movie.genre}</span>
                            {movie.rating && <span>• {movie.rating}</span>}
                            <span>• {movie.status === "CURRENTLY_RUNNING" ? "Now Playing" : "Coming Soon"}</span>
                        </div>

                        <p className="movie-details__description">{movie.description}</p>

                        <h3 className="movie-details__section-title">Trailer</h3>
                        <div className="movie-details__trailer">
                            {trailerEmbedUrl ? (
                                <iframe
                                    width="100%"
                                    height="360"
                                    src={trailerEmbedUrl}
                                    allowFullScreen
                                    title={`${movie.title} Trailer`}
                                />
                            ) : (
                                <p>Trailer not available.</p>
                            )}
                        </div>

                        <h3 className="movie-details__section-title">Showtimes</h3>
                        <div className="movie-details__showtimes">
                            {showtimes.map(
                                (t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        className="booking_prototype_btn"
                                        onClick={() => navigate("/booking", {
                                            state: { 
                                                movieId: movie.id, 
                                                movieTitle: movie.title,
                                                showtime: t,
                                                poster: movie.posterUrl,
                                            },
                                        })
                                    }
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
