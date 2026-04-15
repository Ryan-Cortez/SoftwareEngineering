import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MainCard from "../components/MainCard";
import { getMovies } from "../api/cinemaApi";
import type { Movie } from "../api/cinemaApi";

export default function ManageMovies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await getMovies("", "", "");
        if (!cancelled) setMovies(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="movies-header">
        <h1>Manage Movies</h1>

        <div className="movies-controls">
          <Link to="/admin" className="nav-link">
            Back to Admin Portal
          </Link>
          <Link to="/admin/movies/add" className="nav-button-link">
            Add Movie
          </Link>
        </div>
      </header>

      {loading && <p>Loading movies…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <section className="movie-grid">
          {movies.map((movie) => (
            <MainCard key={movie.id} movie={movie} />
          ))}
        </section>
      )}
    </main>
  );
}