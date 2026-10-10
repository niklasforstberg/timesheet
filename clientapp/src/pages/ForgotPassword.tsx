import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { forgotPassword } from "../api/auth";

export default function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState<string>((location.state as { email?: string } | null)?.email ?? "");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">timesheet</div>
        <div className="auth-sub">Återställ lösenord</div>
        {sent ? (
          <div className="alert alert-success">Om adressen finns hos oss har vi skickat en länk till {email}.</div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field-group">
              <label className="field-label" htmlFor="email">E-post</label>
              <input id="email" className="field" type="email" required autoFocus autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>Skicka länk</button>
          </form>
        )}
        <div className="auth-footer"><Link to="/">Till inloggningen</Link></div>
      </div>
    </div>
  );
}
