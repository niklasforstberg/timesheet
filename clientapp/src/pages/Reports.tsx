import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getClients, getEntries, getProjects, getRunning, type TimeEntry } from "../api/data";
import { addDays, dayKey, formatHours, isoWeek, secondsBetween, startOfWeek } from "../lib/time";

const WEEKDAYS = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
// Hours at which a day cell reaches full shade.
const FULL_DAY_HOURS = 9;

// Month calendar: hours per day, a total per week, the month total on top and
// the month's hours per project below. Entries count on the day they start.
export default function Reports() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // "" = everything, "none" = no project, "c:<id>" = a client, "p:<id>" = a project
  const [filter, setFilter] = useState("");
  // The week picked in the calendar (its Monday), listed task by task below.
  const [week, setWeek] = useState<Date | null>(null);
  const [sort, setSort] = useState<{ key: "name" | "time"; desc: boolean }>({ key: "time", desc: true });

  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(addDays(monthEnd, -1)), 7);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["entries", "report", dayKey(gridStart), dayKey(gridEnd)],
    queryFn: () => getEntries(gridStart, gridEnd),
  });
  const { data: running = null } = useQuery({ queryKey: ["running"], queryFn: getRunning });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: getClients });

  // A running timer keeps the totals ticking.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const clientOf = useMemo(() => new Map(projects.map(p => [p.id, p.clientId])), [projects]);
  const matches = (e: TimeEntry) =>
    filter === "" ? true
    : filter === "none" ? e.projectId === null
    : filter.startsWith("p:") ? e.projectId === Number(filter.slice(2))
    : e.projectId !== null && clientOf.get(e.projectId) === Number(filter.slice(2));

  const all = [...entries, ...(running && new Date(running.start) >= gridStart && new Date(running.start) < gridEnd ? [running] : [])]
    .filter(matches);
  const seconds = (e: TimeEntry) => secondsBetween(e.start, e.end, now);

  const perDay = new Map<string, number>();
  for (const e of all) {
    const key = dayKey(new Date(e.start));
    perDay.set(key, (perDay.get(key) ?? 0) + seconds(e));
  }

  const inMonth = all.filter(e => new Date(e.start) >= month && new Date(e.start) < monthEnd);
  const monthTotal = inMonth.reduce((s, e) => s + seconds(e), 0);
  const daysWorked = new Set(inMonth.map(e => dayKey(new Date(e.start)))).size;

  const byProject = new Map<string, { name: string; client: string | null; color: string | null; seconds: number }>();
  for (const e of inMonth) {
    const key = String(e.projectId ?? "none");
    const row = byProject.get(key) ?? { name: e.projectName ?? "(inget projekt)", client: e.clientName, color: e.projectColor, seconds: 0 };
    row.seconds += seconds(e);
    byProject.set(key, row);
  }
  const projectRows = [...byProject.values()].sort((a, b) => b.seconds - a.seconds);
  const maxProject = projectRows[0]?.seconds ?? 0;

  // A task is a description within a project, as in the timer's suggestions.
  const byTask = new Map<string, { name: string; project: string | null; client: string | null; color: string | null; seconds: number }>();
  if (week) {
    const weekEnd = addDays(week, 7);
    for (const e of all) {
      const start = new Date(e.start);
      if (start < week || start >= weekEnd) continue;
      const key = `${e.description.trim().toLowerCase()}|${e.projectId}`;
      const row = byTask.get(key) ?? { name: e.description.trim(), project: e.projectName, client: e.clientName, color: e.projectColor, seconds: 0 };
      row.seconds += seconds(e);
      byTask.set(key, row);
    }
  }
  const taskRows = [...byTask.values()].sort((a, b) =>
    (sort.key === "name" ? a.name.localeCompare(b.name, "sv") : a.seconds - b.seconds) * (sort.desc ? -1 : 1));
  const weekTotal = taskRows.reduce((s, r) => s + r.seconds, 0);
  const sortBy = (key: "name" | "time") =>
    setSort(s => ({ key, desc: s.key === key ? !s.desc : key === "time" }));
  const arrow = (key: "name" | "time") => (sort.key === key ? (sort.desc ? " ↓" : " ↑") : "");

  const weeks: Date[] = [];
  for (let w = gridStart; w < gridEnd; w = addDays(w, 7)) weeks.push(w);
  const today = dayKey(new Date());
  const now0 = new Date();
  const thisMonth = new Date(now0.getFullYear(), now0.getMonth(), 1);
  const isCurrentMonth = dayKey(month) === dayKey(thisMonth);
  const shift = (n: number) => { setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); setWeek(null); };

  return (
    <>
      <div className="page-header report-header">
        <div className="month-nav">
          <button className="btn btn-ghost btn-icon" aria-label="Föregående månad" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
          <h1>{month.toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}</h1>
          <button className="btn btn-ghost btn-icon" aria-label="Nästa månad" onClick={() => shift(1)}><ChevronRight size={18} /></button>
          {!isCurrentMonth && <button className="btn btn-ghost" onClick={() => { setMonth(thisMonth); setWeek(null); }}>Denna månad</button>}
        </div>
        <select className="field report-filter" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter">
          <option value="">Alla projekt</option>
          <option value="none">Inget projekt</option>
          {clients.length > 0 && (
            <optgroup label="Klienter">
              {clients.map(c => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
            </optgroup>
          )}
          {projects.length > 0 && (
            <optgroup label="Projekt">
              {projects.map(p => <option key={p.id} value={`p:${p.id}`}>{p.name}{p.clientName ? ` – ${p.clientName}` : ""}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      <div className="report-stats">
        <div className="stat"><div className="stat-label">Totalt</div><div className="stat-value">{formatHours(monthTotal)}</div></div>
        <div className="stat"><div className="stat-label">Dagar med tid</div><div className="stat-value">{daysWorked}</div></div>
        <div className="stat"><div className="stat-label">Snitt per dag</div><div className="stat-value">{daysWorked ? formatHours(monthTotal / daysWorked) : "–"}</div></div>
      </div>

      <div className={`card calendar${isLoading ? " loading" : ""}`}>
        <div className="cal-row cal-head">
          <div className="cal-week">v.</div>
          {WEEKDAYS.map(d => <div key={d} className="cal-day-name">{d}</div>)}
          <div className="cal-sum">Vecka</div>
        </div>
        {weeks.map(w => {
          const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
          const weekTotal = days.reduce((s, d) => s + (perDay.get(dayKey(d)) ?? 0), 0);
          const wk = dayKey(w);
          return (
            <div key={wk} className={`cal-row cal-week-row${week && dayKey(week) === wk ? " selected" : ""}`}
              title={`Visa uppgifter vecka ${isoWeek(w)}`} onClick={() => setWeek(week && dayKey(week) === wk ? null : w)}>
              <div className="cal-week">{isoWeek(w)}</div>
              {days.map(d => {
                const key = dayKey(d);
                const secs = perDay.get(key) ?? 0;
                const shade = Math.min(secs / 3600 / FULL_DAY_HOURS, 1);
                const outside = d < month || d >= monthEnd;
                return (
                  <div key={key}
                    className={`cal-cell${outside ? " outside" : ""}${key === today ? " today" : ""}`}
                    style={secs ? { background: `color-mix(in srgb, var(--accent) ${Math.round(8 + shade * 32)}%, var(--surface))` } : undefined}
                    title={`${d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}: ${formatHours(secs)}`}>
                    <span className="cal-date">{d.getDate()}</span>
                    <span className="cal-hours">{secs ? formatHours(secs) : ""}</span>
                  </div>
                );
              })}
              <div className="cal-sum">{weekTotal ? formatHours(weekTotal) : "–"}</div>
            </div>
          );
        })}
      </div>

      {week && (
        <>
          <h2 className="report-subhead">Vecka {isoWeek(week)}</h2>
          <div className="card">
            <div className="task-row task-head">
              <button type="button" onClick={() => sortBy("name")}>Uppgift{arrow("name")}</button>
              <button type="button" className="task-time" onClick={() => sortBy("time")}>Tid{arrow("time")}</button>
            </div>
            {taskRows.length === 0 && <div className="empty">Ingen tid den här veckan.</div>}
            {taskRows.map(r => (
              <div key={`${r.name}|${r.project}|${r.client}`} className="task-row">
                <div className="bar-label">
                  <span className="bar-name">{r.name || "(ingen beskrivning)"}</span>
                  {r.project && (
                    <span className="project-label" style={{ color: r.color ?? undefined }}>
                      <span className="dot" style={{ background: r.color ?? undefined }} />
                      <span className="project-label-name">{r.project}</span>
                      {r.client && <span className="project-client"> - {r.client}</span>}
                    </span>
                  )}
                </div>
                <div className="task-time">{formatHours(r.seconds)}</div>
              </div>
            ))}
            {taskRows.length > 0 && (
              <div className="task-row task-total"><div>Totalt</div><div className="task-time">{formatHours(weekTotal)}</div></div>
            )}
          </div>
        </>
      )}

      <h2 className="report-subhead">Per projekt</h2>
      <div className="card">
        {projectRows.length === 0 && <div className="empty">Ingen tid den här månaden.</div>}
        {projectRows.map(r => (
          <div key={`${r.name}${r.client}`} className="bar-row" title={`${r.name}: ${formatHours(r.seconds)}`}>
            <div className="bar-label">
              <span className="dot" style={{ background: r.color ?? undefined }} />
              <span className="bar-name">{r.name}</span>
              {r.client && <span className="project-client"> – {r.client}</span>}
            </div>
            <div className="bar-track">
              <div className="bar" style={{ width: `${(r.seconds / maxProject) * 100}%`, background: r.color ?? "var(--muted)" }} />
            </div>
            <div className="bar-value">{formatHours(r.seconds)}</div>
            <div className="bar-share">{monthTotal ? Math.round((r.seconds / monthTotal) * 100) : 0} %</div>
          </div>
        ))}
      </div>
    </>
  );
}
