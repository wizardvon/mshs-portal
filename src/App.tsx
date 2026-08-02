import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { BackupRestorePage } from "./pages/BackupRestorePage";
import { CertificateManagementPage } from "./pages/CertificateManagementPage";
import { CertificateVerificationPage } from "./pages/CertificateVerificationPage";
import { CurriculumMappingPage } from "./pages/CurriculumMappingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentRequestsPage } from "./pages/DocumentRequestsPage";
import { DllSubmissionsPage } from "./pages/DllSubmissionsPage";
import { EnrollmentPage } from "./pages/EnrollmentPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { GradeSubmissionsPage } from "./pages/GradeSubmissionsPage";
import { GradeSummaryPage } from "./pages/GradeSummaryPage";
import { LoadAssignmentPage } from "./pages/LoadAssignmentPage";
import { LoadingDashboardPage } from "./pages/LoadingDashboardPage";
import { LoadingReportsPage } from "./pages/LoadingReportsPage";
import { LoginPage } from "./pages/LoginPage";
import { MpsPage } from "./pages/MpsPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { MyPersonnelAttendancePage } from "./pages/MyPersonnelAttendancePage";
import { ObservationsPage } from "./pages/ObservationsPage";
import { PersonnelAttendancePage } from "./pages/PersonnelAttendancePage";
import { PersonnelLocatorPage } from "./pages/PersonnelLocatorPage";
import { PersonnelSettingsPage } from "./pages/PersonnelSettingsPage";
import { PrintableCertificatesPage } from "./pages/PrintableCertificatesPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SectionsPage } from "./pages/SectionsPage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SubjectsPage } from "./pages/SubjectsPage";
import { TeacherLoadsPage } from "./pages/TeacherLoadsPage";
import { TeachersPage } from "./pages/TeachersPage";
import { TosiaProPage } from "./pages/TosiaProPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/pending-approval" element={<PendingApprovalPage />} />
      <Route path="/verify-certificate/:certificateId" element={<CertificateVerificationPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route element={<ProtectedRoute requiredModule="dashboard" />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="teachers" />}>
            <Route path="/teachers" element={<TeachersPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="subjects" />}>
            <Route path="/subjects" element={<SubjectsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="sections" />}>
            <Route path="/sections" element={<SectionsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="enrollment" />}>
            <Route path="/enrollment" element={<EnrollmentPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="curriculum_mapping" />}>
            <Route path="/curriculum-mapping" element={<CurriculumMappingPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="load_assignment" />}>
            <Route path="/load-assignment" element={<LoadAssignmentPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="scheduler" />}>
            <Route path="/scheduler" element={<SchedulerPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="dll_submissions" />}>
            <Route path="/dll-submissions" element={<DllSubmissionsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="document_requests" />}>
            <Route path="/document-requests" element={<DocumentRequestsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="tosia_pro" />}>
            <Route path="/tosia-pro" element={<TosiaProPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="mps" />}>
            <Route path="/mps" element={<MpsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="grade_submissions" />}>
            <Route path="/grade-submissions" element={<GradeSubmissionsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="grade_summary" />}>
            <Route path="/grade-summary" element={<GradeSummaryPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="observations" />}>
            <Route path="/observations" element={<ObservationsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="personnel_attendance" />}>
            <Route path="/personnel-attendance" element={<PersonnelAttendancePage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="personnel_locator" />}>
            <Route path="/personnel-locator" element={<PersonnelLocatorPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="my_personnel_attendance" />}>
            <Route path="/my-attendance" element={<MyPersonnelAttendancePage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="settings" />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="personnel_settings" />}>
            <Route path="/personnel-settings" element={<PersonnelSettingsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="backup_restore" />}>
            <Route path="/backup-restore" element={<BackupRestorePage />} />
          </Route>
          <Route
            element={<ProtectedRoute allowedRoles={["super_admin"]} />}
          >
            <Route path="/users" element={<UsersPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="loading" />}>
            <Route path="/loading" element={<LoadingDashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="teacher_loads" />}>
            <Route path="/teacher-loads" element={<TeacherLoadsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["super_admin"]} />}>
            <Route path="/certificates" element={<CertificateManagementPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/printable-certificates" element={<PrintableCertificatesPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredModule="reports" />}>
            <Route path="/reports" element={<LoadingReportsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
