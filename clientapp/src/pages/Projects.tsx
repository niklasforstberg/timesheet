import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import {
  deleteClient, deleteProject, deleteTag, getClients, getProjects, getTags,
  saveClient, saveProject, saveTag, type Project, type ProjectInput,
} from "../api/data";
import Modal from "../components/Modal";

const COLORS = ["#2f6fed", "#03a9f4", "#009688", "#4caf50", "#8bc34a", "#cddc39", "#ffc107", "#ff9800", "#ff5722", "#e91e63", "#9c27b0", "#607d8b"];

export default function Projects() {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = projects.filter(p => showArchived || !p.archived);

  return (
    <>
      <div className="page-header">
        <h1>Projekt</h1>
        <label className="check small">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Visa arkiverade
        </label>
        <button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={14} /> Nytt projekt</button>
      </div>

      <div className="card list">
        {visible.length === 0 && <div className="empty">Inga projekt än.</div>}
        {visible.map(p => (
          <div key={p.id} className={`list-row${p.archived ? " archived" : ""}`}>
            <span className="dot" style={{ background: p.color }} />
            <span className="list-name">{p.name}</span>
            <span className="muted">{p.clientName}</span>
            {p.billable && <span className="tag tag-billable">$</span>}
            {p.archived && <span className="tag">Arkiverad</span>}
            <button className="btn btn-ghost btn-icon" aria-label={`Redigera ${p.name}`} onClick={() => setEditing(p)}>
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="two-col">
        <NamedList title="Klienter" queryKey="clients" load={getClients} save={saveClient} remove={deleteClient}
          deleteHint="Projekten blir kvar, men utan klient." />
        <NamedList title="Taggar" queryKey="tags" load={getTags} save={saveTag} remove={deleteTag}
          deleteHint="Taggen tas bort från alla tidsposter." />
      </div>

      <ProjectModal project={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ProjectModal({ project, onClose }: { project: Project | "new" | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const [form, setForm] = useState<ProjectInput | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form whenever a different project is opened.
  const key = project === "new" ? "new" : project?.id;
  const [seededFor, setSeededFor] = useState<typeof key>(undefined);
  if (key !== seededFor) {
    setSeededFor(key);
    setConfirmDelete(false);
    setForm(project === null ? null : project === "new"
      ? { name: "", clientId: null, color: COLORS[0], billable: false, archived: false }
      : { id: project.id, name: project.name, clientId: project.clientId, color: project.color, billable: project.billable, archived: project.archived });
  }

  const done = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["entries"] });
    onClose();
  };
  const save = useMutation({ mutationFn: () => saveProject(form!), onSuccess: done });
  const remove = useMutation({ mutationFn: () => deleteProject(form!.id!), onSuccess: done });

  if (!form) return null;
  const set = (patch: Partial<ProjectInput>) => setForm({ ...form, ...patch });

  return (
    <Modal open onClose={onClose} title={form.id ? "Redigera projekt" : "Nytt projekt"}
      footer={<>
        {form.id && (confirmDelete
          ? <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => remove.mutate()}>Bekräfta borttagning</button>
          : <button className="btn btn-danger-ghost" style={{ marginRight: "auto" }} onClick={() => setConfirmDelete(true)}>Ta bort</button>)}
        <button className="btn btn-ghost" onClick={onClose}>Avbryt</button>
        <button className="btn btn-primary" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>Spara</button>
      </>}>
      {(save.error || remove.error) && <div className="alert alert-error">{(save.error ?? remove.error)!.message}</div>}
      {confirmDelete && <div className="alert alert-error">Tidsposterna blir kvar, men utan projekt.</div>}
      <div className="field-group">
        <label className="field-label" htmlFor="project-name">Namn</label>
        <input id="project-name" className="field" autoFocus value={form.name} onChange={e => set({ name: e.target.value })} />
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="project-client">Klient</label>
        <select id="project-client" className="field" value={form.clientId ?? ""}
          onChange={e => set({ clientId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Ingen klient</option>
          {clients.filter(c => !c.archived || c.id === form.clientId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="field-group">
        <div className="field-label">Färg</div>
        <div className="swatches">
          {COLORS.map(c => (
            <button key={c} type="button" className={`swatch${form.color.toLowerCase() === c ? " active" : ""}`}
              style={{ background: c }} aria-label={c} onClick={() => set({ color: c })} />
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.billable} onChange={e => set({ billable: e.target.checked })} />
        Debiterbar som standard
      </label>
      <label className="check">
        <input type="checkbox" checked={form.archived} onChange={e => set({ archived: e.target.checked })} />
        Arkiverad
      </label>
    </Modal>
  );
}

interface Named { id: number; name: string; archived: boolean }

// Clients and tags are both just a name plus an archived flag.
function NamedList({ title, queryKey, load, save, remove, deleteHint }: {
  title: string;
  queryKey: string;
  load: () => Promise<Named[]>;
  save: (item: Omit<Named, "id"> & { id?: number }) => Promise<Named>;
  remove: (id: number) => Promise<void>;
  deleteHint: string;
}) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: [queryKey], queryFn: load });
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Named | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [queryKey] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["entries"] });
  };
  const add = useMutation({
    mutationFn: () => save({ name: newName.trim(), archived: false }),
    onSuccess: () => { setNewName(""); refresh(); },
  });
  const update = useMutation({
    mutationFn: () => save(editing!),
    onSuccess: () => { setEditing(null); refresh(); },
  });
  const del = useMutation({
    mutationFn: () => remove(editing!.id),
    onSuccess: () => { setEditing(null); refresh(); },
  });

  return (
    <div>
      <h2>{title}</h2>
      <form className="inline-add" onSubmit={e => { e.preventDefault(); if (newName.trim()) add.mutate(); }}>
        <input className="field" placeholder={`Ny ${title === "Klienter" ? "klient" : "tagg"}`}
          value={newName} onChange={e => setNewName(e.target.value)} />
        <button className="btn" disabled={!newName.trim() || add.isPending}>Lägg till</button>
      </form>
      {add.error && <div className="alert alert-error">{add.error.message}</div>}
      <div className="card list">
        {items.length === 0 && <div className="empty">Inga än.</div>}
        {items.map(i => (
          <div key={i.id} className={`list-row${i.archived ? " archived" : ""}`}>
            <span className="list-name">{i.name}</span>
            {i.archived && <span className="tag">Arkiverad</span>}
            <button className="btn btn-ghost btn-icon" aria-label={`Redigera ${i.name}`}
              onClick={() => { setEditing(i); setConfirmDelete(false); }}>
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={`Redigera ${title === "Klienter" ? "klient" : "tagg"}`}
        footer={<>
          {confirmDelete
            ? <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => del.mutate()}>Bekräfta borttagning</button>
            : <button className="btn btn-danger-ghost" style={{ marginRight: "auto" }} onClick={() => setConfirmDelete(true)}>Ta bort</button>}
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Avbryt</button>
          <button className="btn btn-primary" disabled={!editing?.name.trim() || update.isPending} onClick={() => update.mutate()}>Spara</button>
        </>}>
        {confirmDelete && <div className="alert alert-error">{deleteHint}</div>}
        {(update.error || del.error) && <div className="alert alert-error">{(update.error ?? del.error)!.message}</div>}
        {editing && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor={`${queryKey}-name`}>Namn</label>
              <input id={`${queryKey}-name`} className="field" autoFocus value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={editing.archived} onChange={e => setEditing({ ...editing, archived: e.target.checked })} />
              Arkiverad
            </label>
          </>
        )}
      </Modal>
    </div>
  );
}
