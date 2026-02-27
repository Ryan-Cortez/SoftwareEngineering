import type { Movie } from "../api/cinemaApi";
import { useNavigate } from "react-router-dom";

type Props = {
  movie: Movie;
};

export default function MainCard({ movie,}: Props) {
    const navigate = useNavigate();
    return (
        <button
        type="button"
        className="movie-card"
        onClick={() => navigate(`/movies/$z{movie:id}`)}
        >
        <img
            className="movie-card__poster"
            src={movie.posterUrl}
            alt={`${movie.title} poster`}
            draggable={false}
        />

        <div className="movie-card__body">
            <h3 className="movie-card__title">{movie.title}</h3>

            <div className="movie-card__meta">
            {movie.rating && <span>• {movie.rating}</span>}
            </div>

            {movie.description && <p className="movie-card__synopsis">{movie.description}</p>}

            <div className="movie-card__tag">
            {movie.status === "CURRENTLY_RUNNING" ? "Now Playing" : "Coming Soon"}
            </div>
        </div>
        </button>
    );
}