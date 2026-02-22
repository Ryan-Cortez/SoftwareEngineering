import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getMovieById, type MovieDetails } from "../api/cinemaApi.ts";

export default function MovieDetails() {
    const { id } = useParams();
    const movieId = Number(id);
    const navigate = useNavigate();

    
    const [movie, setMovie] = useState<MovieDetails | null>(null);
    const [error, setError] = useState<string | null>(null);

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
        <div>
            <button onClick={() => navigate(-1)}>
                Back
            </button>
            <div>
                <img src={movie?.posterUrl} alt={movie?.title}/>
                <div> 
                    <h1>{movie?.title}</h1>
                    <div> {movie?.genre} * {movie?.rating} * {movie?.status} </div>
                    <p> {movie?.description} </p>
                    <h3>Trailer</h3>
                    <div>
                        <iframe
                            width="100%"
                            height="360"
                            src={movie.trailerUrl}
                            allowFullScreen
                        />
                    </div>
                    <h3>Showtimes</h3>
                    <div>
                        {movie.showtimes.map((t) => (
                            <button key={t} onClick={() => navigate(`/booking?movieId=${movie.id}&showtime=${encodeURIComponent(t)}`)
                        }
                        style={{
                            padding: "10px 12px"
                        }}
                        >
                            {t}
                        </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
