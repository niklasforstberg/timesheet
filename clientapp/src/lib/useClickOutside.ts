import { useEffect, type RefObject } from "react";

/** Calls onOutside on a mousedown outside ref or on Escape, while active. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onOutside(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOutside(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active, onOutside]);
}
