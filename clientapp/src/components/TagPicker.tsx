import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Tag as TagIcon } from "lucide-react";
import { getTags } from "../api/data";
import { useClickOutside } from "../lib/useClickOutside";

interface Props {
  value: number[];
  onChange: (ids: number[]) => void;
}

// The tag icon, or the chosen tag names in blue; opens a searchable checklist.
export default function TagPicker({ value, onChange }: Props) {
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: getTags });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setSearch(""); }, []);
  useClickOutside(ref, open, close);

  const chosen = tags.filter(t => value.includes(t.id));
  const q = search.trim().toLowerCase();
  const visible = tags.filter(t => (!t.archived || value.includes(t.id)) && (!q || t.name.toLowerCase().includes(q)));

  return (
    <div className="picker" ref={ref}>
      <button type="button" className={`tag-button${chosen.length ? " active" : ""}`} title="Taggar" aria-label="Taggar"
        onClick={() => setOpen(o => !o)}>
        {chosen.length ? <span className="tag-names">{chosen.map(t => t.name).join(", ")}</span> : <TagIcon size={18} />}
      </button>
      {open && (
        <div className="dropdown dropdown-tags">
          <div className="dropdown-search">
            <Search size={14} />
            <input autoFocus placeholder="Sök taggar" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="dropdown-list">
            {visible.map(t => (
              <label key={t.id} className="dropdown-item">
                <input type="checkbox" checked={value.includes(t.id)}
                  onChange={e => onChange(e.target.checked ? [...value, t.id] : value.filter(id => id !== t.id))} />
                {t.name}
              </label>
            ))}
            {visible.length === 0 && <div className="dropdown-empty">{tags.length ? "Inga taggar hittades" : "Inga taggar än. Skapa dem under Projekt."}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
