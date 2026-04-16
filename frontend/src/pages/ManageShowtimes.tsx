// ManageShowtimes.tsx
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getShowtimes } from "../api/adminApi";
import type { Showtime } from "../api/adminApi";

export default function ManageShowtimes() {
  const [showtimes, setShowtimes] = useState<Showtime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadShowtimes() {
      setLoading(true);
      setError(null);

      try {
        const data = await getShowtimes();
        if (!cancelled) {
          setShowtimes(data);
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

    loadShowtimes();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="movies-header">
        <h1>Manage Showtimes</h1>

        <div className="movies-controls">
          <Link to="/admin" className="nav-link">
            Back to Admin Portal
          </Link>
          <Link to="/admin/showtimes/add" className="nav-button-link">
            Add Showtime
          </Link>
        </div>
      </header>

      {loading && <p>Loading showtimes…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <section style={{ display: "grid", gap: 16 }}>
          {showtimes.map((showtime) => (
            <div key={showtime.id} className="movie-card" style={{ textAlign: "left", padding: 16 }}>
              <h3>{showtime.movie_title}</h3>
              <p><strong>Date:</strong> {showtime.show_date}</p>
              <p><strong>Time:</strong> {showtime.show_time}</p>
              <p><strong>Showroom:</strong> {showtime.showroom_name}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}