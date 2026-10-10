import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { login, register, resendVerification } from "../api/auth";

// Login and registration on one card; shown at "/" when there is no session.
export default function Login() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "register" && password !== confirm) {
      setError("Lösenorden matchar inte.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
        // Full reload: this page renders at "/" too, so the guard must re-run.
        window.location.href = "/";
      } else {
        await register(email, password);
        setAwaitingVerification(true);
      }
    } catch (err) {
      const message = (err as Error).message;
      if (message === "email_not_verified") setAwaitingVerification(true);
      else setError(mode === "login" ? "Fel e-post eller lösenord." : message);
    } finally {
      setLoading(false);
    }
  }

  function switchTo(next: "login" | "register") {
    setMode(next);
    setError(null);
    setConfirm("");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">timesheet</div>

        {awaitingVerification ? (
          <>
            <div className="alert alert-success">
              {resent ? "Ett nytt mail är skickat" : "Vi har skickat ett mail"} till <strong>{email}</strong>.
              Klicka på länken i mailet för att bekräfta adressen.
            </div>
            <div className="auth-footer">
              Inget mail?{" "}
              <button type="button" className="btn-link" disabled={loading}
                onClick={async () => { setLoading(true); try { await resendVerification(email); setResent(true); } finally { setLoading(false); } }}>
                Skicka igen
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-sub">{mode === "login" ? "Logga in" : "Skapa konto"}</div>
            {mode === "login" && params.get("reset") === "1" && !error && (
              <div className="alert alert-success">Lösenordet är bytt. Logga in med det nya.</div>
            )}
            {error && <div className="alert alert-error">{error}</div>}

            <form key={mode} className="auth-form" onSubmit={handleSubmit}>
              <div className="field-group">
                <label className="field-label" htmlFor="auth-email">E-post</label>
                <input id="auth-email" name="email" className="field" type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="auth-password">Lösenord</label>
                <input id="auth-password" name="password" className="field" type="password" required
                  minLength={mode === "register" ? 8 : undefined}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              {mode === "register" && (
                <div className="field-group">
                  <label className="field-label" htmlFor="auth-confirm">Upprepa lösenord</label>
                  <input id="auth-confirm" name="confirm-password" className="field" type="password" required
                    autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
              )}
              {mode === "login" && (
                <Link className="small" to="/forgot-password" state={{ email }}>Glömt lösenordet?</Link>
              )}
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {mode === "login" ? "Logga in" : "Skapa konto"}
              </button>
            </form>

            <div className="auth-footer">
              {mode === "login"
                ? <>Inget konto? <button type="button" className="btn-link" onClick={() => switchTo("register")}>Skapa ett</button></>
                : <>Har du redan ett konto? <button type="button" className="btn-link" onClick={() => switchTo("login")}>Logga in</button></>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
