import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        setError("Invalid verification link.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/verify-email/${encodeURIComponent(token)}`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        const text = await res.text();
        const data = text ? JSON.parse(text) : {};

        if (cancelled) return;

        if (!res.ok) {
          throw new Error(data.message || data.error || "Verification failed");
        }

        setMessage(data.message || "Email verified. You may now log in.");

        setTimeout(() => {
          if (!cancelled) navigate("/login");
        }, 1200);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Verify Email</h1>
        <p className="auth-subtitle">
          {loading
            ? "Confirming your email address…"
            : "Your verification status is shown below."}
        </p>

        {message && <p className="auth-success">{message}</p>}
        {error && <p className="auth-error">{error}</p>}

        <p className="auth-switch">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}
