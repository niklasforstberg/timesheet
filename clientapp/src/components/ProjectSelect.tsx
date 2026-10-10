import type { Project } from "../api/data";

interface Props {
  projects: Project[];
  value: number | null;
  onChange: (id: number | null) => void;
  id?: string;
}

// Native select grouped by client. Archived projects are hidden unless already chosen.
export default function ProjectSelect({ projects, value, onChange, id }: Props) {
  const visible = projects.filter(p => !p.archived || p.id === value);
  const groups = new Map<string, Project[]>();
  for (const p of visible) {
    const key = p.clientName ?? "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "sv")));

  return (
    <select id={id} className="field" value={value ?? ""}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Inget projekt</option>
      {keys.map(k => k === ""
        ? groups.get(k)!.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
        : (
          <optgroup key={k} label={k}>
            {groups.get(k)!.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        ))}
    </select>
  );
}
