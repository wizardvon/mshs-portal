import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { BackupRestorePage } from "./pages/BackupRestorePage";
import { CurriculumMappingPage } from "./pages/CurriculumMappingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoadAssignmentPage } from "./pages/LoadAssignmentPage";
import { LoadingDashboardPage } from "./pages/LoadingDashboardPage";
import { LoadingReportsPage } from "./pages/LoadingReportsPage";
import { LoginPage } from "./pages/LoginPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SectionsPage } from "./pages/SectionsPage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SubjectsPage } from "./pages/SubjectsPage";
import { TeacherLoadsPage } from "./pages/TeacherLoadsPage";
import { TeachersPage } from "./pages/TeachersPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/pending-approval" element={<PendingApprovalPage />} />

      <Route element={<ProtectedRoute allowedRoles={["super_admin", "admin", "viewer"]} />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            element={<ProtectedRoute allowedRoles={["super_admin", "admin"]} />}
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/teachers" element={<TeachersPage />} />
            <Route path="/subjects" element={<SubjectsPage />} />
            <Route path="/sections" element={<SectionsPage />} />
            <Route path="/curriculum-mapping" element={<CurriculumMappingPage />} />
            <Route path="/load-assignment" element={<LoadAssignmentPage />} />
            <Route path="/scheduler" element={<SchedulerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/backup-restore" element={<BackupRestorePage />} />
          </Route>
          <Route
            element={<ProtectedRoute allowedRoles={["super_admin"]} />}
          >
            <Route path="/users" element={<UsersPage />} />
          </Route>
          <Route
            element={<ProtectedRoute allowedRoles={["super_admin", "admin", "viewer"]} />}
          >
            <Route path="/loading" element={<LoadingDashboardPage />} />
            <Route path="/teacher-loads" element={<TeacherLoadsPage />} />
            <Route path="/reports" element={<LoadingReportsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
