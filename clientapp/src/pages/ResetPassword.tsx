import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/auth";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Lösenorden matchar inte."); return; }
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email, token, password);
      navigate("/?reset=1");
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
        <div className="auth-sub">Välj nytt lösenord</div>
        {!token || !email ? (
          <div className="alert alert-error">Länken är ogiltig. <Link to="/forgot-password">Begär en ny.</Link></div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {/* Read-only, but present: tells the password manager which account this is. */}
            <input className="field" type="email" name="username" autoComplete="username" readOnly value={email} aria-label="E-post" />
            <div className="field-group">
              <label className="field-label" htmlFor="password">Nytt lösenord</label>
              <input id="password" className="field" type="password" required autoFocus minLength={8}
                autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="confirm">Upprepa lösenord</label>
              <input id="confirm" className="field" type="password" required
                autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>Spara</button>
          </form>
        )}
      </div>
    </div>
  );
}
