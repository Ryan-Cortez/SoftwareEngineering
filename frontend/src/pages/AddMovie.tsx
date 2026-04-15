import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import type { MovieStatus } from "../api/cinemaApi";
import { createMovie } from "../api/adminApi";

export default function AddMovie() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [rating, setRating] = useState("");
  const [showDate, setShowDate] = useState("");
  const [status, setStatus] = useState<MovieStatus>("CURRENTLY_RUNNING");
  const [description, setDescription] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [trailerUrl, setTrailerUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!title || !genre || !rating || !description) {
      setError("Please complete all required fields.");
      return;
    }

    setLoading(true);

    try {
      await createMovie({
        title,
        genre,
        rating,
        show_date: showDate || undefined,
        status,
        description,
        poster_url: posterUrl || undefined,
        trailer_url: trailerUrl || undefined,
      });

      navigate("/admin/movies");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 650 }}>
        <h1 className="auth-title">Add Movie</h1>
        <p className="auth-subtitle">Create a new movie listing.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="title">Title *</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="auth-field">
            <label htmlFor="genre">Genre *</label>
            <input id="genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>

          <div className="auth-field">
            <label htmlFor="rating">Rating *</label>
            <input id="rating" value={rating} onChange={(e) => setRating(e.target.value)} />
          </div>

          <div className="auth-field">
            <label htmlFor="showDate">Show Date</label>
            <input
              id="showDate"
              type="date"
              value={showDate}
              onChange={(e) => setShowDate(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="status">Status *</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as MovieStatus)}
            >
              <option value="CURRENTLY_RUNNING">Currently Running</option>
              <option value="COMING_SOON">Coming Soon</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="auth-field">
            <label htmlFor="description">Description *</label>
            <textarea
              id="description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="posterUrl">Poster URL</label>
            <input
              id="posterUrl"
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="trailerUrl">Trailer URL</label>
            <input
              id="trailerUrl"
              value={trailerUrl}
              onChange={(e) => setTrailerUrl(e.target.value)}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add Movie"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/admin/movies">Back to Manage Movies</Link>
        </p>
      </div>
    </div>
  );
}