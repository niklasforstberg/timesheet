// Date helpers. Everything here works in the browser's local time zone.

export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); // Monday
  return r;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Seconds → "01:05:09" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Seconds → "11", "4:05", "1:04:05" — only the units that are in use, for the running timer. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  if (m > 0) return `${m}:${pad(sec)}`;
  return String(sec);
}

export function secondsBetween(start: string, end: string | null, now = Date.now()): number {
  return ((end ? Date.parse(end) : now) - Date.parse(start)) / 1000;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayHeading(d: Date): string {
  const today = new Date();
  if (dayKey(d) === dayKey(today)) return "Idag";
  if (dayKey(d) === dayKey(addDays(today, -1))) return "Igår";
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
}

export function formatWeekHeading(weekStart: Date): string {
  const current = startOfWeek(new Date());
  if (dayKey(weekStart) === dayKey(current)) return "Denna vecka";
  if (dayKey(weekStart) === dayKey(addDays(current, -7))) return "Förra veckan";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${weekStart.toLocaleDateString("sv-SE", opts)} – ${addDays(weekStart, 6).toLocaleDateString("sv-SE", opts)}`;
}

/** "9", "930", "0930", "9:30", "9.30" → [9, 30]; null when it isn't a time. */
export function parseClock(text: string): [number, number] | null {
  const t = text.trim().replace(/[.,]/g, ":");
  let h: number, m: number;
  const colon = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) { h = +colon[1]; m = +colon[2]; }
  else if (/^\d{1,2}$/.test(t)) { h = +t; m = 0; }
  else if (/^\d{3,4}$/.test(t)) { h = +t.slice(0, -2); m = +t.slice(-2); }
  else return null;
  return h < 24 && m < 60 ? [h, m] : null;
}

/** "1:30:00", "1:30", "1,5" (hours) → seconds; null when unreadable. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  const parts = t.split(":");
  if (parts.length >= 2 && parts.length <= 3 && parts.every(p => /^\d+$/.test(p))) {
    const [h, m, s = "0"] = parts;
    return +h * 3600 + +m * 60 + +s;
  }
  const hours = Number(t.replace(",", "."));
  return t !== "" && Number.isFinite(hours) && hours >= 0 ? Math.round(hours * 3600) : null;
}

export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** "2026-10-10" + "08:30" → Date in local time */
export function combine(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function timeOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Seconds → "8:05" (hours:minutes, for reports) */
export function formatHours(seconds: number): string {
  const m = Math.round(Math.max(0, seconds) / 60);
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

/** Minutes → "+5:32", "-0:39", "0:00" */
export function formatSignedMinutes(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  const m = Math.abs(minutes);
  return `${sign}${Math.floor(m / 60)}:${pad(m % 60)}`;
}

/** "+9:39", "-1,5", "12" (hours) → minutes; null when unreadable. */
export function parseSignedMinutes(text: string): number | null {
  const t = text.trim();
  const negative = /^[-−]/.test(t);
  const seconds = parseDuration(t.replace(/^[-−+]/, ""));
  return seconds === null ? null : (negative ? -1 : 1) * Math.round(seconds / 60);
}
