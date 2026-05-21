import { Eye, EyeOff, Leaf, Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { login, tryRestoreSession } from "../../../services/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStoredSession, setCheckingStoredSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const user = await tryRestoreSession();
      if (!cancelled && user) {
        navigate({ to: "/", replace: true });
        return;
      }
      if (!cancelled) setCheckingStoredSession(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const ok = await login({ username, password });
      if (ok) {
        navigate({ to: "/" });
      } else {
        setError("Invalid username or password. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      {/* ── Left panel ────────────────────────────────── */}
      <aside className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <Leaf className="h-7 w-7" />
            </div>
            <div>
              <p className="auth-brand-name">Smart Agro</p>
              <p className="auth-brand-tagline">Advisory System</p>
            </div>
          </div>

          <div className="auth-panel-body">
            <h2 className="auth-panel-heading">AI-powered farming intelligence</h2>
            <p className="auth-panel-sub">
              Monitor soil health, get crop recommendations, and predict nutrient levels with our advanced LLM-powered platform.
            </p>

            <ul className="auth-feature-list">
              {[
                "Real-time soil & nutrient monitoring",
                "AI crop & pesticide recommendations",
                "3-day pH & NPK forecasting",
                "Live weather integration",
              ].map((feat) => (
                <li key={feat} className="auth-feature-item">
                  <span className="auth-feature-dot" />
                  {feat}
                </li>
              ))}
            </ul>
          </div>

          <div className="auth-panel-field-pattern" aria-hidden="true" />
        </div>
      </aside>

      {/* ── Right panel ───────────────────────────────── */}
      <main className="auth-form-panel">
        <div className="auth-form-box">
          <div className="auth-form-header">
            <h1 className="auth-form-title">Welcome back</h1>
            <p className="auth-form-sub">Sign in to your farm dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label className="auth-label" htmlFor="username">Username</label>
              <div className="auth-input-wrap">
                <User className="auth-input-icon" />
                <input
                  id="username"
                  className="auth-input"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="password">Password</label>
              <div className="auth-input-wrap">
                <Lock className="auth-input-icon" />
                <input
                  id="password"
                  className="auth-input"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button type="submit" className="auth-submit" disabled={loading || checkingStoredSession}>
              {loading || checkingStoredSession ? <span className="auth-spinner" /> : null}
              {checkingStoredSession ? "Checking saved session…" : loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account?{" "}
            <Link to="/register" className="auth-switch-link">Create one free</Link>
          </p>

          <p className="auth-demo-hint">
            Demo credentials: <code>demo</code> / <code>demo1234</code>
          </p>
        </div>
      </main>
    </div>
  );
}
