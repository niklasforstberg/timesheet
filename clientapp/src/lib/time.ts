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

/** Seconds → "1:05:09" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
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
  return d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
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
