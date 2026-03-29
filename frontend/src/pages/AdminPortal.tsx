import { Link, useNavigate } from "react-router-dom";

export default function AdminPortal() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  function handleLogout() {
    localStorage.removeItem("user");
    navigate("/login");
  }

  if (!user) {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h1>Admin Portal</h1>
          <p className="admin-subtitle">No admin user is currently logged in.</p>
          <button className="admin-logout" onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-header">
          <h1>Admin Portal</h1>
          <button className="admin-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <p className="admin-subtitle">
          Welcome, {user.first_name} {user.last_name}
        </p>

        <div className="admin-menu">
          <Link to="/admin/movies" className="admin-option">Manage Movies</Link>
          <Link to="/admin/promotions" className="admin-option">Promotions</Link>
          <Link to="/admin/users" className="admin-option">Users</Link>
          <Link to="/admin/showtimes" className="admin-option">Showtimes</Link>
        </div>
      </div>
    </div>
  );
}