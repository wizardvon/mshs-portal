import type { AppModule, UserProfile, UserRole } from "../types";

export const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "principal", label: "Principal" },
  { value: "master_teacher", label: "Master Teacher" },
  { value: "teacher", label: "Teacher" },
  { value: "registrar", label: "Registrar" },
  { value: "administrative_officer", label: "Administrative Officer" },
  { value: "administrative_assistant", label: "Administrative Assistant" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export const registrationRoleOptions = roleOptions.filter((role) => role.value !== "super_admin");

export const appModules: Array<{ id: AppModule; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "announcements", label: "Announcements" },
  { id: "loading", label: "SHS Loading" },
  { id: "teachers", label: "Teachers" },
  { id: "subjects", label: "Subjects" },
  { id: "sections", label: "Sections" },
  { id: "enrollment", label: "Enrollment" },
  { id: "curriculum_mapping", label: "Curriculum Mapping" },
  { id: "load_assignment", label: "Load Assignment" },
  { id: "scheduler", label: "Scheduler" },
  { id: "dll_submissions", label: "DLL Submissions" },
  { id: "document_requests", label: "Document Requests" },
  { id: "tosia_pro", label: "TOSIA Pro" },
  { id: "mps", label: "MPS" },
  { id: "grade_computation", label: "Computation of Grades" },
  { id: "grade_summary", label: "Summary of Grades" },
  { id: "observations", label: "Observation & Coaching" },
  { id: "personnel_attendance", label: "Personnel Attendance" },
  { id: "personnel_locator", label: "Personnel Locator" },
  { id: "my_personnel_attendance", label: "My Attendance" },
  { id: "teacher_loads", label: "Teacher Loads" },
  { id: "certificates", label: "Certificates" },
  { id: "printable_certificates", label: "Printable Certificates" },
  { id: "reports", label: "Reports" },
  { id: "personnel_settings", label: "Settings" },
  { id: "settings", label: "Admin Setting" },
  { id: "backup_restore", label: "Backup & Restore" },
  { id: "users", label: "Users" },
];

export const allAppModuleIds: AppModule[] = appModules.map((module) => module.id);

const appModuleIdSet = new Set<string>(allAppModuleIds);
const legacyModuleAliases: Record<string, AppModule> = {
  tos: "tosia_pro",
};

export function normalizeModulePermissions(permissions: readonly string[] = []): AppModule[] {
  return Array.from(
    new Set(
      permissions
        .map((permission) => legacyModuleAliases[permission] ?? permission)
        .filter((permission): permission is AppModule => appModuleIdSet.has(permission)),
    ),
  );
}

export const defaultModulePermissionsByRole: Record<UserRole, AppModule[]> = {
  super_admin: allAppModuleIds,
  admin: [
    "dashboard",
    "announcements",
    "loading",
    "teachers",
    "subjects",
    "sections",
    "enrollment",
    "curriculum_mapping",
    "load_assignment",
    "scheduler",
    "dll_submissions",
    "document_requests",
    "tosia_pro",
    "mps",
    "grade_computation",
    "grade_summary",
    "observations",
    "personnel_attendance",
    "personnel_locator",
    "teacher_loads",
    "certificates",
    "printable_certificates",
    "reports",
    "personnel_settings",
    "settings",
    "backup_restore",
  ],
  principal: ["dashboard", "announcements", "loading", "scheduler", "dll_submissions", "document_requests", "tosia_pro", "mps", "grade_summary", "observations", "personnel_locator", "my_personnel_attendance", "teacher_loads", "printable_certificates", "reports", "personnel_settings"],
  master_teacher: ["dashboard", "announcements", "loading", "teachers", "subjects", "sections", "dll_submissions", "document_requests", "tosia_pro", "mps", "grade_computation", "grade_summary", "observations", "personnel_locator", "my_personnel_attendance", "teacher_loads", "printable_certificates", "reports", "personnel_settings"],
  teacher: ["dashboard", "announcements", "loading", "dll_submissions", "document_requests", "tosia_pro", "mps", "grade_computation", "grade_summary", "observations", "personnel_locator", "my_personnel_attendance", "teacher_loads", "printable_certificates", "reports", "personnel_settings"],
  registrar: ["dashboard", "announcements", "sections", "enrollment", "personnel_locator", "printable_certificates", "reports", "personnel_settings"],
  administrative_officer: ["dashboard", "announcements", "teachers", "document_requests", "personnel_attendance", "personnel_locator", "my_personnel_attendance", "teacher_loads", "printable_certificates", "reports", "backup_restore", "personnel_settings"],
  administrative_assistant: ["dashboard", "announcements", "document_requests", "personnel_attendance", "personnel_locator", "my_personnel_attendance", "printable_certificates", "reports", "personnel_settings"],
};

export function getRoleLabel(role: UserRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

export function getDefaultModulePermissions(role: UserRole) {
  return defaultModulePermissionsByRole[role] ?? ["dashboard"];
}

export function getRequiredModulePermissions(role: UserRole): AppModule[] {
  const basePermissions: AppModule[] = ["dashboard", "announcements", "personnel_locator", "personnel_settings"];
  const teacherPermissions: AppModule[] =
    role === "teacher" || role === "master_teacher" ? ["tosia_pro", "grade_computation"] : [];

  return Array.from(new Set([...basePermissions, ...teacherPermissions]));
}

export function getUserModulePermissions(
  profile?: Pick<UserProfile, "role" | "modulePermissions"> | null,
): AppModule[] {
  if (!profile) return [];
  if (profile.role === "super_admin") return allAppModuleIds;
  const normalizedPermissions = normalizeModulePermissions(profile.modulePermissions ?? []);
  const permissions = normalizedPermissions.length
    ? normalizedPermissions
    : getDefaultModulePermissions(profile.role);
  const mergedPermissions = Array.from(new Set([...getRequiredModulePermissions(profile.role), ...permissions]));

  return mergedPermissions;
}

export function canAccessModule(
  profile: Pick<UserProfile, "role" | "modulePermissions"> | null | undefined,
  moduleId: AppModule,
) {
  return getUserModulePermissions(profile).includes(moduleId);
}
