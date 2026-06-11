import { Check, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../providers/AuthProvider";
import type { UserProfile, UserRole, UserStatus } from "../types";

type UserRow = UserProfile & {
  id: string;
};

const statusClass: Record<UserStatus, string> = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  disabled: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function UsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const isSuperAdmin = profile?.role === "super_admin";

  useEffect(() => {
    const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));

    return onSnapshot(
      usersQuery,
      (snapshot) => {
        setUsers(
          snapshot.docs.map((userDoc) => ({
            id: userDoc.id,
            ...(userDoc.data() as UserProfile),
          })),
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

  async function updateUserAccess(
    user: UserRow,
    nextStatus: UserStatus,
    nextRole = user.role,
  ) {
    if (!isSuperAdmin) {
      return;
    }

    setSavingUserId(user.id);
    setError("");

    try {
      await updateDoc(doc(db, "users", user.id), {
        role: nextRole,
        status: nextStatus,
        reviewedAt: serverTimestamp(),
        reviewedBy: profile?.userId,
      });
    } catch {
      setError("Unable to update that user. Confirm your account is approved as Super Admin.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function updateRole(user: UserRow, nextRole: UserRole) {
    await updateUserAccess(user, user.status, nextRole);
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">UID</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {users.map((user) => {
                  const isSaving = savingUserId === user.id;
                  const isSelf = profile?.userId === user.userId;

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
                          value={user.role}
                        >
                          <option value="super_admin">Super Admin</option>
                          <option value="admin">Admin</option>
                          <option value="viewer">Viewer</option>
                        </select>
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
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {user.userId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
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
