import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Welcome</h1>
      <p>This is the landing page.</p>

      <Link to="/login">Go to Login</Link>
    </div>
  );
}
