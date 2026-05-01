import { useEffect, useState } from "react";
import MainCard from "../components/MainCard";
import { getFavorites } from "../api/favorites";
import {
  getAiMovieRecommendations,
  type Movie,
  type MovieRecommendation,
  type RecommendationRequestMovie,
} from "../api/cinemaApi";

export default function MovieRecommendationsPage() {
  const [favorites, setFavorites] = useState<Movie[]>([]);
  const [recommendations, setRecommendations] = useState<MovieRecommendation[]>(
    []
  );

  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadFavorites() {
      setLoadingFavorites(true);
      setError("");

      try {
        const data = await getFavorites();

        if (!cancelled) {
          setFavorites(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load your favorite movies."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingFavorites(false);
        }
      }
    }

    loadFavorites();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerateRecommendations() {
    setError("");
    setRecommendations([]);

    if (favorites.length === 0) {
      setError("You need to favorite at least one movie first.");
      return;
    }

    const favoritePayload: RecommendationRequestMovie[] = favorites.map(
      (movie) => ({
        id: movie.id,
        title: movie.title,
        genre: movie.genre,
        rating: movie.rating,
        description: movie.description,
      })
    );

    try {
      setLoadingRecommendations(true);

      const data = await getAiMovieRecommendations(favoritePayload);

      setRecommendations(data.recommendations ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while getting recommendations."
      );
    } finally {
      setLoadingRecommendations(false);
    }
  }

  return (
    <main className="page">
      <header className="movies-header">
        <h1>AI Movie Recommendations</h1>

        <p className="movie-card__meta">
          Generate movie recommendations based on the movies you have favorited.
        </p>

        <div className="movies-controls">
          <button
            type="button"
            className="nav-btn nav-btn--primary"
            onClick={handleGenerateRecommendations}
            disabled={loadingFavorites || loadingRecommendations}
          >
            {loadingRecommendations
              ? "Generating..."
              : "Generate Recommendations"}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {loadingFavorites && (
        <section className="movies-header">
          <h2>Loading your favorites...</h2>
        </section>
      )}

      {!loadingFavorites && favorites.length === 0 && !error && (
        <section className="movies-header">
          <h2>No favorites found</h2>
          <p className="movie-card__meta">
            Favorite some movies first, then come back here to generate
            recommendations.
          </p>
        </section>
      )}

      {favorites.length > 0 && (
        <>
          <section className="movies-header">
            <h2>Your Favorited Movies</h2>
            <p className="movie-card__meta">
              These are the movies being used to guide the recommendation
              results.
            </p>
          </section>

          <section className="movie-grid">
            {favorites.map((movie) => (
              <MainCard key={movie.id} movie={movie} />
            ))}
          </section>
        </>
      )}

      {recommendations.length > 0 && (
        <>
          <section className="movies-header">
            <h2>Recommended For You</h2>
            <p className="movie-card__meta">
              These suggestions were generated from your favorited movies.
            </p>
          </section>

          <section className="movie-grid">
            {recommendations.map((movie, index) => (
              <article
                key={`${movie.title}-${index}`}
                className="movie-card"
                style={{ cursor: "default" }}
              >
                <div className="movie-card__body">
                  <h3 className="movie-card__title">{movie.title}</h3>

                  <div className="movie-card__meta">
                    {movie.genre && <span>{movie.genre}</span>}
                    {movie.rating && <span> • {movie.rating}</span>}
                  </div>

                  <p className="movie-card__synopsis">{movie.reason}</p>

                  <div className="movie-card__tag">AI Recommendation</div>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}