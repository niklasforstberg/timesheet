import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, updateMe } from "../api/auth";
import { download } from "../api/client";
import {
  createApiToken, getApiTokens, getClockifyWorkspaces, getProjects, importClockify, revokeApiToken,
  type ImportResult, type Workspace,
} from "../api/data";
import { addDays, dayKey } from "../lib/time";
import Modal from "../components/Modal";
import ProjectSelect from "../components/ProjectSelect";

export default function Settings() {
  return (
    <>
      <div className="page-header"><h1>Inställningar</h1></div>
      <DefaultProjectSection />
      <TimeZoneSection />
      <ExportSection />
      <ClockifySection />
      <ApiTokenSection />
    </>
  );
}

function DefaultProjectSection() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  const [projectId, setProjectId] = useState<number | null | undefined>(undefined);
  const value = projectId === undefined ? me?.defaultProjectId ?? null : projectId;

  const save = useMutation({
    mutationFn: () => updateMe({ timeZone: me!.timeZone, defaultProjectId: value }),
    onSuccess: () => { setProjectId(undefined); qc.invalidateQueries({ queryKey: ["me"] }); },
  });

  return (
    <section className="card section">
      <h2>Standardprojekt</h2>
      <p className="muted small">Väljs automatiskt för nya tidsposter — i timern och när du lägger till tid manuellt. Du kan alltid byta för en enskild post.</p>
      <div className="inline-add">
        <ProjectSelect projects={projects} value={value} onChange={setProjectId} />
        <button className="btn" disabled={!me || projectId === undefined || save.isPending} onClick={() => save.mutate()}>Spara</button>
      </div>
      {save.error && <div className="alert alert-error">{save.error.message}</div>}
    </section>
  );
}

function TimeZoneSection() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [zone, setZone] = useState<string | null>(null);
  const zones = Intl.supportedValuesOf("timeZone");
  const value = zone ?? me?.timeZone ?? "";

  const save = useMutation({
    mutationFn: () => updateMe({ timeZone: value, defaultProjectId: me!.defaultProjectId }),
    onSuccess: () => { setZone(null); qc.invalidateQueries({ queryKey: ["me"] }); },
  });

  return (
    <section className="card section">
      <h2>Tidszon</h2>
      <p className="muted small">Bestämmer vilken dag en tidspost hör till i export och för AI-agenter. Webbläsaren visar alltid tider i sin egen zon.</p>
      <div className="inline-add">
        <select className="field" value={value} onChange={e => setZone(e.target.value)}>
          {!zones.includes(value) && value && <option value={value}>{value}</option>}
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <button className="btn" disabled={zone === null || save.isPending} onClick={() => save.mutate()}>Spara</button>
      </div>
      {save.error && <div className="alert alert-error">{save.error.message}</div>}
    </section>
  );
}

