import { Check, Printer, Save, ShieldAlert, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  deleteDoc,
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
  getRequiredModulePermissions,
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

const deleteUserPassword = "dxuxihnfwcls";
const userSaveTimeoutMs = 15000;

function getUserSaveErrorMessage(caught: unknown, fallback: string) {
  const message = caught instanceof Error ? caught.message : "";
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("resource-exhausted")
    || lowerMessage.includes("quota")
    || lowerMessage.includes("timed out")
  ) {
    return "Firestore quota is currently exhausted, so user settings cannot be saved yet. Wait for the quota to reset or upgrade/increase the Firebase quota, then try again.";
  }

  return caught instanceof Error ? `${fallback}: ${caught.message}` : fallback;
}

function normalizeUserRole(role: string): UserRole {
  return roleOptions.some((option) => option.value === role) ? (role as UserRole) : "teacher";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function UsersPage() {
  const { profile, user: authenticatedUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [dirtyDraftUserIds, setDirtyDraftUserIds] = useState<Set<string>>(new Set());
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
        setDrafts((currentDrafts) =>
          nextUsers.reduce(
            (nextDrafts, user) => ({
              ...nextDrafts,
              [user.id]:
                dirtyDraftUserIds.has(user.id) && currentDrafts[user.id]
                  ? currentDrafts[user.id]
                  : buildUserDraft(user),
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
  }, [dirtyDraftUserIds]);

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

  const teachersById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])),
    [teachers],
  );

  const sectionsById = useMemo(
    () => new Map(sections.map((section) => [section.sectionId, section])),
    [sections],
  );

  const unregisteredTeachers = useMemo(() => {
    const assignedTeacherIds = new Set(users.map((user) => user.assignedTeacherId).filter(Boolean));
    return activeTeachers.filter((teacher) => !assignedTeacherIds.has(teacher.teacherId));
  }, [activeTeachers, users]);

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
    setDirtyDraftUserIds((current) => new Set(current).add(user.id));
    setDrafts((current) => ({
      ...current,
      [user.id]: {
        ...getDraft(user),
        ...updates,
      },
    }));
  }

  function areSamePermissions(first: AppModule[] = [], second: AppModule[] = []) {
    if (first.length !== second.length) return false;
    const secondPermissions = new Set(second);
    return first.every((permission) => secondPermissions.has(permission));
  }

  async function updateUserDocWithTimeout(userId: string, payload: Record<string, unknown>) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        updateDoc(doc(db, "users", userId), payload),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("The save request timed out. Firestore may be backing off because quota is exhausted.")),
            userSaveTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  function getUserProfileUpdatePayload(
    user: UserRow,
    draft: UserDraft,
    nextStatus: UserStatus,
    nextRole: UserRole,
    nextModulePermissions: AppModule[],
    includeReviewFields = false,
    forceAccessFields = false,
  ) {
    const payload: Record<string, unknown> = {};
    const normalizedPermissions = nextRole === "super_admin" ? getDefaultModulePermissions("super_admin") : nextModulePermissions;

    if (user.userId !== user.id) {
      payload.userId = user.id;
    }
    if (forceAccessFields || user.role !== nextRole) {
      payload.role = nextRole;
    }
    if (forceAccessFields || user.status !== nextStatus) {
      payload.status = nextStatus;
    }
    if (forceAccessFields || !areSamePermissions(user.modulePermissions ?? [], normalizedPermissions)) {
      payload.modulePermissions = normalizedPermissions;
    }
    if ((user.assignedTeacherId ?? "") !== draft.assignedTeacherId) {
      payload.assignedTeacherId = draft.assignedTeacherId || deleteField();
    }
    if ((user.advisingSectionId ?? "") !== draft.advisingSectionId) {
      payload.advisingSectionId = draft.advisingSectionId || deleteField();
    }
    if (includeReviewFields) {
      payload.reviewedAt = serverTimestamp();
      payload.reviewedBy = authenticatedUser?.uid || deleteField();
    }

    return payload;
  }

  async function persistUserProfile(
    user: UserRow,
    nextStatus: UserStatus,
    nextRole = getDraft(user).role,
    nextModulePermissions = getDraft(user).modulePermissions,
    includeReviewFields = false,
  ) {
    if (!isSuperAdmin) {
      return;
    }

    setSavingUserId(user.id);
    setError("");
    setSaveMessage("");

    const draft = getDraft(user);
    const effectiveModulePermissions =
      nextRole === "super_admin" || nextModulePermissions.length === 0
        ? getDefaultModulePermissions(nextRole)
        : nextModulePermissions;

    try {
      const payload = getUserProfileUpdatePayload(
        user,
        draft,
        nextStatus,
        nextRole,
        effectiveModulePermissions,
        includeReviewFields,
        true,
      );
      if (Object.keys(payload).length > 0) {
        await updateUserDocWithTimeout(user.id, payload);
      }
      setDirtyDraftUserIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
      setSaveMessage(`${user.fullName}'s user settings were saved.`);
    } catch (caught) {
      console.error(caught);
      setError(getUserSaveErrorMessage(caught, "Unable to update that user"));
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
    await persistUserProfile(user, nextStatus, nextRole, nextModulePermissions, true);
  }

  async function updateRole(user: UserRow, nextRole: UserRole) {
    updateDraft(user, {
      role: nextRole,
      modulePermissions: getDefaultModulePermissions(nextRole),
    });
  }

  function toggleModule(user: UserRow, moduleId: AppModule) {
    if (!isSuperAdmin || getDraft(user).role === "super_admin" || moduleId === "dashboard") return;
    if (getRequiredModulePermissions(getDraft(user).role).includes(moduleId)) return;

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

  async function saveAllUserSettings() {
    if (!isSuperAdmin) return;
    setIsSavingAll(true);
    setError("");
    setSaveMessage("");

    try {
      await Promise.all(
        users
          .filter((user) => authenticatedUser?.uid !== user.id)
          .map((user) => {
            const draft = getDraft(user);
            const nextRole = draft.role;
            const effectiveModulePermissions =
              nextRole === "super_admin" || draft.modulePermissions.length === 0
                ? getDefaultModulePermissions(nextRole)
                : draft.modulePermissions;
            const payload = getUserProfileUpdatePayload(
              user,
              draft,
              user.status,
              nextRole,
              effectiveModulePermissions,
              false,
              false,
            );

            return Object.keys(payload).length > 0
              ? updateUserDocWithTimeout(user.id, payload)
              : Promise.resolve();
          }),
      );
      setDirtyDraftUserIds(new Set());
      setSaveMessage("All user settings were saved.");
    } catch (caught) {
      console.error(caught);
      setError(getUserSaveErrorMessage(caught, "Unable to save all user settings"));
    } finally {
      setIsSavingAll(false);
    }
  }

  async function deleteUserProfile(user: UserRow) {
    if (!isSuperAdmin || authenticatedUser?.uid === user.id) return;

    const password = window.prompt(`Enter the Super Admin delete password to delete ${user.fullName}'s portal user profile.`);
    if (password === null) return;

    if (password !== deleteUserPassword) {
      setError("Incorrect password. User profile was not deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.fullName}'s portal user profile? This removes their app access record, but does not delete their Firebase Authentication account.`,
    );
    if (!confirmed) return;

    setSavingUserId(user.id);
    setError("");
    setSaveMessage("");

    try {
      await deleteDoc(doc(db, "users", user.id));
      setSaveMessage(`${user.fullName}'s user profile was deleted.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? `Unable to delete that user profile: ${caught.message}` : "Unable to delete that user profile.");
    } finally {
      setSavingUserId(null);
    }
  }

  function getTeacherAssignmentLabel(teacherId?: string) {
    if (!teacherId) return "No linked teacher";
    const teacher = teachersById.get(teacherId);
    return teacher ? `${teacher.fullName} (${teacher.position || "Teacher"})` : teacherId;
  }

  function getSectionAssignmentLabel(sectionId?: string) {
    if (!sectionId) return "No advising section";
    const section = sectionsById.get(sectionId);
    return section ? `${section.sectionName} - Grade ${section.gradeLevel}` : sectionId;
  }

  function printUsersReport() {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) return;

    const userRows = users
      .map((user) => {
        const draft = getDraft(user);
        return `
          <tr>
            <td>
              <strong>${escapeHtml(user.fullName)}</strong>
              <div class="muted">${escapeHtml(user.email)}</div>
            </td>
            <td>${escapeHtml(getRoleLabel(draft.role))}</td>
            <td>${escapeHtml(user.status)}</td>
            <td>${escapeHtml(getTeacherAssignmentLabel(draft.assignedTeacherId))}</td>
            <td>${escapeHtml(getSectionAssignmentLabel(draft.advisingSectionId))}</td>
          </tr>
        `;
      })
      .join("");

    const unregisteredRows = unregisteredTeachers.length
      ? unregisteredTeachers
          .map((teacher) => `
            <tr>
              <td>${escapeHtml(teacher.fullName)}</td>
              <td>${escapeHtml(teacher.position || "Teacher")}</td>
              <td>${escapeHtml(teacher.specialization)}</td>
            </tr>
          `)
          .join("")
      : `<tr><td colspan="3">All active teachers are linked to user accounts.</td></tr>`;

    reportWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Users Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
            h1 { font-size: 22px; margin: 0; }
            h2 { font-size: 16px; margin: 28px 0 10px; }
            .muted { color: #64748b; font-size: 11px; margin-top: 3px; }
            .meta { color: #475569; font-size: 12px; margin-top: 6px; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: top; }
            th { background: #f1f5f9; text-align: left; }
            @media print { body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <h1>Users Report</h1>
          <div class="meta">Generated ${escapeHtml(new Date().toLocaleString())}</div>
          <div class="meta">${escapeHtml(users.length)} users - ${escapeHtml(pendingUsers.length)} pending - ${escapeHtml(unregisteredTeachers.length)} teachers not yet registered</div>

          <h2>Registered Users</h2>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Teacher Assignment</th>
                <th>Advising Assignment</th>
              </tr>
            </thead>
            <tbody>${userRows}</tbody>
          </table>

          <h2>Teachers Not Yet Registered As Users</h2>
          <table>
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Position</th>
                <th>Specialization</th>
              </tr>
            </thead>
            <tbody>${unregisteredRows}</tbody>
          </table>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    reportWindow.document.close();
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isSuperAdmin || isSavingAll || users.length === 0}
            onClick={() => void saveAllUserSettings()}
            type="button"
          >
            <Save size={16} /> {isSavingAll ? "Saving..." : "Save All"}
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={printUsersReport}
            type="button"
          >
            <Printer size={16} /> Print Report
          </button>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {pendingUsers.length} pending
          </div>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          Only Super Admin accounts can approve, disable, or change user roles.
        </div>
      )}

      {error && <p className="mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saveMessage && <p className="mt-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveMessage}</p>}

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
                  const isSelf = authenticatedUser?.uid === user.id;
                  const draft = getDraft(user);
                  const requiredModuleIds = getRequiredModulePermissions(draft.role);

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
                                const required = requiredModuleIds.includes(module.id);

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
                                      disabled={!isSuperAdmin || isSaving || isSelf || required}
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
                        {user.id}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isSuperAdmin || isSaving || isSelf || isSavingAll}
                            onClick={() => void saveUserSettings(user)}
                            type="button"
                          >
                            <Save size={16} /> Save
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-civic/90 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isSuperAdmin || isSaving || isSelf || isSavingAll || user.status === "approved"}
                            onClick={() => updateUserAccess(user, "approved")}
                            type="button"
                          >
                            <Check size={16} /> Approve
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isSuperAdmin || isSaving || isSelf || isSavingAll || user.status === "disabled"}
                            onClick={() => updateUserAccess(user, "disabled")}
                            type="button"
                          >
                            <X size={16} /> Disable
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!isSuperAdmin || isSaving || isSelf || isSavingAll}
                            onClick={() => void deleteUserProfile(user)}
                            type="button"
                          >
                            <Trash2 size={16} /> Delete
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
