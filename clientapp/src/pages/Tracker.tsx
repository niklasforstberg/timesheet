import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play, Plus, Square } from "lucide-react";
import {
  getEntries, getProjects, getRunning, getTags, startTimer, stopTimer, updateEntry,
  type EntryInput, type TimeEntry,
} from "../api/data";
import {
  addDays, dayKey, formatClock, formatDayHeading, formatDuration, isoWeek, secondsBetween, startOfWeek,
} from "../lib/time";
import EntryModal from "../components/EntryModal";
import ProjectSelect from "../components/ProjectSelect";
import TagPicker from "../components/TagPicker";

export default function Tracker() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const weekEnd = addDays(weekStart, 7);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["entries", dayKey(weekStart)],
    queryFn: () => getEntries(weekStart, weekEnd),
  });
  const { data: running } = useQuery({ queryKey: ["running"], queryFn: getRunning, refetchOnWindowFocus: true });

  // One clock for the timer and every total, so they tick in step.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // The running entry isn't in the list, but it counts towards its day and week.
  const runningKey = running && new Date(running.start) >= weekStart && new Date(running.start) < weekEnd
    ? dayKey(new Date(running.start)) : null;
  const runningSeconds = running ? secondsBetween(running.start, null, now) : 0;

  const days = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    if (runningKey) map.set(runningKey, []);
    for (const e of entries) {
      const key = dayKey(new Date(e.start));
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [entries, runningKey]);

  const sum = (list: TimeEntry[]) => list.reduce((s, e) => s + secondsBetween(e.start, e.end), 0);
  const weekTotal = sum(entries) + (runningKey ? runningSeconds : 0);
  const isCurrentWeek = dayKey(weekStart) === dayKey(startOfWeek(new Date()));

  function openEditor(entry: TimeEntry | null) {
    setEditing(entry);
    setModalOpen(true);
  }

  return (
    <>
      <TimerBar now={now} onAddManual={() => openEditor(null)} onEditRunning={openEditor} />

      <div className="week-nav">
        <button className="btn btn-ghost btn-icon" aria-label="Föregående vecka" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft size={18} />
        </button>
        <div className="week-label">
          Vecka {isoWeek(weekStart)}
          <span className="muted"> · {weekStart.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
            {" – "}{addDays(weekStart, 6).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}</span>
        </div>
        <button className="btn btn-ghost btn-icon" aria-label="Nästa vecka" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight size={18} />
        </button>
        {!isCurrentWeek && (
          <button className="btn btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>Denna vecka</button>
        )}
        <div className="week-total">Totalt <strong className="mono">{formatDuration(weekTotal)}</strong></div>
      </div>

      {isLoading && <div className="muted">Laddar…</div>}
      {!isLoading && days.length === 0 && (
        <div className="empty">Ingen tid registrerad den här veckan.</div>
      )}

      {days.map(([key, list]) => (
        <section key={key} className="day">
          <div className="day-header">
            <span className="day-title">{formatDayHeading(new Date(`${key}T00:00`))}</span>
            <span className="mono muted">{formatDuration(sum(list) + (key === runningKey ? runningSeconds : 0))}</span>
          </div>
          {groupEntries(list).map(g => g.length === 1
            ? <EntryRow key={g[0].id} entry={g[0]} onEdit={() => openEditor(g[0])} />
            : <EntryGroup key={g[0].id} entries={g} onEdit={openEditor} />)}
        </section>
      ))}

      <EntryModal open={modalOpen} entry={editing} onClose={() => setModalOpen(false)} />
    </>
  );
}

// Entries in a day that are "the same task" — same description, project, tags
// and billable — form one group, placed where its latest entry is (like Clockify).
function groupEntries(list: TimeEntry[]): TimeEntry[][] {
  const groups = new Map<string, TimeEntry[]>();
  for (const e of list) {
    const key = [e.description.trim().toLowerCase(), e.projectId, e.tags.map(t => t.id).sort().join(","), e.billable].join("|");
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.values()];
}

