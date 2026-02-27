import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="site-navbar">
      {/* Logo / brand placeholder */}
      <Link to="/" className="nav-logo" aria-label="Go to home">
        <div className="nav-logo__mark" />
        <span className="nav-logo__text">The Dawg House</span>
      </Link>

      <div className="nav-actions">
        <Link to="/search" className="nav-btn nav-btn--ghost">
          Search
        </Link>

        <Link to="/login" className="nav-btn nav-btn--primary">
          Login
        </Link>
      </div>
    </nav>
  );
}