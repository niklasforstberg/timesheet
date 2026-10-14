import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteTimebank, deleteTimebankTarget, getProjects, getTimebanks, saveTimebank, saveTimebankTarget, type Timebank,
} from "../api/data";
import Modal from "../components/Modal";
import { addDays, combine, dayKey, formatSignedMinutes, isoWeek, pad, parseSignedMinutes, startOfWeek } from "../lib/time";

// One time bank per project: an opening balance, a weekly schedule with
// single-week exceptions, and the running balance week by week.
export default function TimebankPage() {
  const { data: banks = [], isLoading } = useQuery({ queryKey: ["timebank"], queryFn: getTimebanks });
  const [editing, setEditing] = useState<Timebank | "new" | null>(null);

  return (
    <>
      <div className="page-header">
        <h1>Tidsbank</h1>
        <button className="btn btn-primary" onClick={() => setEditing("new")}><Plus size={14} /> Ny tidsbank</button>
      </div>

      {!isLoading && banks.length === 0 && (
        <div className="card empty">Ingen tidsbank än. Skapa en för projektet du har avtalad arbetstid på.</div>
      )}
      {banks.map(b => <Bank key={b.projectId} bank={b} onEdit={() => setEditing(b)} />)}

      <BankModal bank={editing} banks={banks} onClose={() => setEditing(null)} />
    </>
  );
}

