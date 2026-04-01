import { useEffect, useMemo, useState } from "react";
import { getMovies } from "../api/cinemaApi";
import type { Movie, MovieStatus } from "../api/cinemaApi";
import MainCard from "../components/MainCard";

export default function Home() {
  const [status, setStatus] = useState<MovieStatus>("CURRENTLY_RUNNING");
  const search = "";
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getMovies(search.trim() || "", "", "");
        const filtered = data.filter((m) => m.status === status);
        if (!cancelled) setMovies(filtered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [status, search]);

  const title = useMemo(
    () => (status === "CURRENTLY_RUNNING" ? "Now Playing" : "Coming Soon"),
    [status]
  );

  return (
    <main className="page">
      <div className="brand-title">
        <h1 className="brand-title">The Dawg House</h1>
      </div>
      <header className="movies-header">
        <h2>{title}</h2>

        <div className="movies-controls">
          <div className="segmented">
            <button className={status === "CURRENTLY_RUNNING" ? "active" : ""} onClick={() => setStatus("CURRENTLY_RUNNING")}>
              Released
            </button>
            <button className={status === "COMING_SOON" ? "active" : ""} onClick={() => setStatus("COMING_SOON")}>
              Unreleased
            </button>
          </div>

          
        </div>
      </header>

      {loading && <p>Loading movies…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <section className="movie-grid">
          {movies.map((m) => (
            <MainCard key={m.id} movie={m} />
          ))}
        </section>
      )}
    </main>
  );
}