import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMovieById, type MovieDetails } from "../api/cinemaApi.ts";

export default function MovieDetails() {
    const { id } = useParams();
    const movieId = Number(id);
    const navigate = useNavigate();

    
    const [movie, setMovie] = useState<MovieDetails | null>(null);
    const [error, setError] = useState<string | null>(null);

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
        async function load () {
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

    if (error) return <div> {error} </div>;
    if (!movie) return <div>Loading...</div>;

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
                        <h1 className="movie-details__title">{movie.title}</h1>
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
                                />
                            ) : (
                                <p>Trailer not available.</p>
                            )}
                        </div>

                        <h3 className="movie-details__section-title">Showtimes</h3>
                        <div className="movie-details__showtimes">
                    
                            <button        
                                className="booking_prototype_btn"
                                onClick={() =>
                                    navigate(`/booking`)
                                }
                            > 2:00 PM </button>
                            <button        
                                className="booking_prototype_btn"
                                onClick={() =>
                                    navigate(`/booking`)
                                }
                            > 5:00 PM </button>
                            <button        
                                className="booking_prototype_btn"
                                onClick={() =>
                                    navigate(`/booking`)
                                }
                            > 8:00 PM </button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
