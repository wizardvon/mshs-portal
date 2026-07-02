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
  { id: "loading", label: "SHS Loading" },
  { id: "teachers", label: "Teachers" },
  { id: "subjects", label: "Subjects" },
  { id: "sections", label: "Sections" },
  { id: "curriculum_mapping", label: "Curriculum Mapping" },
  { id: "load_assignment", label: "Load Assignment" },
  { id: "scheduler", label: "Scheduler" },
  { id: "dll_submissions", label: "DLL Submissions" },
  { id: "teacher_loads", label: "Teacher Loads" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
  { id: "backup_restore", label: "Backup & Restore" },
  { id: "users", label: "Users" },
];

export const allAppModuleIds: AppModule[] = appModules.map((module) => module.id);

export const defaultModulePermissionsByRole: Record<UserRole, AppModule[]> = {
  super_admin: allAppModuleIds,
  admin: [
    "dashboard",
    "loading",
    "teachers",
    "subjects",
    "sections",
    "curriculum_mapping",
    "load_assignment",
    "scheduler",
    "dll_submissions",
    "teacher_loads",
    "reports",
    "settings",
    "backup_restore",
  ],
  principal: ["dashboard", "loading", "scheduler", "dll_submissions", "teacher_loads", "reports"],
  master_teacher: ["dashboard", "loading", "teachers", "subjects", "sections", "dll_submissions", "teacher_loads", "reports"],
  teacher: ["dashboard", "loading", "dll_submissions", "teacher_loads", "reports"],
  registrar: ["dashboard", "sections", "reports"],
  administrative_officer: ["dashboard", "teachers", "teacher_loads", "reports", "backup_restore"],
  administrative_assistant: ["dashboard", "reports"],
};

export function getRoleLabel(role: UserRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

export function getDefaultModulePermissions(role: UserRole) {
  return defaultModulePermissionsByRole[role] ?? ["dashboard"];
}

export function getUserModulePermissions(
  profile?: Pick<UserProfile, "role" | "modulePermissions"> | null,
): AppModule[] {
  if (!profile) return [];
  if (profile.role === "super_admin") return allAppModuleIds;
  const permissions = profile.modulePermissions?.length
    ? profile.modulePermissions
    : getDefaultModulePermissions(profile.role);

  return permissions.includes("dashboard") ? permissions : (["dashboard", ...permissions] as AppModule[]);
}

export function canAccessModule(
  profile: Pick<UserProfile, "role" | "modulePermissions"> | null | undefined,
  moduleId: AppModule,
) {
  return getUserModulePermissions(profile).includes(moduleId);
}