function useRestart(entry: TimeEntry) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => startTimer({
      description: entry.description, projectId: entry.projectId,
      tagIds: entry.tags.map(t => t.id), billable: entry.billable,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["running"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

function EntryGroup({ entries, onEdit }: { entries: TimeEntry[]; onEdit: (e: TimeEntry) => void }) {
  const [open, setOpen] = useState(false);
  const first = entries[entries.length - 1];
  const last = entries[0];
  const total = entries.reduce((s, e) => s + secondsBetween(e.start, e.end), 0);

  return (
    <Fragment>
      <EntryRow entry={last} onEdit={() => setOpen(o => !o)}
        count={entries.length} open={open}
        times={`${formatClock(first.start)}–${formatClock(last.end!)}`} seconds={total} />
      {open && entries.map(e => <EntryRow key={e.id} entry={e} onEdit={() => onEdit(e)} child />)}
    </Fragment>
  );
}

function EntryRow({ entry, onEdit, count, open, times, seconds, child }: {
  entry: TimeEntry;
  onEdit: () => void;
  /** Set on a group's summary row. */
  count?: number;
  open?: boolean;
  times?: string;
  seconds?: number;
  child?: boolean;
}) {
  const restart = useRestart(entry);

  return (
    <div className={`entry${child ? " entry-child" : ""}${open ? " entry-open" : ""}`} onClick={onEdit} role="button" tabIndex={0}
      aria-expanded={count ? open : undefined}
      onKeyDown={e => { if (e.key === "Enter") onEdit(); }}>
      {count && <span className="group-count" title={open ? "Fäll ihop" : "Visa alla"}>{count}</span>}
      <div className="entry-main">
        <div className={entry.description ? "entry-desc" : "entry-desc muted"}>
          {entry.description || "(ingen beskrivning)"}
        </div>
        <div className="entry-meta">
          {entry.projectName && (
            <span className="project-chip" style={{ color: entry.projectColor ?? undefined }}>
              <span className="dot" style={{ background: entry.projectColor ?? undefined }} />
              {entry.projectName}
              {entry.clientName && <span className="muted"> · {entry.clientName}</span>}
            </span>
          )}
          {entry.tags.map(t => <span key={t.id} className="tag">{t.name}</span>)}
          {entry.billable && <span className="tag tag-billable">$</span>}
        </div>
      </div>
      <div className="entry-times muted">{times ?? `${formatClock(entry.start)}–${entry.end ? formatClock(entry.end) : ""}`}</div>
      <div className="entry-duration mono">{formatDuration(seconds ?? secondsBetween(entry.start, entry.end))}</div>
      <button className="btn btn-ghost btn-icon" title="Starta igen" aria-label="Starta igen"
        onClick={ev => { ev.stopPropagation(); restart.mutate(); }}>
        <Play size={16} />
      </button>
    </div>
  );
}

function TimerBar({ now, onAddManual, onEditRunning }: { now: number; onAddManual: () => void; onEditRunning: (e: TimeEntry) => void }) {
  const qc = useQueryClient();
  const { data: running } = useQuery({ queryKey: ["running"], queryFn: getRunning, refetchOnWindowFocus: true });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: getTags });

  // Draft for the next timer; mirrors the running entry while one runs.
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [billable, setBillable] = useState(false);

  useEffect(() => {
    if (!running) return;
    setDescription(running.description);
    setProjectId(running.projectId);
    setTagIds(running.tags.map(t => t.id));
    setBillable(running.billable);
  }, [running]);

  useEffect(() => {
    document.title = running ? `${formatDuration(secondsBetween(running.start, null, now))} · timesheet` : "timesheet";
  }, [running, now]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["running"] });
    qc.invalidateQueries({ queryKey: ["entries"] });
  };

  const start = useMutation({
    mutationFn: () => startTimer({ description, projectId, tagIds, billable }),
    onSuccess: refresh,
  });
  const stop = useMutation({
    mutationFn: stopTimer,
    onSuccess: () => {
      setDescription(""); setProjectId(null); setTagIds([]); setBillable(false);
      refresh();
    },
  });
  // Changes to a running timer are saved as they happen.
  const patch = useMutation({
    mutationFn: (changes: Partial<EntryInput>) => updateEntry(running!.id, {
      description, projectId, tagIds, billable, start: running!.start, end: null, ...changes,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["running"] }),
  });

  function change<K extends keyof EntryInput>(key: K, value: EntryInput[K], set: (v: EntryInput[K]) => void) {
    set(value);
    if (running) patch.mutate({ [key]: value });
  }

  function pickProject(id: number | null) {
    const p = projects.find(x => x.id === id);
    change("projectId", id, setProjectId);
    if (p && !running) setBillable(p.billable);
  }

  const error = start.error ?? stop.error ?? patch.error;

  return (
    <div className="timer-card">
      <form className="timer-bar" onSubmit={e => { e.preventDefault(); if (!running) start.mutate(); }}>
        <input className="field timer-desc" placeholder={running ? "Vad jobbar du med?" : "Vad ska du jobba med?"}
          value={description} onChange={e => setDescription(e.target.value)}
          onBlur={() => { if (running && description !== running.description) patch.mutate({ description }); }} />
        <div className="timer-project">
          <ProjectSelect projects={projects} value={projectId} onChange={pickProject} />
        </div>
        <TagPicker tags={tags} value={tagIds} onChange={ids => change("tagIds", ids, setTagIds)} />
        <button type="button" className={`btn btn-ghost btn-icon billable-toggle${billable ? " active" : ""}`}
          title="Debiterbar" aria-label="Debiterbar" aria-pressed={billable}
          onClick={() => change("billable", !billable, setBillable)}>$</button>
        {running ? (
          <>
            <button type="button" className="timer-clock mono" onClick={() => onEditRunning(running)} title="Ändra starttid">
              {formatDuration(secondsBetween(running.start, null, now))}
            </button>
            <button type="button" className="btn btn-stop" disabled={stop.isPending} onClick={() => stop.mutate()}>
              <Square size={14} fill="currentColor" /> Stoppa
            </button>
          </>
        ) : (
          <>
            <span className="timer-clock mono muted">0:00:00</span>
            <button type="submit" className="btn btn-primary" disabled={start.isPending}>
              <Play size={14} fill="currentColor" /> Starta
            </button>
          </>
        )}
      </form>
      <div className="timer-footer">
        {error ? <span className="error-text">{error.message}</span> : <span />}
        <button className="btn btn-link" onClick={onAddManual}><Plus size={14} /> Lägg till tid manuellt</button>
      </div>
    </div>
  );
}
