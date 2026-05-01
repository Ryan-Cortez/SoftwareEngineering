import type { Movie } from "../api/cinemaApi";
import { useNavigate } from "react-router-dom";
import { addFavorite, removeFavorite, getFavorites } from "../api/favorites";
import { useState, useEffect } from "react";

type Props = {
  movie: Movie;
};

export default function MainCard({ movie,}: Props) {
    const navigate = useNavigate();
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [favoriteError, setFavoriteError] = useState("");

    useEffect(() => {
        async function loadFavorites() {
            try {
                const favorites = await getFavorites();
                const found = favorites.some((fav) => fav.id === movie.id);
                setIsFavorite(found);
            } catch (error) {
                console.error("Failed to load favorites:", error);
            }
        }
        loadFavorites();
    }, [movie.id]);

    async function handleFavoriteToggle(e: React.MouseEvent< HTMLButtonElement>) {
        e.stopPropagation();

        try {
            setFavoriteLoading(true);
            setFavoriteError("");

            if(isFavorite) {
                await removeFavorite(movie.id);
                setIsFavorite(false);
            } else {
                await addFavorite(movie.id);
                setIsFavorite(true);
            }
        } catch (error: any) {
            console.error("Failed to update favorite:", error);

            if (error?.status === 401 || error?.message?.includes("401")) {
                setFavoriteError("You must be logged in to add favorites.");
            } else {
                setFavoriteError("Log in to add favorirtes.");
            }
            
        } finally {
            setFavoriteLoading(false);
        }
    }

    return (
        <button
            type="button"
            className="movie-card"
            onClick={() => navigate(`/movies/${movie.id}`)}
        >
        <img
            className="movie-card__poster"
            src={movie.posterUrl}
            alt={`${movie.title} poster`}
            draggable={false}
        />

        <div className="movie-card__body">
            <h3 className="movie-card__title" style={{color: "white"}}>{movie.title}</h3>
            <div style={{color:"grey"}}>
                {movie.genre && <span> {movie.genre}</span>}
                {movie.rating && <span> • {movie.rating}</span>}
                


            <button
                type="button"
                onClick={handleFavoriteToggle}
                disabled={favoriteLoading}
                aria-label={
                isFavorite ? "Remove from favorites" : "Add to favorites"
                }
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                style={{
                background: "none",
                border: "none",
                fontSize: "1.4rem",
                cursor: "pointer",
                }}
            >
            {isFavorite ? "❤️" : "🤍"}
          </button>
          {favoriteError && (
            <p style={{ color: "red", marginTop: "6px", fontSize: "0.9rem" }}>
                {favoriteError}
            </p>
        )}
        </div>

            {movie.description && <p className="movie-card__synopsis">{movie.description}</p>}

            <div className="movie-card__tag">
            {movie.status === "CURRENTLY_RUNNING" ? "Now Playing" : "Coming Soon"}
            </div>
            
        </div>
        </button>
    );
}