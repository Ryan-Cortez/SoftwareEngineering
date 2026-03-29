import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";


export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        throw new Error(data.message || "Unable to process reset request");
      }

      setMessage(data.message || "Password reset request sent.");
      
      setTimeout(() => {
        navigate("/reset-password", { state: { email } });
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Forgot Password</h1>
        <p className="auth-subtitle">
          Enter your email and we&apos;ll begin the password reset process.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="reset-email">Email *</label>
            <input
              id="reset-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your account email"
            />
          </div>

          {message && <p className="auth-success">{message}</p>}
          {error && <p className="auth-error">{error}</p>}

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Request Password Reset"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}