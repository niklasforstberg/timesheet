import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CirclePlus, Search } from "lucide-react";
import { getProjects, type Project } from "../api/data";
import { useClickOutside } from "../lib/useClickOutside";

interface Props {
  value: number | null;
  onChange: (project: Project | null) => void;
}

// Clockify-style project chooser: "+ Projekt" until one is set, then the
// coloured name and client. The dropdown searches project and client names.
export default function ProjectPicker({ value, onChange }: Props) {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: getProjects });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setSearch(""); }, []);
  useClickOutside(ref, open, close);

  const current = projects.find(p => p.id === value);
  const q = search.trim().toLowerCase();
  const visible = projects.filter(p =>
    (!p.archived || p.id === value)
    && (!q || p.name.toLowerCase().includes(q) || (p.clientName ?? "").toLowerCase().includes(q)));

  const groups = new Map<string, Project[]>();
  for (const p of visible) groups.set(p.clientName ?? "", [...(groups.get(p.clientName ?? "") ?? []), p]);
  const keys = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "sv")));

  function pick(p: Project | null) {
    onChange(p);
    close();
  }

  return (
    <div className="picker" ref={ref}>
      <button type="button" className="project-button" onClick={() => setOpen(o => !o)}>
        {current ? (
          <span className="project-label" style={{ color: current.color }}>
            <span className="dot" style={{ background: current.color }} />
            <span className="project-label-name">{current.name}</span>
            {current.clientName && <span className="project-client"> - {current.clientName}</span>}
          </span>
        ) : (
          <span className="project-add"><CirclePlus size={16} /> Projekt</span>
        )}
      </button>
      {open && (
        <div className="dropdown dropdown-project">
          <div className="dropdown-search">
            <Search size={14} />
            <input autoFocus placeholder="Sök projekt eller klient" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="dropdown-list">
            {!q && <button type="button" className="dropdown-item muted" onClick={() => pick(null)}>Inget projekt</button>}
            {keys.map(k => (
              <div key={k}>
                {k && <div className="dropdown-group">{k}</div>}
                {groups.get(k)!.map(p => (
                  <button type="button" key={p.id} className={`dropdown-item${p.id === value ? " selected" : ""}`} onClick={() => pick(p)}>
                    <span className="dot" style={{ background: p.color }} />
                    <span style={{ color: p.color }}>{p.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {visible.length === 0 && <div className="dropdown-empty">Inga projekt hittades</div>}
          </div>
        </div>
      )}
    </div>
  );
}
