import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, FolderKanban, Settings, LogOut } from "lucide-react";
import { getMe, logout } from "../api/auth";

export default function Layout() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">timesheet</div>
        <nav className="nav">
          <NavLink to="/" end><Clock size={16} /><span>Tid</span></NavLink>
          <NavLink to="/projects"><FolderKanban size={16} /><span>Projekt</span></NavLink>
          <NavLink to="/settings"><Settings size={16} /><span>Inställningar</span></NavLink>
        </nav>
        <div className="topbar-user">
          <span className="muted hide-narrow">{me?.email}</span>
          <button className="btn btn-ghost btn-icon" onClick={logout} title="Logga ut" aria-label="Logga ut">
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