function Bank({ bank, onEdit }: { bank: Timebank; onEdit: () => void }) {
  const current = bank.weeks.find(w => w.current);
  const balanceNow = current?.balanceMinutes ?? bank.balanceMinutes;
  // The weekly target spread evenly over Monday–Friday; only the days after today count.
  const day = new Date().getDay();
  const weekdaysLeft = day >= 1 && day <= 5 ? 5 - day : 0;
  const projected = balanceNow + Math.round((current?.targetMinutes ?? 0) * weekdaysLeft / 5);

  return (
    <section className="bank">
      <h2 className="bank-title">
        <span className="dot" style={{ background: bank.color }} />
        {bank.projectName}
        <button className="btn btn-ghost btn-icon" aria-label="Redigera tidsbank" onClick={onEdit}><Pencil size={14} /></button>
      </h2>

      <div className="report-stats bank-stats">
        <div className="stat">
          <div className="stat-label">Saldo efter förra veckan</div>
          <div className={`stat-value ${tone(bank.balanceMinutes)}`}>{formatSignedMinutes(bank.balanceMinutes)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Denna vecka</div>
          <div className="stat-value">{current ? `${hm(current.workedMinutes)} av ${hm(current.targetMinutes)}` : "–"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Saldo om veckan slutade nu</div>
          <div className={`stat-value ${tone(balanceNow)}`}>{formatSignedMinutes(balanceNow)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Saldo om du jobbar enligt schema resten av veckan</div>
          <div className={`stat-value ${tone(projected)}`}>{formatSignedMinutes(projected)}</div>
        </div>
      </div>

      <Targets bank={bank} />

      <h3 className="report-subhead">Vecka för vecka</h3>
      <div className="card">
        <div className="bank-row bank-head">
          <div>Vecka</div><div /><div className="num">Mål</div><div className="num">Jobbat</div>
          <div className="num">+/−</div><div className="num">Saldo</div><div />
        </div>
        {bank.weeks.map(w => {
          const monday = combine(w.weekStart, "00:00");
          return (
            <div key={w.weekStart} className={`bank-row${w.current ? " bank-current" : ""}`}>
              <div>v{isoWeek(monday)}</div>
              <div className="muted">{weekRange(monday)}</div>
              <div className="num">{hm(w.targetMinutes)}</div>
              <div className="num">{hm(w.workedMinutes)}</div>
              <div className={`num ${tone(w.diffMinutes)}`}>{formatSignedMinutes(w.diffMinutes)}</div>
              <div className={`num ${tone(w.balanceMinutes)}`}>{formatSignedMinutes(w.balanceMinutes)}</div>
              <div className="muted bank-note">{w.current ? "pågår" : w.note}</div>
            </div>
          );
        })}
        <div className="bank-row">
          <div className="muted">Ingående</div><div /><div /><div /><div />
          <div className={`num ${tone(bank.openingMinutes)}`}>{formatSignedMinutes(bank.openingMinutes)}</div><div />
        </div>
      </div>
    </section>
  );
}

// The weekly schedule and single-week exceptions, plus a form to add either.
function Targets({ bank }: { bank: Timebank }) {
  const qc = useQueryClient();
  const [week, setWeek] = useState(() => dayKey(startOfWeek(new Date())));
  const [hours, setHours] = useState("");
  const [onlyThisWeek, setOnlyThisWeek] = useState(true);
  const [note, setNote] = useState("");

  const minutes = parseSignedMinutes(hours);
  const refresh = () => qc.invalidateQueries({ queryKey: ["timebank"] });
  const add = useMutation({
    mutationFn: () => saveTimebankTarget(bank.projectId, { weekStart: week, minutes: minutes!, onlyThisWeek, note }),
    onSuccess: () => { setHours(""); setNote(""); refresh(); },
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteTimebankTarget(bank.projectId, id), onSuccess: refresh });

  return (
    <>
      <h3 className="report-subhead">Schema och avvikelser</h3>
      <div className="card list">
        {bank.targets.length === 0 && <div className="empty">Inget veckomål än – alla veckor räknas som 0 timmar.</div>}
        {bank.targets.map(t => {
          const monday = combine(t.weekStart, "00:00");
          return (
            <div key={t.id} className="list-row">
              <span className="list-name">
                {t.onlyThisWeek
                  ? <>Bara v{isoWeek(monday)} ({weekRange(monday)}): <b>{hm(t.minutes)}</b></>
                  : <>Från v{isoWeek(monday)} {monday.getFullYear()}: <b>{hm(t.minutes)}</b> per vecka</>}
                {t.note && <span className="muted"> – {t.note}</span>}
              </span>
              <button className="btn btn-ghost btn-icon" aria-label="Ta bort" onClick={() => remove.mutate(t.id)}><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
      <form className="inline-add bank-add" onSubmit={e => { e.preventDefault(); if (minutes !== null && minutes >= 0) add.mutate(); }}>
        <select className="field" value={onlyThisWeek ? "1" : "0"} onChange={e => setOnlyThisWeek(e.target.value === "1")} aria-label="Typ">
          <option value="1">Bara veckan</option>
          <option value="0">Från och med veckan</option>
        </select>
        <input className="field" type="date" value={week} onChange={e => setWeek(e.target.value)} aria-label="Vecka" />
        <input className="field" placeholder="Timmar, t.ex. 12 eller 6:30" value={hours} onChange={e => setHours(e.target.value)} aria-label="Timmar" />
        <input className="field" placeholder="Notering, t.ex. semester" value={note} onChange={e => setNote(e.target.value)} aria-label="Notering" />
        <button className="btn" disabled={minutes === null || minutes < 0 || !week || add.isPending}>Lägg till</button>
      </form>
      {(add.error || remove.error) && <div className="alert alert-error">{(add.error ?? remove.error)!.message}</div>}
    </>
  );
}

function BankModal({ bank, banks, onClose }: { bank: Timebank | "new" | null; banks: Timebank[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  const [projectId, setProjectId] = useState<number | null>(null);
  const [start, setStart] = useState("");
  const [opening, setOpening] = useState("");
  const [weekly, setWeekly] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form whenever a different bank is opened.
  const key = bank === "new" ? "new" : bank?.projectId;
  const [seededFor, setSeededFor] = useState<typeof key>(undefined);
  if (key !== seededFor) {
    setSeededFor(key);
    setConfirmDelete(false);
    setWeekly("");
    if (bank === "new") {
      setProjectId(null);
      setStart(dayKey(startOfWeek(new Date())));
      setOpening("0");
    } else if (bank) {
      setProjectId(bank.projectId);
      setStart(bank.start);
      setOpening(formatSignedMinutes(bank.openingMinutes));
    }
  }

  const openingMinutes = parseSignedMinutes(opening);
  const weeklyMinutes = weekly.trim() ? parseSignedMinutes(weekly) : null;
  const done = () => { qc.invalidateQueries({ queryKey: ["timebank"] }); onClose(); };
  const save = useMutation({
    mutationFn: async () => {
      await saveTimebank(projectId!, start, openingMinutes!);
      if (weeklyMinutes !== null)
        await saveTimebankTarget(projectId!, { weekStart: start, minutes: weeklyMinutes, onlyThisWeek: false, note: "" });
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => deleteTimebank(projectId!), onSuccess: done });

  if (bank === null) return null;
  const isNew = bank === "new";
  const available = projects.filter(p => !p.archived && !banks.some(b => b.projectId === p.id));
  const valid = projectId !== null && start !== "" && openingMinutes !== null && (weeklyMinutes === null || weeklyMinutes >= 0)
    && (weekly.trim() === "" || weeklyMinutes !== null);

  return (
    <Modal open onClose={onClose} title={isNew ? "Ny tidsbank" : `Tidsbank – ${bank.projectName}`}
      footer={<>
        {!isNew && (confirmDelete
          ? <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => remove.mutate()}>Bekräfta borttagning</button>
          : <button className="btn btn-danger-ghost" style={{ marginRight: "auto" }} onClick={() => setConfirmDelete(true)}>Ta bort</button>)}
        <button className="btn btn-ghost" onClick={onClose}>Avbryt</button>
        <button className="btn btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>Spara</button>
      </>}>
      {(save.error || remove.error) && <div className="alert alert-error">{(save.error ?? remove.error)!.message}</div>}
      {confirmDelete && <div className="alert alert-error">Saldo, schema och avvikelser tas bort. Tidsposterna blir kvar.</div>}
      {isNew && (
        <div className="field-group">
          <label className="field-label" htmlFor="bank-project">Projekt</label>
          <select id="bank-project" className="field" value={projectId ?? ""}
            onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Välj projekt</option>
            {available.map(p => <option key={p.id} value={p.id}>{p.name}{p.clientName ? ` – ${p.clientName}` : ""}</option>)}
          </select>
        </div>
      )}
      <div className="field-group">
        <label className="field-label" htmlFor="bank-start">Börja räkna från veckan som innehåller</label>
        <input id="bank-start" className="field" type="date" value={start} onChange={e => setStart(e.target.value)} />
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="bank-opening">Ingående saldo (t.ex. +9:39 eller -1:20)</label>
        <input id="bank-opening" className="field" value={opening} onChange={e => setOpening(e.target.value)} />
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="bank-weekly">
          {isNew ? "Timmar per vecka" : "Nytt veckomål från startveckan (lämna tomt för att behålla schemat)"}
        </label>
        <input id="bank-weekly" className="field" placeholder="t.ex. 12" value={weekly} onChange={e => setWeekly(e.target.value)} />
      </div>
    </Modal>
  );
}

const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
const tone = (minutes: number) => minutes > 0 ? "pos" : minutes < 0 ? "neg" : "";

function weekRange(monday: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${monday.toLocaleDateString("sv-SE", opts)} – ${addDays(monday, 6).toLocaleDateString("sv-SE", opts)}`;
}
