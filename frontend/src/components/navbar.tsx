import { Link, useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function readUser(): { first_name?: string; last_name?: string; email?: string; role?: string } | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function welcomeName(user: { first_name?: string; email?: string }): string {
  const first = user.first_name?.trim();
  if (first) return first;
  const email = user.email?.trim();
  if (email) return email.split("@")[0] || email;
  return "there";
}

export default function Navbar() {
  const navigate = useNavigate();
  const user = readUser();

  async function handleLogout() {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // still clear client state
    }
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/");
  }

  return (
    <>
      <nav className="site-navbar">
        <Link to="/" className="nav-logo" aria-label="Go to home">
          <div className="nav-logo__mark" />
          <span className="nav-logo__text">The Dawg House</span>
        </Link>

        <div className="nav-actions">
          <Link to="/search" className="nav-btn nav-btn--ghost">
            Search
          </Link>

          {user ? (
            <>
              <Link to="/profile" className="nav-btn nav-btn--ghost">
                Profile
              </Link>
              <Link to="/recommendations" className="nav-btn nav-btn--ghost">
                Recommendations
              </Link>
              {user.role === "admin" && (
                <Link to="/admin" className="nav-btn nav-btn--ghost">
                  Admin
                </Link>
              )}
              <button type="button" className="nav-btn nav-btn--primary" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="nav-btn nav-btn--primary">
              Login
            </Link>
          )}
        </div>
      </nav>
      {user ? (
        <div className="welcome-banner" role="status">
          Welcome, {welcomeName(user)}!
        </div>
      ) : null}
    </>
  );
}
