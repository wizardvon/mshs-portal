export type UserRole = "super_admin" | "admin" | "viewer";
export type UserStatus = "approved" | "pending" | "disabled";

export type UserProfile = {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: unknown;
};
