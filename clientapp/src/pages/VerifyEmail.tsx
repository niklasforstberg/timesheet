import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resendVerification, verifyEmail } from "../api/auth";

type Status = "verifying" | "expired" | "invalid" | "resent";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [status, setStatus] = useState<Status>("verifying");
  // StrictMode mounts effects twice in dev; the token is single-use, so guard it.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!token || !email) { setStatus("invalid"); return; }

    verifyEmail(email, token)
      // With a token the guard picks up the new session, without one the login page shows.
      .then(() => { window.location.href = "/"; })
      .catch((err: Error) => setStatus(err.message === "expired_token" ? "expired" : "invalid"));
  }, [token, email]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">timesheet</div>
        {status === "verifying" && <div className="auth-sub">Bekräftar…</div>}
        {status === "resent" && <div className="alert alert-success">Ett nytt mail är skickat till {email}.</div>}
        {(status === "expired" || status === "invalid") && (
          <>
            <div className="alert alert-error">
              {status === "expired" ? "Länken har gått ut." : "Länken är ogiltig."}
            </div>
            {email && (
              <button className="btn btn-primary btn-block"
                onClick={() => resendVerification(email).then(() => setStatus("resent"))}>
                Skicka en ny länk
              </button>
            )}
            <div className="auth-footer"><Link to="/">Till inloggningen</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
