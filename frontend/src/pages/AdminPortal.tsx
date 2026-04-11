import { Link, useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function readUser(): {
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
} | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AdminPortal() {
  const navigate = useNavigate();
  const user = readUser();

  async function handleLogout() {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h1>Admin Portal</h1>
          <p className="admin-subtitle">Sign in as an administrator to access this area.</p>
          <button className="admin-logout" type="button" onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const first = user.first_name ?? user.firstName ?? "";
  const last = user.last_name ?? user.lastName ?? "";

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-header">
          <h1>Admin Portal</h1>
          <button className="admin-logout" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <p className="admin-subtitle">
          Welcome, {user.first_name} {user.last_name}
        </p>

        <div className="admin-menu">
          <Link to="/admin/movies" className="admin-option">
            Manage Movies
          </Link>
          <Link to="/admin/promotions" className="admin-option">
            Promotions
          </Link>
          <Link to="/admin/users" className="admin-option">
            Users
          </Link>
          <Link to="/admin/showtimes" className="admin-option">
            Showtimes
          </Link>
        </div>
      </div>
    </div>
  );
}
