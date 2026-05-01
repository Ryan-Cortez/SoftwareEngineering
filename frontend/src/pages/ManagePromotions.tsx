// ManagePromotions.tsx
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getPromotions } from "../api/adminApi";
import type { Promotion } from "../api/adminApi";

export default function ManagePromotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPromotions() {
      setLoading(true);
      setError(null);

      try {
        const data = await getPromotions();

        if (!cancelled) {
          setPromotions(data);
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

    loadPromotions();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="movies-header">
        <h1>Manage Promotions</h1>

        <div className="movies-controls">
          <Link to="/admin" className="nav-btn nav-btn--ghost">
            Back to Admin Portal
          </Link>

          <Link to="/admin/promotions/add" className="nav-btn nav-btn--primary">
            Add Promotion
          </Link>
        </div>
      </header>

      {loading && <p>Loading promotions…</p>}

      {error && <p className="error">{error}</p>}

      {!loading && !error && promotions.length === 0 && (
        <p>No promotions found.</p>
      )}

      {!loading && !error && promotions.length > 0 && (
        <section className="movie-grid">
          {promotions.map((promotion) => (
            <div
              key={promotion.code}
              className="movie-card"
              style={{ textAlign: "left", padding: 16 }}
            >
              <div className="movie-card__body">
                <h3 className="movie-card__title">{promotion.code}</h3>

                {promotion.description && (
                  <p className="movie-card__synopsis">
                    {promotion.description}
                  </p>
                )}

                <p className="movie-card__meta">
                  <strong>Discount Type:</strong> {promotion.discount_type}
                </p>

                <p className="movie-card__meta">
                  <strong>Discount Value:</strong>{" "}
                  {promotion.discount_type === "Percent"
                    ? `${promotion.discount_value}%`
                    : `$${promotion.discount_value}`}
                </p>

                <p className="movie-card__meta">
                  <strong>Expires:</strong> {promotion.expiration_date}
                </p>

                <span className="movie-card__tag">
                  {promotion.discount_type === "Percent"
                    ? "Percent Discount"
                    : "Amount Discount"}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}