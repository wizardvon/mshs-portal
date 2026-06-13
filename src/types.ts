export type UserRole =
  | "principal"
  | "master_teacher"
  | "teacher"
  | "registrar"
  | "administrative_officer"
  | "administrative_assistant"
  | "admin"
  | "super_admin";
export type UserStatus = "approved" | "pending" | "disabled";
export type AppModule =
  | "dashboard"
  | "loading"
  | "teachers"
  | "subjects"
  | "sections"
  | "curriculum_mapping"
  | "load_assignment"
  | "scheduler"
  | "teacher_loads"
  | "reports"
  | "settings"
  | "backup_restore"
  | "users";

export type UserProfile = {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  modulePermissions?: AppModule[];
  createdAt: unknown;
};
