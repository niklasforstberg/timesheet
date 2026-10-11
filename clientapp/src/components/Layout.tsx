import { useCallback, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn, Clock, FolderKanban, LogOut, Settings } from "lucide-react";
import { getMe, logout } from "../api/auth";
import { useClickOutside } from "../lib/useClickOutside";

export default function Layout() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Clock size={16} strokeWidth={2.5} /></span>
          timesheet
        </div>
        <UserMenu />
      </header>
      <aside className="sidebar">
        <NavLink to="/" end><Clock size={18} /><span>Tidrapport</span></NavLink>
        <div className="sidebar-section">Analysera</div>
        <NavLink to="/reports"><ChartColumn size={18} /><span>Rapporter</span></NavLink>
        <div className="sidebar-section">Hantera</div>
        <NavLink to="/projects"><FolderKanban size={18} /><span>Projekt</span></NavLink>
        <NavLink to="/settings"><Settings size={18} /><span>Inställningar</span></NavLink>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function UserMenu() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, useCallback(() => setOpen(false), []));

  return (
    <div className="picker user-menu" ref={ref}>
      <button className="avatar" onClick={() => setOpen(o => !o)} aria-label="Konto">
        {(me?.email ?? "").slice(0, 2).toUpperCase()}
      </button>
      {open && (
        <div className="dropdown dropdown-right">
          <div className="dropdown-group">{me?.email}</div>
          <button className="dropdown-item" onClick={logout}><LogOut size={14} /> Logga ut</button>
        </div>
      )}
    </div>
  );
}
