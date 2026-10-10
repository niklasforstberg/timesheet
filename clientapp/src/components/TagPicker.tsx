import { useEffect, useRef, useState } from "react";
import { Tag as TagIcon } from "lucide-react";
import type { Tag } from "../api/data";

interface Props {
  tags: Tag[];
  value: number[];
  onChange: (ids: number[]) => void;
}

// A button that opens a checklist of tags. Shows the chosen names when closed.
export default function TagPicker({ tags, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const chosen = tags.filter(t => value.includes(t.id));
  const visible = tags.filter(t => !t.archived || value.includes(t.id));

  return (
    <div className="tag-picker" ref={ref}>
      <button type="button" className={`btn btn-ghost tag-picker-button${chosen.length ? " active" : ""}`}
        onClick={() => setOpen(o => !o)} title="Taggar" aria-label="Taggar">
        <TagIcon size={16} />
        {chosen.length > 0 && <span className="tag-picker-names">{chosen.map(t => t.name).join(", ")}</span>}
      </button>
      {open && (
        <div className="popover">
          {visible.length === 0 && <div className="muted small">Inga taggar än. Skapa dem under Projekt.</div>}
          {visible.map(t => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={value.includes(t.id)}
                onChange={e => onChange(e.target.checked ? [...value, t.id] : value.filter(id => id !== t.id))} />
              {t.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
