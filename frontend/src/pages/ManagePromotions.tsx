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
          <Link to="/admin" className="nav-link">
            Back to Admin Portal
          </Link>
        </div>
      </header>

      {loading && <p>Loading promotions…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && promotions.length === 0 && <p>No promotions found.</p>}

      {!loading && !error && promotions.length > 0 && (
        <section style={{ display: "grid", gap: 16 }}>
          {promotions.map((promotion) => (
            <div key={promotion.id} className="movie-card" style={{ textAlign: "left", padding: 16 }}>
              <h3>{promotion.title}</h3>
              {promotion.description && <p>{promotion.description}</p>}
              {promotion.discount_code && <p><strong>Code:</strong> {promotion.discount_code}</p>}
              {promotion.start_date && <p><strong>Starts:</strong> {promotion.start_date}</p>}
              {promotion.end_date && <p><strong>Ends:</strong> {promotion.end_date}</p>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}