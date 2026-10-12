import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, Copy, EllipsisVertical, List, Play, Trash2 } from "lucide-react";
import {
  createEntry, deleteEntry, getEntries, getProjects, getRunning, getSuggestions, startTimer, stopTimer, updateEntry,
  type EntryInput, type TimeEntry,
} from "../api/data";
import {
  addDays, dayKey, formatClock, formatDayHeading, formatDuration, formatTimer, formatWeekHeading,
  parseClock, parseDuration, secondsBetween, startOfWeek,
} from "../lib/time";
import { useClickOutside } from "../lib/useClickOutside";
import { getMe } from "../api/auth";
import EntryModal from "../components/EntryModal";
import ProjectPicker from "../components/ProjectPicker";
import TagPicker from "../components/TagPicker";

const WEEKS_PER_PAGE = 4;

export default function Tracker() {
  const [weeks, setWeeks] = useState(WEEKS_PER_PAGE);
  const [manualOpen, setManualOpen] = useState(false);
  const { data: running = null } = useQuery({ queryKey: ["running"], queryFn: getRunning, refetchOnWindowFocus: true });

  // One clock for the timer and every total, so they tick in step.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const thisWeek = dayKey(startOfWeek(new Date(now)));
  const weekStarts = useMemo(() => {
    const first = new Date(`${thisWeek}T00:00`);
    return Array.from({ length: weeks }, (_, i) => addDays(first, -7 * i));
  }, [thisWeek, weeks]);

  return (
    <>
      <TimerBar running={running} now={now} onManual={() => setManualOpen(true)} />
      {weekStarts.map((w, i) => <WeekSection key={dayKey(w)} weekStart={w} alwaysShow={i === 0} running={running} now={now} />)}
      <div className="load-more">
        <button className="btn" onClick={() => setWeeks(w => w + WEEKS_PER_PAGE)}>Visa fler</button>
      </div>
      <EntryModal open={manualOpen} entry={null} onClose={() => setManualOpen(false)} />
    </>
  );
}

function WeekSection({ weekStart, alwaysShow, running, now }: {
  weekStart: Date; alwaysShow: boolean; running: TimeEntry | null; now: number;
}) {
  const weekEnd = addDays(weekStart, 7);
  const { data: entries = [] } = useQuery({
    queryKey: ["entries", dayKey(weekStart)],
    queryFn: () => getEntries(weekStart, weekEnd),
  });

  // The running entry isn't in the list, but it counts towards its day and week.
  const runningKey = running && new Date(running.start) >= weekStart && new Date(running.start) < weekEnd
    ? dayKey(new Date(running.start)) : null;
  const runningSeconds = runningKey ? secondsBetween(running!.start, null, now) : 0;

  const days = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    if (runningKey) map.set(runningKey, []);
    for (const e of entries) {
      const key = dayKey(new Date(e.start));
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [entries, runningKey]);

  if (days.length === 0 && !alwaysShow) return null;

  return (
    <section className="week">
      <div className="week-header">
        <span>{formatWeekHeading(weekStart)}</span>
        <span className="week-total"><span className="total-label">Veckototal:</span> {formatDuration(sum(entries) + runningSeconds)}</span>
      </div>
      {days.map(([key, list]) => (
        <div key={key} className="day">
          <div className="day-header">
            <span className="day-title">{formatDayHeading(new Date(`${key}T00:00`))}</span>
            <span className="day-total"><span className="total-label">Totalt:</span> {formatDuration(sum(list) + (key === runningKey ? runningSeconds : 0))}</span>
          </div>
          {groupEntries(list).map(g => g.length === 1
            ? <EntryRow key={g[0].id} entry={g[0]} />
            : <EntryGroup key={g[0].id} entries={g} />)}
        </div>
      ))}
    </section>
  );
}

const sum = (list: TimeEntry[]) => list.reduce((s, e) => s + secondsBetween(e.start, e.end), 0);

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

const toInput = (e: TimeEntry): EntryInput => ({
  description: e.description, projectId: e.projectId, tagIds: e.tags.map(t => t.id),
  billable: e.billable, start: e.start, end: e.end,
});

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["running"] });
    qc.invalidateQueries({ queryKey: ["entries"] });
  };
}

function useRestart(entry: TimeEntry) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => startTimer({
      description: entry.description, projectId: entry.projectId,
      tagIds: entry.tags.map(t => t.id), billable: entry.billable,
    }),
    onSuccess: refresh,
  });
}

