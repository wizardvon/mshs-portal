import {
  Archive,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Table2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { logout } from "../services/authService";
import { useAuth } from "../providers/AuthProvider";
import { SidebarLink } from "./layout/SidebarLink";

export function AppShell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isViewer = profile?.role === "viewer";
  const isSuperAdmin = profile?.role === "super_admin";
  const canManage = profile?.role === "super_admin" || profile?.role === "admin";
  const closeSidebar = () => setSidebarOpen(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        {sidebarOpen && (
          <button
            aria-label="Close navigation backdrop"
            className="fixed inset-0 z-30 bg-slate-950/40"
            onClick={closeSidebar}
            type="button"
          />
        )}

        <aside
          className={[
            "fixed inset-y-0 left-0 z-40 w-72 bg-slate-950 px-4 py-5 shadow-2xl transition-transform duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-600 text-white">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">School MIS Portal</p>
              <p className="text-xs text-slate-400">SHS Loading Management</p>
            </div>
            <button
              aria-label="Hide sidebar"
              className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={closeSidebar}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
          <nav className="space-y-1">
            <SidebarLink icon={LayoutDashboard} label="Dashboard" onClick={closeSidebar} to="/dashboard" />
            <SidebarLink icon={Table2} label="SHS Loading" onClick={closeSidebar} to="/loading" />
            {!isViewer && (
              <>
                <SidebarLink icon={GraduationCap} label="Teachers" onClick={closeSidebar} to="/teachers" />
                <SidebarLink icon={BookOpen} label="Subjects" onClick={closeSidebar} to="/subjects" />
                <SidebarLink icon={ClipboardList} label="Sections" onClick={closeSidebar} to="/sections" />
                <SidebarLink icon={GitBranch} label="Curriculum Mapping" onClick={closeSidebar} to="/curriculum-mapping" />
                <SidebarLink icon={Table2} label="Load Assignment" onClick={closeSidebar} to="/load-assignment" />
                <SidebarLink icon={CalendarDays} label="Scheduler" onClick={closeSidebar} to="/scheduler" />
              </>
            )}
            <SidebarLink icon={Users} label="Teacher Loads" onClick={closeSidebar} to="/teacher-loads" />
            <SidebarLink icon={BarChart3} label="Reports" onClick={closeSidebar} to="/reports" />
            {isSuperAdmin && <SidebarLink icon={Users} label="Users" onClick={closeSidebar} to="/users" />}
            {canManage && <SidebarLink icon={Settings} label="Settings" onClick={closeSidebar} to="/settings" />}
            {canManage && <SidebarLink icon={Archive} label="Backup & Restore" onClick={closeSidebar} to="/backup-restore" />}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Show sidebar"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                onClick={() => setSidebarOpen(true)}
                type="button"
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{profile?.fullName}</p>
                <p className="text-xs capitalize text-slate-500">
                  {profile?.role.replace("_", " ")}
                </p>
              </div>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={handleLogout}
              type="button"
            >
              <LogOut size={16} /> Logout
            </button>
          </header>
          <div className="flex-1 px-5 py-6">
            <Outlet />
          </div>
        </section>
      </div>
    </main>
  );
}
