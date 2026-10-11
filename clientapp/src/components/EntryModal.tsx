import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEntry, deleteEntry, getProjects, updateEntry, type TimeEntry } from "../api/data";
import { combine, dayKey, timeOf, addDays } from "../lib/time";
import Modal from "./Modal";
import ProjectSelect from "./ProjectSelect";
import TagPicker from "./TagPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Null creates a new entry. */
  entry: TimeEntry | null;
}

// Create or edit an entry. End before start means the entry runs past midnight.
export default function EntryModal({ open, onClose, entry }: Props) {
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });

  const running = entry !== null && entry.end === null;
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [billable, setBillable] = useState(false);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (!open) return;
    const s = entry ? new Date(entry.start) : new Date(Date.now() - 3600_000);
    const e = entry?.end ? new Date(entry.end) : new Date();
    setDescription(entry?.description ?? "");
    setProjectId(entry?.projectId ?? null);
    setTagIds(entry?.tags.map(t => t.id) ?? []);
    setBillable(entry?.billable ?? false);
    setDate(dayKey(s));
    setStart(timeOf(s));
    setEnd(timeOf(e));
    save.reset();
  }, [open, entry]);

  const done = () => {
    qc.invalidateQueries({ queryKey: ["entries"] });
    qc.invalidateQueries({ queryKey: ["running"] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const s = combine(date, start);
      let e: Date | null = null;
      if (!running) {
        e = combine(date, end);
        if (e < s) e = addDays(e, 1);
      }
      const input = { description, projectId, tagIds, billable, start: s.toISOString(), end: e?.toISOString() ?? null };
      return entry ? updateEntry(entry.id, input) : createEntry(input);
    },
    onSuccess: done,
  });

  const remove = useMutation({ mutationFn: () => deleteEntry(entry!.id), onSuccess: done });

  function pickProject(id: number | null) {
    setProjectId(id);
    const p = projects.find(x => x.id === id);
    if (p && !entry) setBillable(p.billable);
  }

  return (
    <Modal open={open} onClose={onClose} title={entry ? "Redigera tidspost" : "Lägg till tid"}
      footer={<>
        {entry && (
          <button className="btn btn-danger-ghost" style={{ marginRight: "auto" }}
            disabled={remove.isPending} onClick={() => remove.mutate()}>Ta bort</button>
        )}
        <button className="btn btn-ghost" onClick={onClose}>Avbryt</button>
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Spara</button>
      </>}>
      {(save.error || remove.error) && <div className="alert alert-error">{(save.error ?? remove.error)!.message}</div>}
      <div className="field-group">
        <label className="field-label" htmlFor="entry-desc">Beskrivning</label>
        <input id="entry-desc" className="field" autoFocus value={description}
          onChange={e => setDescription(e.target.value)} placeholder="Vad jobbade du med?" />
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="entry-project">Projekt</label>
        <ProjectSelect id="entry-project" projects={projects} value={projectId} onChange={pickProject} />
      </div>
      <div className="row">
        <div className="field-group" style={{ flex: 2 }}>
          <label className="field-label" htmlFor="entry-date">Datum</label>
          <input id="entry-date" className="field" type="date" required value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label" htmlFor="entry-start">Start</label>
          <input id="entry-start" className="field" type="time" required value={start} onChange={e => setStart(e.target.value)} />
        </div>
        {!running && (
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label" htmlFor="entry-end">Slut</label>
            <input id="entry-end" className="field" type="time" required value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        )}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <TagPicker value={tagIds} onChange={setTagIds} />
        <label className="check">
          <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} />
          Debiterbar
        </label>
      </div>
    </Modal>
  );
}
