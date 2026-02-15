import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: auth logic
    navigate("/"); // send them back home after login (example)
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Login</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Email</label><br />
          <input type="email" required />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Password</label><br />
          <input type="password" required />
        </div>

        <button style={{ marginTop: 16 }} type="submit">
          Sign in
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        <Link to="/">Back to Landing</Link>
      </div>
    </div>
  );
}
