import { apiFetch, setToken, clearToken } from "./client";

export async function login(email: string, password: string): Promise<void> {
  const res = await apiFetch<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(res.token);
}

export async function register(email: string, password: string): Promise<void> {
  await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
}

// True when the account was verified just now and we got a session. An
// already-verified address returns no token — the caller sends the user to log in.
export async function verifyEmail(email: string, token: string): Promise<boolean> {
  const res = await apiFetch<{ token?: string }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, token }),
  });
  if (!res.token) return false;
  setToken(res.token);
  return true;
}

export const resendVerification = (email: string) =>
  apiFetch("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });

export const forgotPassword = (email: string) =>
  apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });

export const resetPassword = (email: string, token: string, newPassword: string) =>
  apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email, token, newPassword }) });

export function logout(): void {
  clearToken();
  window.location.href = "/";
}

export interface Me {
  id: number;
  email: string;
  timeZone: string;
}

export const getMe = () => apiFetch<Me>("/api/me");

export const updateMe = (timeZone: string) =>
  apiFetch<Me>("/api/me", { method: "PUT", body: JSON.stringify({ timeZone }) });