function EntryGroup({ entries }: { entries: TimeEntry[] }) {
  const [open, setOpen] = useState(false);
  const refresh = useRefresh();
  const latest = entries[0];
  const earliest = entries[entries.length - 1];
  const restart = useRestart(latest);

  // Editing the group's row changes every entry in it, like Clockify.
  const save = useMutation({
    mutationFn: (changes: Partial<EntryInput>) =>
      Promise.all(entries.map(e => updateEntry(e.id, { ...toInput(e), ...changes }))),
    onSuccess: refresh,
    onError: refresh,
  });

  return (
    <Fragment>
      <div className={`entry entry-group${open ? " open" : ""}`}>
        <div className="entry-lead">
          <button className="group-count" onClick={() => setOpen(o => !o)} aria-expanded={open}
            title={open ? "Fäll ihop" : "Visa alla"}>{entries.length}</button>
          <DescriptionInput value={latest.description} onSave={description => save.mutate({ description })} />
        </div>
        <div className="entry-project">
          <ProjectPicker value={latest.projectId} onChange={p => save.mutate({ projectId: p?.id ?? null })} />
        </div>
        <div className="cell cell-tags">
          <TagPicker value={latest.tags.map(t => t.id)} onChange={tagIds => save.mutate({ tagIds })} />
        </div>
        <div className="cell cell-billable">
          <button className={`billable-btn${latest.billable ? " on" : ""}`} title="Debiterbar" aria-pressed={latest.billable}
            onClick={() => save.mutate({ billable: !latest.billable })}>$</button>
        </div>
        <div className="cell cell-times">
          <span className="time-static">{formatClock(earliest.start)}</span>
          <span className="time-sep">-</span>
          <span className="time-static">{formatClock(latest.end!)}</span>
        </div>
        <div className="cell cell-date" />
        <div className="cell cell-duration"><span className="duration-static">{formatDuration(sum(entries))}</span></div>
        <button className="icon-btn" title="Starta igen" aria-label="Starta igen" onClick={() => restart.mutate()}>
          <Play size={18} />
        </button>
        <div className="icon-btn-spacer" />
      </div>
      {open && entries.map(e => <EntryRow key={e.id} entry={e} child />)}
    </Fragment>
  );
}

function DescriptionInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <input key={value} className="entry-desc" defaultValue={value} placeholder="Lägg till beskrivning"
      onBlur={e => { if (e.target.value.trim() !== value) onSave(e.target.value); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

// One entry, edited in place like Clockify: every field saves when it loses focus.
function EntryRow({ entry, child }: { entry: TimeEntry; child?: boolean }) {
  const refresh = useRefresh();
  const restart = useRestart(entry);
  const dateInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (changes: Partial<EntryInput>) => updateEntry(entry.id, { ...toInput(entry), ...changes }),
    onSuccess: refresh,
    onError: refresh,
  });

  const start = new Date(entry.start);
  const end = new Date(entry.end!);

  function setClock(which: "start" | "end", text: string, input: HTMLInputElement) {
    const parsed = parseClock(text);
    const original = which === "start" ? start : end;
    if (!parsed) { input.value = formatClock(original.toISOString()); return; }

    const next = new Date(start);
    next.setHours(parsed[0], parsed[1], 0, 0);
    if (which === "start") {
      if (next > end) { input.value = formatClock(entry.start); return; }
      if (next.getTime() !== start.getTime()) save.mutate({ start: next.toISOString() });
    } else {
      const e = next < start ? addDays(next, 1) : next;
      if (e.getTime() !== end.getTime()) save.mutate({ end: e.toISOString() });
    }
  }

  function setDuration(text: string, input: HTMLInputElement) {
    const seconds = parseDuration(text);
    if (seconds === null) { input.value = formatDuration(secondsBetween(entry.start, entry.end)); return; }
    const e = new Date(start.getTime() + seconds * 1000);
    if (e.getTime() !== end.getTime()) save.mutate({ end: e.toISOString() });
  }

  function setDate(value: string) {
    if (!value) return;
    const [y, m, d] = value.split("-").map(Number);
    const next = new Date(start);
    next.setFullYear(y, m - 1, d);
    const shift = next.getTime() - start.getTime();
    if (shift !== 0) save.mutate({ start: next.toISOString(), end: new Date(end.getTime() + shift).toISOString() });
  }

  return (
    <div className={`entry${child ? " entry-child" : ""}`}>
      <div className="entry-lead">
        <DescriptionInput value={entry.description} onSave={description => save.mutate({ description })} />
      </div>
      <div className="entry-project">
        <ProjectPicker value={entry.projectId} onChange={p => save.mutate({ projectId: p?.id ?? null })} />
      </div>
      <div className="cell cell-tags">
        <TagPicker value={entry.tags.map(t => t.id)} onChange={tagIds => save.mutate({ tagIds })} />
      </div>
      <div className="cell cell-billable">
        <button className={`billable-btn${entry.billable ? " on" : ""}`} title="Debiterbar" aria-pressed={entry.billable}
          onClick={() => save.mutate({ billable: !entry.billable })}>$</button>
      </div>
      <div className="cell cell-times">
        <input key={`s${entry.start}`} className="time-input" defaultValue={formatClock(entry.start)} aria-label="Starttid"
          onBlur={e => setClock("start", e.target.value, e.target)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <span className="time-sep">-</span>
        <input key={`e${entry.end}`} className="time-input" defaultValue={formatClock(entry.end!)} aria-label="Sluttid"
          onBlur={e => setClock("end", e.target.value, e.target)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </div>
      <div className="cell cell-date">
        <button className="icon-btn" title={start.toLocaleDateString("sv-SE")} aria-label="Ändra datum"
          onClick={() => dateInput.current?.showPicker()}>
          <Calendar size={18} />
        </button>
        <input ref={dateInput} type="date" className="hidden-date" tabIndex={-1} aria-hidden
          defaultValue={dayKey(start)} key={`dt${entry.start}`} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="cell cell-duration">
        <input key={`du${entry.start}${entry.end}`} className="duration-input" aria-label="Varaktighet"
          defaultValue={formatDuration(secondsBetween(entry.start, entry.end))}
          onBlur={e => setDuration(e.target.value, e.target)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </div>
      <button className="icon-btn" title="Starta igen" aria-label="Starta igen" onClick={() => restart.mutate()}>
        <Play size={18} />
      </button>
      <EntryMenu entry={entry} />
    </div>
  );
}

function EntryMenu({ entry }: { entry: TimeEntry }) {
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, useCallback(() => { setOpen(false); setConfirm(false); }, []));

  const duplicate = useMutation({ mutationFn: () => createEntry(toInput(entry)), onSuccess: () => { setOpen(false); refresh(); } });
  const remove = useMutation({ mutationFn: () => deleteEntry(entry.id), onSuccess: refresh });

  return (
    <div className="picker" ref={ref}>
      <button className="icon-btn" aria-label="Fler val" onClick={() => setOpen(o => !o)}>
        <EllipsisVertical size={18} />
      </button>
      {open && (
        <div className="dropdown dropdown-right">
          <button className="dropdown-item" onClick={() => duplicate.mutate()}><Copy size={14} /> Duplicera</button>
          {confirm
            ? <button className="dropdown-item danger" onClick={() => remove.mutate()}><Trash2 size={14} /> Bekräfta borttagning</button>
            : <button className="dropdown-item danger" onClick={() => setConfirm(true)}><Trash2 size={14} /> Ta bort</button>}
        </div>
      )}
    </div>
  );
}

function TimerBar({ running, now, onManual }: { running: TimeEntry | null; now: number; onManual: () => void }) {
  const refresh = useRefresh();
  const qc = useQueryClient();

  // Draft for the next timer; mirrors the running entry while one runs.
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [billable, setBillable] = useState(false);

  // An idle, untouched timer starts on the default project.
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  const defaultProject = projects.find(p => p.id === me?.defaultProjectId && !p.archived) ?? null;
  function resetDraft() {
    setDescription(""); setTagIds([]);
    setProjectId(defaultProject?.id ?? null);
    setBillable(defaultProject?.billable ?? false);
  }
  // Keyed on the id, so a projects refetch doesn't undo a deliberate "no project".
  const defaultId = defaultProject?.id;
  const defaultBillable = defaultProject?.billable ?? false;
  useEffect(() => {
    if (running || defaultId === undefined) return;
    setProjectId(current => current ?? defaultId);
    setBillable(current => current || defaultBillable);
  }, [running, defaultId, defaultBillable]);

  useEffect(() => {
    if (!running) return;
    setDescription(running.description);
    setProjectId(running.projectId);
    setTagIds(running.tags.map(t => t.id));
    setBillable(running.billable);
  }, [running]);

  useEffect(() => {
    document.title = running ? `${formatTimer(secondsBetween(running.start, null, now))} · timesheet` : "timesheet";
  }, [running, now]);

  // Autocomplete: earlier tasks matching what is typed, offered once the user starts typing.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(description.trim()), 150);
    return () => clearTimeout(t);
  }, [description]);
  const { data: suggestions = [] } = useQuery({
    queryKey: ["suggestions", query],
    queryFn: () => getSuggestions(query),
    enabled: suggestOpen && query !== "",
    placeholderData: prev => prev,
  });
  const showSuggestions = suggestOpen && description.trim() !== "" && suggestions.length > 0;

  function pickSuggestion(e: TimeEntry) {
    const values = { description: e.description, projectId: e.projectId, tagIds: e.tags.map(t => t.id), billable: e.billable };
    setDescription(values.description);
    setProjectId(values.projectId);
    setTagIds(values.tagIds);
    setBillable(values.billable);
    setSuggestOpen(false);
    setHighlight(-1);
    if (running) patch.mutate(values);
  }

  function onDescKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, -1)); }
    else if (e.key === "Escape") { setSuggestOpen(false); setHighlight(-1); }
    else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); pickSuggestion(suggestions[highlight]); }
  }

  const start = useMutation({
    mutationFn: () => startTimer({ description, projectId, tagIds, billable }),
    onSuccess: () => { setSuggestOpen(false); refresh(); },
  });
  const stop = useMutation({
    mutationFn: stopTimer,
    onSuccess: () => {
      resetDraft();
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

  const error = start.error ?? stop.error ?? patch.error;

  return (
    <>
      <form className="timer-bar" onSubmit={e => { e.preventDefault(); if (!running) start.mutate(); }}>
        <div className="timer-desc-wrap">
          <input className="timer-desc" placeholder="Vad jobbar du med?" autoComplete="off"
            role="combobox" aria-expanded={showSuggestions} aria-autocomplete="list"
            value={description} onKeyDown={onDescKey}
            onChange={e => { setDescription(e.target.value); setSuggestOpen(true); setHighlight(-1); }}
            onBlur={() => {
              setSuggestOpen(false);
              if (running && description !== running.description) patch.mutate({ description });
            }} />
          {showSuggestions && (
            <div className="suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <div key={s.id} role="option" aria-selected={i === highlight}
                  className={`suggestion${i === highlight ? " active" : ""}`}
                  // mousedown, not click: the input's blur would close the list first
                  onMouseDown={e => { e.preventDefault(); pickSuggestion(s); }}
                  onMouseEnter={() => setHighlight(i)}>
                  <span className="suggestion-desc">{s.description}</span>
                  {s.projectName && (
                    <span className="project-label" style={{ color: s.projectColor ?? undefined }}>
                      <span className="dot" style={{ background: s.projectColor ?? undefined }} />
                      <span className="project-label-name">{s.projectName}</span>
                      {s.clientName && <span className="project-client"> - {s.clientName}</span>}
                    </span>
                  )}
                  {s.tags.length > 0 && <span className="tag-names">{s.tags.map(t => t.name).join(", ")}</span>}
                  {s.billable && <span className="billable-on">$</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="timer-project">
          <ProjectPicker value={projectId} onChange={p => {
            change("projectId", p?.id ?? null, setProjectId);
            if (p && !running) setBillable(p.billable);
          }} />
        </div>
        <div className="cell cell-tags">
          <TagPicker value={tagIds} onChange={ids => change("tagIds", ids, setTagIds)} />
        </div>
        <div className="cell cell-billable">
          <button type="button" className={`billable-btn${billable ? " on" : ""}`} title="Debiterbar" aria-pressed={billable}
            onClick={() => change("billable", !billable, setBillable)}>$</button>
        </div>
        <div className="timer-clock">{running ? formatTimer(secondsBetween(running.start, null, now)) : "0"}</div>
        {running
          ? <button type="button" className="timer-button stop" disabled={stop.isPending} onClick={() => stop.mutate()}>Stoppa</button>
          : <button type="submit" className="timer-button" disabled={start.isPending}>Starta</button>}
        <div className="timer-modes">
          <button type="button" className="mode active" title="Timer" aria-label="Timer"><Clock size={14} /></button>
          <button type="button" className="mode" title="Lägg till tid manuellt" aria-label="Lägg till tid manuellt" onClick={onManual}>
            <List size={14} />
          </button>
        </div>
      </form>
      {error && <div className="alert alert-error">{error.message}</div>}
    </>
  );
}
