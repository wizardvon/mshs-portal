import { Check, Save, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../providers/AuthProvider";
import type { AppModule, UserProfile, UserRole, UserStatus } from "../types";
import { subscribeSections } from "../services/sectionService";
import { subscribeTeachers } from "../services/teacherService";
import type { Section, Teacher } from "../types/loading";
import {
  appModules,
  getDefaultModulePermissions,
  getRoleLabel,
  getUserModulePermissions,
  roleOptions,
} from "../utils/accessControl";

type UserRow = UserProfile & {
  id: string;
};

type UserDraft = {
  role: UserRole;
  modulePermissions: AppModule[];
  assignedTeacherId: string;
  advisingSectionId: string;
};

const statusClass: Record<UserStatus, string> = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  disabled: "bg-slate-100 text-slate-600 ring-slate-200",
};

function normalizeUserRole(role: string): UserRole {
  return roleOptions.some((option) => option.value === role) ? (role as UserRole) : "teacher";
}

export function UsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const isSuperAdmin = profile?.role === "super_admin";

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSections(setSections), []);

  useEffect(() => {
    const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));

    return onSnapshot(
      usersQuery,
      (snapshot) => {
        const nextUsers = snapshot.docs.map((userDoc) => ({
            id: userDoc.id,
            ...(userDoc.data() as UserProfile),
          }));
        setUsers(nextUsers);
        setDrafts(
          nextUsers.reduce(
            (nextDrafts, user) => ({
              ...nextDrafts,
              [user.id]: buildUserDraft(user),
            }),
            {} as Record<string, UserDraft>,
          ),
        );
        setError("");
        setLoading(false);
      },
      () => {
        setError(
          "Unable to load users. Make sure your Firestore rules allow approved admins to list users.",
        );
        setLoading(false);
      },
    );
  }, []);

  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === "pending"),
    [users],
  );

  const activeTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.status === "active").sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [teachers],
  );

  const activeSections = useMemo(
    () => sections.filter((section) => section.status === "active").sort((a, b) => a.sectionName.localeCompare(b.sectionName)),
    [sections],
  );

  function buildUserDraft(user: UserRow): UserDraft {
    const role = normalizeUserRole(user.role);

    return {
      role,
      modulePermissions: getUserModulePermissions({ ...user, role }),
      assignedTeacherId: user.assignedTeacherId ?? "",
      advisingSectionId: user.advisingSectionId ?? "",
    };
  }

  function getDraft(user: UserRow) {
    return drafts[user.id] ?? buildUserDraft(user);
  }

  function updateDraft(user: UserRow, updates: Partial<UserDraft>) {
    setDrafts((current) => ({
      ...current,
      [user.id]: {
        ...getDraft(user),
        ...updates,
      },
    }));
  }

  function getUserProfileUpdatePayload(user: UserRow, draft: UserDraft, nextStatus: UserStatus, nextRole: UserRole, nextModulePermissions: AppModule[]) {
    return {
      role: nextRole,
      status: nextStatus,
      modulePermissions: nextRole === "super_admin" ? getDefaultModulePermissions("super_admin") : nextModulePermissions,
      assignedTeacherId: draft.assignedTeacherId || deleteField(),
      advisingSectionId: draft.advisingSectionId || deleteField(),
      reviewedAt: serverTimestamp(),
      reviewedBy: profile?.userId || deleteField(),
    };
  }

  async function persistUserProfile(
    user: UserRow,
    nextStatus: UserStatus,
    nextRole = getDraft(user).role,
    nextModulePermissions = getDraft(user).modulePermissions,
  ) {
    if (!isSuperAdmin) {
      return;
    }

    setSavingUserId(user.id);
    setError("");

    const draft = getDraft(user);
    const effectiveModulePermissions =
      nextRole === "super_admin" || nextModulePermissions.length === 0
        ? getDefaultModulePermissions(nextRole)
        : nextModulePermissions;

    try {
      await updateDoc(doc(db, "users", user.id),
        getUserProfileUpdatePayload(user, draft, nextStatus, nextRole, effectiveModulePermissions),
      );
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? `Unable to update that user: ${caught.message}`
          : "Unable to update that user. Confirm your account is approved as Super Admin.",
      );
    } finally {
      setSavingUserId(null);
    }
  }

  async function updateUserAccess(
    user: UserRow,
    nextStatus: UserStatus,
    nextRole = getDraft(user).role,
    nextModulePermissions = getDraft(user).modulePermissions,
  ) {
    await persistUserProfile(user, nextStatus, nextRole, nextModulePermissions);
  }

  async function updateRole(user: UserRow, nextRole: UserRole) {
    updateDraft(user, {
      role: nextRole,
      modulePermissions: getDefaultModulePermissions(nextRole),
    });
  }

  function toggleModule(user: UserRow, moduleId: AppModule) {
    if (!isSuperAdmin || getDraft(user).role === "super_admin" || moduleId === "dashboard") return;

    const currentPermissions = getDraft(user).modulePermissions;
    const nextPermissions = currentPermissions.includes(moduleId)
      ? currentPermissions.filter((permission) => permission !== moduleId)
      : [...currentPermissions, moduleId];

    updateDraft(user, { modulePermissions: nextPermissions });
  }

  async function saveUserSettings(user: UserRow) {
    if (!isSuperAdmin) return;
    setSavingUserId(user.id);
    setError("");

    try {
      await persistUserProfile(user, user.status, getDraft(user).role, getDraft(user).modulePermissions);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? `Unable to save that user's role, module access, or assignments: ${caught.message}`
          : "Unable to save that user's role, module access, or assignments.",
      );
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold text-ink">User Approval</h1>
          <p className="mt-2 text-sm text-slate-600">
            Review pending accounts and assign school MIS access.
          </p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {pendingUsers.length} pending
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          Only Super Admin accounts can approve, disable, or change user roles.
        </div>
      )}

      {error && <p className="mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-5 text-sm text-slate-600">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No registered users yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Assignments</th>
                  <th className="px-4 py-3 font-semibold">Visible Modules</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">UID</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {users.map((user) => {
                  const isSaving = savingUserId === user.id;
                  const isSelf = profile?.userId === user.userId;
                  const draft = getDraft(user);

                  return (
                    <tr key={user.id} className={user.status === "pending" ? "bg-amber-50/35" : ""}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{user.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm capitalize outline-none focus:border-civic focus:ring-2 focus:ring-civic/15 disabled:opacity-60"
                          disabled={!isSuperAdmin || isSaving || isSelf}
                          onChange={(event) => updateRole(user, event.target.value as UserRole)}
                          value={draft.role}
                        >
                          {roleOptions.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="grid gap-2">
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">Teacher</span>
                            <select
                              className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-civic focus:ring-2 focus:ring-civic/15 disabled:opacity-60"
                              disabled={!isSuperAdmin || isSaving || isSelf}
                              onChange={(event) => updateDraft(user, { assignedTeacherId: event.target.value })}
                              value={draft.assignedTeacherId}
                            >
                              <option value="">No linked teacher</option>
                              {activeTeachers.map((teacher) => (
                                <option key={teacher.teacherId} value={teacher.teacherId}>
                                  {teacher.fullName}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">Advising Section</span>
                            <select
                              className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-civic focus:ring-2 focus:ring-civic/15 disabled:opacity-60"
                              disabled={!isSuperAdmin || isSaving || isSelf}
                              onChange={(event) => updateDraft(user, { advisingSectionId: event.target.value })}
                              value={draft.advisingSectionId}
                            >
                              <option value="">No advising section</option>
                              {activeSections.map((section) => (
                                <option key={section.sectionId} value={section.sectionId}>
                                  {section.sectionName} - Grade {section.gradeLevel}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {draft.role === "super_admin" ? (
                          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                            All modules
                          </span>
                        ) : (
                          <div className="grid max-w-xl gap-1 sm:grid-cols-2 xl:grid-cols-3">
                            {appModules
                              .filter((module) => module.id !== "users")
                              .map((module) => {
                                const checked = draft.modulePermissions.includes(module.id);

                                return (
                                  <label
                                    className={[
                                      "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
                                      checked
                                        ? "border-blue-200 bg-blue-50 text-blue-800"
                                        : "border-slate-200 bg-slate-50 text-slate-500",
                                    ].join(" ")}
                                    key={module.id}
                                  >
                                    <input
                                      checked={checked}
                                      className="h-3.5 w-3.5 rounded border-slate-300"
                                      disabled={!isSuperAdmin || isSaving || isSelf || module.id === "dashboard"}
                                      onChange={() => toggleModule(user, module.id)}
                                      type="checkbox"
                                    />
                                    <span>{module.label}</span>
                                  </label>
                                );
                              })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1",
                            statusClass[user.status],
                          ].join(" ")}
                        >
                          {user.status}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">{getRoleLabel(draft.role)}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {user.userId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isSuperAdmin || isSaving || isSelf}
                            onClick={() => void saveUserSettings(user)}
                            type="button"
                          >
                            <Save size={16} /> Save
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-civic/90 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isSuperAdmin || isSaving || isSelf || user.status === "approved"}
                            onClick={() => updateUserAccess(user, "approved")}
                            type="button"
                          >
                            <Check size={16} /> Approve
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isSuperAdmin || isSaving || isSelf || user.status === "disabled"}
                            onClick={() => updateUserAccess(user, "disabled")}
                            type="button"
                          >
                            <X size={16} /> Disable
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