function ExportSection() {
  const today = new Date();
  const [from, setFrom] = useState(dayKey(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(dayKey(today));
  const exportCsv = useMutation({
    mutationFn: () => {
      const start = new Date(`${from}T00:00`);
      const end = addDays(new Date(`${to}T00:00`), 1);
      return download(`/api/time-entries/export.csv?from=${start.toISOString()}&to=${end.toISOString()}`,
        `timesheet_${from}_${to}.csv`);
    },
  });

  return (
    <section className="card section">
      <h2>Exportera</h2>
      <p className="muted small">All din tid som CSV — öppnas direkt i Excel eller Numbers.</p>
      <div className="inline-add">
        <input className="field" type="date" aria-label="Från" value={from} onChange={e => setFrom(e.target.value)} />
        <span className="muted">–</span>
        <input className="field" type="date" aria-label="Till" value={to} onChange={e => setTo(e.target.value)} />
        <button className="btn" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>Ladda ner CSV</button>
      </div>
      {exportCsv.error && <div className="alert alert-error">{exportCsv.error.message}</div>}
    </section>
  );
}

function ClockifySection() {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const lookup = useMutation({
    mutationFn: () => getClockifyWorkspaces(apiKey),
    onSuccess: ws => { setWorkspaces(ws); setWorkspaceId(ws[0]?.id ?? ""); },
  });
  const run = useMutation({
    mutationFn: () => importClockify(apiKey, workspaceId),
    onSuccess: r => { setResult(r); qc.invalidateQueries(); },
  });

  return (
    <section className="card section">
      <h2>Importera från Clockify</h2>
      <p className="muted small">
        Skapa en API-nyckel i Clockify under <em>Profile settings → Advanced → API keys</em>. Nyckeln används bara
        för den här importen och sparas inte. Importen går att köra igen — redan importerade poster uppdateras i stället
        för att dupliceras.
      </p>
      <form className="inline-add" onSubmit={e => { e.preventDefault(); lookup.mutate(); }}>
        <input className="field" type="password" placeholder="Clockify API-nyckel" autoComplete="off"
          value={apiKey} onChange={e => { setApiKey(e.target.value); setWorkspaces(null); setResult(null); }} />
        <button className="btn" disabled={!apiKey.trim() || lookup.isPending}>Hämta workspaces</button>
      </form>
      {lookup.error && <div className="alert alert-error">{lookup.error.message}</div>}

      {workspaces && (
        <div className="inline-add">
          <select className="field" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} aria-label="Workspace">
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!workspaceId || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Importerar…" : "Importera"}
          </button>
        </div>
      )}
      {run.error && <div className="alert alert-error">{run.error.message}</div>}
      {result && (
        <div className="alert alert-success">
          Klart: {result.entriesCreated} nya och {result.entriesUpdated} uppdaterade tidsposter,
          {" "}{result.projects} projekt, {result.clients} klienter, {result.tags} taggar.
          {result.skippedRunning > 0 && " En timer som fortfarande går i Clockify hoppades över."}
        </div>
      )}
    </section>
  );
}

function ApiTokenSection() {
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery({ queryKey: ["apiTokens"], queryFn: getApiTokens });
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mcpUrl = `${window.location.origin}/mcp`;

  const create = useMutation({
    mutationFn: () => createApiToken(name.trim()),
    onSuccess: t => { setCreated(t.token); setName(""); qc.invalidateQueries({ queryKey: ["apiTokens"] }); },
  });
  const revoke = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apiTokens"] }),
  });

  return (
    <section className="card section">
      <h2>AI-åtkomst (MCP)</h2>
      <p className="muted small">
        En token låter en AI-agent läsa din tid via MCP-servern på <code>{mcpUrl}</code>. Den kan bara läsa, inte ändra.
      </p>
      <form className="inline-add" onSubmit={e => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
        <input className="field" placeholder="Namn, t.ex. Claude Code" maxLength={100}
          value={name} onChange={e => setName(e.target.value)} />
        <button className="btn" disabled={!name.trim() || create.isPending}>Skapa token</button>
      </form>
      {create.error && <div className="alert alert-error">{create.error.message}</div>}

      {tokens.length > 0 && (
        <div className="list">
          {tokens.map(t => (
            <div key={t.id} className="list-row">
              <span className="list-name">{t.name}</span>
              <code className="muted small">{t.prefix}…</code>
              <span className="muted small">
                {t.lastUsedAt ? `Använd ${new Date(t.lastUsedAt).toLocaleDateString("sv-SE")}` : "Aldrig använd"}
              </span>
              <button className="btn btn-danger-ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(t.id)}>Återkalla</button>
            </div>
          ))}
        </div>
      )}

      <Modal open={created !== null} onClose={() => { setCreated(null); setCopied(false); }} title="Token skapad"
        footer={<button className="btn btn-primary" onClick={() => { setCreated(null); setCopied(false); }}>Klar</button>}>
        <p className="small">Kopiera den nu — den visas inte igen.</p>
        <pre className="code-block">{created}</pre>
        <button className="btn" onClick={() => { navigator.clipboard.writeText(created!); setCopied(true); }}>
          {copied ? "Kopierad" : "Kopiera"}
        </button>
        <p className="small" style={{ marginTop: 16 }}>Lägg till i Claude Code:</p>
        <pre className="code-block">{`claude mcp add --transport http timesheet ${mcpUrl} \\\n  --header "Authorization: Bearer ${created}"`}</pre>
      </Modal>
    </section>
  );
}
