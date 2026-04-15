// ManageUsers.tsx
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getUsers } from "../api/adminApi";
import type { AdminUser } from "../api/adminApi";

export default function ManageUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      setLoading(true);
      setError(null);

      try {
        const data = await getUsers();
        if (!cancelled) {
          setUsers(data);
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

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="movies-header">
        <h1>Manage Users</h1>
        <div className="movies-controls">
          <Link to="/admin" className="nav-link">
            Back to Admin Portal
          </Link>
        </div>
      </header>

      {loading && <p>Loading users…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <section style={{ display: "grid", gap: 16 }}>
          {users.map((user) => (
            <div key={user.id} className="movie-card" style={{ textAlign: "left", padding: 16 }}>
              <h3>
                {(user.first_name || user.firstName || "")} {(user.last_name || user.lastName || "")}
              </h3>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Role:</strong> {user.role || "customer"}</p>
              <p><strong>Status:</strong> {user.status || "Active"}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}