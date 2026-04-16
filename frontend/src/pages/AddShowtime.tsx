// AddShowtime.tsx
// AddShowtime.tsx
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getMovies } from "../api/cinemaApi";
import type { Movie } from "../api/cinemaApi";
import { createShowtime, getShowrooms } from "../api/adminApi";
import type { Showroom } from "../api/adminApi";

export default function AddShowtime() {
  const navigate = useNavigate();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);

  const [movieId, setMovieId] = useState("");
  const [showDate, setShowDate] = useState("");
  const [showTime, setShowTime] = useState("");
  const [showroomId, setShowroomId] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFormData() {
      setLoading(true);
      setError(null);

      try {
        const [movieList, showroomList] = await Promise.all([
          getMovies("", "", ""),
          getShowrooms(),
        ]);

        if (!cancelled) {
          setMovies(movieList);
          setShowrooms(showroomList);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFormData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!movieId || !showDate || !showTime || !showroomId) {
      setError("Please complete all required fields.");
      return;
    }

    setLoading(true);

    try {
      await createShowtime({
        movie_id: Number(movieId),
        show_date: showDate,
        show_time: showTime,
        showroom_id: Number(showroomId),
      });

      navigate("/admin/showtimes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 650 }}>
        <h1 className="auth-title">Add Showtime</h1>
        <p className="auth-subtitle">Schedule a movie in a showroom.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="movie">Movie *</label>
            <select id="movie" value={movieId} onChange={(e) => setMovieId(e.target.value)}>
              <option value="">Select a movie</option>
              {movies.map((movie) => (
                <option key={movie.id} value={movie.id}>
                  {movie.title}
                </option>
              ))}
            </select>
          </div>

          <div className="auth-field">
            <label htmlFor="showDate">Date *</label>
            <input
              id="showDate"
              type="date"
              value={showDate}
              onChange={(e) => setShowDate(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="showTime">Time *</label>
            <input
              id="showTime"
              type="time"
              value={showTime}
              onChange={(e) => setShowTime(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="showroom">Showroom *</label>
            <select id="showroom" value={showroomId} onChange={(e) => setShowroomId(e.target.value)}>
              <option value="">Select a showroom</option>
              {showrooms.map((showroom) => (
                <option key={showroom.id} value={showroom.id}>
                  {showroom.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add Showtime"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/admin/showtimes">Back to Manage Showtimes</Link>
        </p>
      </div>
    </div>
  );
}