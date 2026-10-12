import { apiFetch } from "./client";

export interface Client { id: number; name: string; archived: boolean }
export interface Tag { id: number; name: string; archived: boolean }
export interface Project {
  id: number;
  name: string;
  color: string;
  billable: boolean;
  archived: boolean;
  clientId: number | null;
  clientName: string | null;
}

export interface TimeEntry {
  id: number;
  description: string;
  start: string;
  end: string | null;
  billable: boolean;
  projectId: number | null;
  projectName: string | null;
  projectColor: string | null;
  clientName: string | null;
  tags: { id: number; name: string }[];
}

export interface EntryInput {
  description: string;
  projectId: number | null;
  tagIds: number[];
  billable: boolean;
  start: string;
  end: string | null;
}

const json = (method: string, body?: unknown): RequestInit =>
  ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const getClients = () => apiFetch<Client[]>("/api/clients");
export const saveClient = (c: Omit<Client, "id"> & { id?: number }) =>
  c.id ? apiFetch<Client>(`/api/clients/${c.id}`, json("PUT", c)) : apiFetch<Client>("/api/clients", json("POST", c));
export const deleteClient = (id: number) => apiFetch<void>(`/api/clients/${id}`, json("DELETE"));

export const getTags = () => apiFetch<Tag[]>("/api/tags");
export const saveTag = (t: Omit<Tag, "id"> & { id?: number }) =>
  t.id ? apiFetch<Tag>(`/api/tags/${t.id}`, json("PUT", t)) : apiFetch<Tag>("/api/tags", json("POST", t));
export const deleteTag = (id: number) => apiFetch<void>(`/api/tags/${id}`, json("DELETE"));

export type ProjectInput = Omit<Project, "id" | "clientName"> & { id?: number };
export const getProjects = () => apiFetch<Project[]>("/api/projects");
export const saveProject = (p: ProjectInput) =>
  p.id ? apiFetch<Project>(`/api/projects/${p.id}`, json("PUT", p)) : apiFetch<Project>("/api/projects", json("POST", p));
export const deleteProject = (id: number) => apiFetch<void>(`/api/projects/${id}`, json("DELETE"));

export const getEntries = (from: Date, to: Date) =>
  apiFetch<TimeEntry[]>(`/api/time-entries?from=${from.toISOString()}&to=${to.toISOString()}`);
export const createEntry = (e: EntryInput) => apiFetch<TimeEntry>("/api/time-entries", json("POST", e));
export const updateEntry = (id: number, e: EntryInput) => apiFetch<TimeEntry>(`/api/time-entries/${id}`, json("PUT", e));
export const deleteEntry = (id: number) => apiFetch<void>(`/api/time-entries/${id}`, json("DELETE"));

export const getRunning = () => apiFetch<{ entry: TimeEntry | null }>("/api/timer").then(r => r.entry);
export const startTimer = (e: Omit<EntryInput, "start" | "end">) =>
  apiFetch<TimeEntry>("/api/timer/start", json("POST", { ...e, start: new Date().toISOString(), end: null }));
export const stopTimer = () => apiFetch<TimeEntry>("/api/timer/stop", json("POST"));

export interface ApiToken { id: number; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }
export const getApiTokens = () => apiFetch<ApiToken[]>("/api/api-tokens");
export const createApiToken = (name: string) =>
  apiFetch<ApiToken & { token: string }>("/api/api-tokens", json("POST", { name }));
export const revokeApiToken = (id: number) => apiFetch<void>(`/api/api-tokens/${id}`, json("DELETE"));

export interface Workspace { id: string; name: string }
export interface ImportResult {
  clients: number; projects: number; tags: number;
  entriesCreated: number; entriesUpdated: number; skippedRunning: number;
}
export const getClockifyWorkspaces = (apiKey: string) =>
  apiFetch<Workspace[]>("/api/import/clockify/workspaces", json("POST", { apiKey }));
export const importClockify = (apiKey: string, workspaceId: string) =>
  apiFetch<ImportResult>("/api/import/clockify", json("POST", { apiKey, workspaceId }));

export const getSuggestions = (search: string) =>
  apiFetch<TimeEntry[]>(`/api/time-entries/suggestions?search=${encodeURIComponent(search)}`);
