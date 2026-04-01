import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const SECTION_TITLES: Record<string, string> = {
  movies: "Manage Movies",
  promotions: "Promotions",
  users: "Users",
  showtimes: "Showtimes",
};

function readUser(): { role?: string } | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

type MovieRow = {
  movie_id: number;
  title: string;
  genre: string;
  status: string;
  runtime: number;
};

function MoviesSection() {
  const [movies, setMovies] = useState<MovieRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/movies`, { credentials: "include" });
        const text = await res.text();
        const data = text ? JSON.parse(text) : [];
        if (!res.ok) {
          throw new Error((data as { error?: string }).error || "Could not load movies");
        }
        if (!cancelled) {
          setMovies(Array.isArray(data) ? data : []);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load movies");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="admin-subtitle">Loading movies…</p>;
  }

  if (error) {
    return <p className="admin-subtitle">{error}</p>;
  }

  if (movies.length === 0) {
    return <p className="admin-subtitle">No movies in the catalog.</p>;
  }

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Genre</th>
          <th>Status</th>
          <th>Runtime</th>
        </tr>
      </thead>
      <tbody>
        {movies.map((m) => (
          <tr key={m.movie_id}>
            <td>
              <Link to={`/movies/${m.movie_id}`}>{m.title}</Link>
            </td>
            <td>{m.genre}</td>
            <td>{m.status}</td>
            <td>{m.runtime} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlaceholderSection({ label }: { label: string }) {
  return (
    <p className="admin-subtitle">
      {label} administration is not wired to the API yet. Use the main portal menu and backend routes when they are
      added.
    </p>
  );
}

export default function AdminSection() {
  const navigate = useNavigate();
  const { section } = useParams<{ section: string }>();
  const user = readUser();

  if (!user || user.role !== "admin") {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h1>Admin</h1>
          <p className="admin-subtitle">Sign in as an administrator to access this area.</p>
          <button className="admin-logout" type="button" onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!section || !SECTION_TITLES[section]) {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <Link to="/admin" className="admin-section-back">
            ← Back to Admin Portal
          </Link>
          <h1>Not found</h1>
          <p className="admin-subtitle">This admin section does not exist.</p>
        </div>
      </div>
    );
  }

  const title = SECTION_TITLES[section];

  return (
    <div className="admin-page">
      <div className="admin-card admin-section-card">
        <Link to="/admin" className="admin-section-back">
          ← Back to Admin Portal
        </Link>
        <h1>{title}</h1>

        {section === "movies" && <MoviesSection />}
        {section === "promotions" && <PlaceholderSection label="Promotion" />}
        {section === "users" && <PlaceholderSection label="User" />}
        {section === "showtimes" && <PlaceholderSection label="Showtime" />}
      </div>
    </div>
  );
}
