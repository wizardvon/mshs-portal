import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import type { UserRole } from "../types";

type ProtectedRouteProps = {
  allowedRoles?: UserRole[];
  viewOnly?: boolean;
};

export function ProtectedRoute({ allowedRoles, viewOnly }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-mist text-sm font-medium text-slate-600">
        Loading secure session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!profile || profile.status === "pending") {
    return <Navigate to="/pending-approval" replace />;
  }

  if (profile.status !== "approved") {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === "viewer" ? "/reports" : "/dashboard"} replace />;
  }

  if (viewOnly && profile.role !== "viewer") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
