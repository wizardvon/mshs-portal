import {
  Archive,
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  FileCheck2,
  FileText,
  FilePenLine,
  GitBranch,
  GraduationCap,
  Eye,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Printer,
  Settings,
  Table2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { logout } from "../services/authService";
import { useAuth } from "../providers/AuthProvider";
import { canAccessModule, getRoleLabel } from "../utils/accessControl";
import { SidebarLink } from "./layout/SidebarLink";

function SidebarSectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45 first:pt-0">
      {children}
    </p>
  );
}

export function AppShell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);
  const canSee = (moduleId: Parameters<typeof canAccessModule>[1]) =>
    canAccessModule(profile, moduleId);
  const showAcademicGroup =
    canSee("enrollment") ||
    canSee("curriculum_mapping") ||
    canSee("load_assignment") ||
    canSee("scheduler") ||
    canSee("dll_submissions") ||
    canSee("document_requests") ||
    canSee("mps") ||
    canSee("grade_submissions") ||
    canSee("grade_summary");
  const showMonitoringGroup =
    canSee("observations") ||
    profile?.role === "super_admin" ||
    canSee("personnel_attendance") ||
    canSee("personnel_locator") ||
    canSee("my_personnel_attendance") ||
    canSee("teacher_loads");
  const showAdminGroup =
    canSee("reports") ||
    profile?.role === "super_admin" ||
    canSee("printable_certificates") ||
    canSee("settings") ||
    canSee("backup_restore");

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="min-h-screen bg-mist">
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
            "fixed inset-y-0 left-0 z-40 w-72 bg-gradient-to-b from-[#3a0000] via-wine to-[#160000] px-4 py-5 shadow-2xl shadow-red-950/35 transition-transform duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="mb-7 flex items-center gap-3 rounded-2xl bg-white/8 p-2 ring-1 ring-white/10">
            <div className="relative">
              <img
                alt="MSHS Portal"
                className="h-12 w-12 rounded-xl shadow-lg shadow-red-950/40"
                src="/mshs-portal-icon.png"
              />
              <img
                alt="Mataasnakahoy Senior High School"
                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-white object-contain p-0.5"
                src="/school-logo.png"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">MSHS Portal</p>
              <p className="text-xs font-medium text-white/65">One School. One Portal.</p>
            </div>
            <button
              aria-label="Hide sidebar"
              className="grid h-9 w-9 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
              onClick={closeSidebar}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
          <nav className="max-h-[calc(100vh-7.75rem)] space-y-1 overflow-y-auto pb-4 pr-1">
            <SidebarSectionLabel>Main</SidebarSectionLabel>
            {canSee("dashboard") && <SidebarLink icon={LayoutDashboard} label="Dashboard" onClick={closeSidebar} to="/dashboard" />}
            {canSee("personnel_settings") && <SidebarLink icon={Settings} label="Settings" onClick={closeSidebar} to="/personnel-settings" />}
            {canSee("loading") && <SidebarLink icon={Table2} label="SHS Loading" onClick={closeSidebar} to="/loading" />}
            {canSee("teachers") && <SidebarLink icon={GraduationCap} label="Teachers" onClick={closeSidebar} to="/teachers" />}
            {canSee("subjects") && <SidebarLink icon={BookOpen} label="Subjects" onClick={closeSidebar} to="/subjects" />}
            {canSee("sections") && <SidebarLink icon={ClipboardList} label="Sections" onClick={closeSidebar} to="/sections" />}
            {showAcademicGroup && <SidebarSectionLabel>Academic</SidebarSectionLabel>}
            {canSee("enrollment") && <SidebarLink icon={FileSpreadsheet} label="Enrollment" onClick={closeSidebar} to="/enrollment" />}
            {canSee("curriculum_mapping") && <SidebarLink icon={GitBranch} label="Curriculum Mapping" onClick={closeSidebar} to="/curriculum-mapping" />}
            {canSee("load_assignment") && <SidebarLink icon={Table2} label="Load Assignment" onClick={closeSidebar} to="/load-assignment" />}
            {canSee("scheduler") && <SidebarLink icon={CalendarDays} label="Scheduler" onClick={closeSidebar} to="/scheduler" />}
            {canSee("dll_submissions") && <SidebarLink icon={FileCheck2} label="DLL Submissions" onClick={closeSidebar} to="/dll-submissions" />}
            {canSee("document_requests") && <SidebarLink icon={FileText} label="Document Requests" onClick={closeSidebar} to="/document-requests" />}
            {canSee("mps") && <SidebarLink icon={BarChart3} label="MPS" onClick={closeSidebar} to="/mps" />}
            {canSee("grade_submissions") && <SidebarLink icon={FilePenLine} label="Grade Submission" onClick={closeSidebar} to="/grade-submissions" />}
            {canSee("grade_summary") && <SidebarLink icon={ClipboardList} label="Summary of Grades" onClick={closeSidebar} to="/grade-summary" />}
            {showMonitoringGroup && <SidebarSectionLabel>Monitoring</SidebarSectionLabel>}
            {canSee("observations") && <SidebarLink icon={Eye} label="Observation & Coaching" onClick={closeSidebar} to="/observations" />}
            {(profile?.role === "super_admin" || canSee("personnel_attendance")) && <SidebarLink icon={UserCheck} label="Personnel Attendance" onClick={closeSidebar} to="/personnel-attendance" />}
            {canSee("personnel_locator") && <SidebarLink icon={MapPin} label="Personnel Locator" onClick={closeSidebar} to="/personnel-locator" />}
            {canSee("my_personnel_attendance") && <SidebarLink icon={UserCheck} label="My Attendance" onClick={closeSidebar} to="/my-attendance" />}
            {canSee("teacher_loads") && <SidebarLink icon={Users} label="Teacher Loads" onClick={closeSidebar} to="/teacher-loads" />}
            {showAdminGroup && <SidebarSectionLabel>Admin</SidebarSectionLabel>}
            {profile?.role === "super_admin" && <SidebarLink icon={Award} label="Certificates" onClick={closeSidebar} to="/certificates" />}
            {canSee("printable_certificates") && <SidebarLink icon={Printer} label="Printable Certificates" onClick={closeSidebar} to="/printable-certificates" />}
            {canSee("reports") && <SidebarLink icon={BarChart3} label="Reports" onClick={closeSidebar} to="/reports" />}
            {profile?.role === "super_admin" && <SidebarLink icon={Users} label="Users" onClick={closeSidebar} to="/users" />}
            {canSee("settings") && <SidebarLink icon={Settings} label="Admin Setting" onClick={closeSidebar} to="/settings" />}
            {canSee("backup_restore") && <SidebarLink icon={Archive} label="Backup & Restore" onClick={closeSidebar} to="/backup-restore" />}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-5 shadow-sm backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Show sidebar"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-100 bg-white text-civic shadow-sm hover:bg-red-50"
                onClick={() => setSidebarOpen(true)}
                type="button"
              >
                <Menu size={18} />
              </button>
              <img
                alt="Mataasnakahoy Senior High School"
                className="hidden h-10 w-10 object-contain sm:block"
                src="/school-logo.png"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{profile?.fullName}</p>
                <p className="text-xs text-slate-500">MSHS Portal / {profile ? getRoleLabel(profile.role) : ""}</p>
              </div>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-100 bg-white px-3 text-sm font-semibold text-civic shadow-sm transition hover:bg-red-50"
              onClick={handleLogout}
              type="button"
            >
              <LogOut size={16} /> Logout
            </button>
          </header>
          <div className="flex-1 bg-mist px-5 py-6">
            <Outlet />
          </div>
        </section>
      </div>
    </main>
  );
}
