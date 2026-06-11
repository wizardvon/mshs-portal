import { Clock, LogOut } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { logout } from "../services/authService";

export function PendingApprovalPage() {
  const { profile, user, loading } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-mist text-sm font-medium text-slate-600">
        Loading account status...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-mist px-5 py-10">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-amber-50 text-signal">
          <Clock size={26} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-ink">Pending Approval</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {profile?.fullName ?? "Your account"} is registered and waiting for a
          Super Admin to approve access.
        </p>
        <button
          className="mt-7 inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={handleLogout}
          type="button"
        >
          <LogOut size={16} /> Logout
        </button>
      </section>
    </main>
  );
}
