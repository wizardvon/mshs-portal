import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardList,
  FileCheck2,
  FileText,
  Eye,
  Hourglass,
  Layers3,
  Settings,
  ShieldCheck,
  UserCheck,
  UsersRound,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeDocumentRequests, subscribeDocumentRequestSubmissions } from "../services/documentRequestService";
import { subscribeDllRequests, subscribeDllSubmissions } from "../services/dllSubmissionService";
import { subscribeMpsRequests, subscribeMpsSubmissions } from "../services/mpsService";
import { subscribeObservationSchedules } from "../services/observationService";
import { subscribeCollection } from "../services/firestoreCrud";
import { subscribePersonnelAttendanceByDate, subscribePersonnelAttendanceByDateRange } from "../services/personnelAttendanceService";
import { subscribeClassSchedulesByPeriod } from "../services/scheduleService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeTeachers } from "../services/teacherService";
import { defaultUserPortalSettings, subscribeUserPortalSettings, type UserPortalSettings } from "../services/userSettingsService";
import { useAuth } from "../providers/AuthProvider";
import type { AppModule, UserProfile } from "../types";
import type {
  AcademicSettings,
  ClassScheduleEntry,
  DocumentRequest,
  DocumentRequestSubmission,
  DllRequest,
  DllSubmission,
  LoadAssignment,
  MpsRequest,
  MpsSubmission,
  PersonnelAttendanceRecord,
  ObservationSchedule,
  ScheduleDay,
  Section,
  Subject,
  Teacher,
} from "../types/loading";
import { canAccessModule, getRoleLabel } from "../utils/accessControl";
import { buildTeacherLoadSummaries, getTeacherTotalLoad } from "../utils/loadCalculations";

type DashboardCard = {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  isActive?: boolean;
  progress?: number;
  onClick?: () => void;
  to?: string;
};

type AttentionItem = {
  label: string;
  detail: string;
  progress?: number;
  to?: string;
};

type ComplianceBreakdownItem = {
  label: string;
  completed: number;
  total: number;
  progress: number;
  detail: string;
};

type QuickAction = {
  label: string;
  detail: string;
  icon: LucideIcon;
  module: AppModule;
  to: string;
};

const quickActions: QuickAction[] = [
  { label: "Personnel Attendance", detail: "record and review staff attendance", icon: UserCheck, module: "personnel_attendance", to: "/personnel-attendance" },
  { label: "DLL Submissions", detail: "submit or review DLL records", icon: FileCheck2, module: "dll_submissions", to: "/dll-submissions" },
  { label: "Document Requests", detail: "submit or confirm requested documents", icon: FileText, module: "document_requests", to: "/document-requests" },
  { label: "Observation & Coaching", detail: "view and schedule observations", icon: Eye, module: "observations", to: "/observations" },
  { label: "Teacher Loads", detail: "view assigned teaching loads", icon: ClipboardList, module: "teacher_loads", to: "/teacher-loads" },
  { label: "SHS Loading", detail: "manage loading records", icon: Layers3, module: "loading", to: "/loading" },
  { label: "Reports", detail: "print summaries and histories", icon: BarChart3, module: "reports", to: "/reports" },
  { label: "Users", detail: "approve and assign users", icon: UsersRound, module: "users", to: "/users" },
  { label: "Settings", detail: "personal dashboard preferences", icon: Settings, module: "personnel_settings", to: "/personnel-settings" },
];

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthRange() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const start = new Date(year, month, 1);
  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  return {
    label: start.toLocaleString(undefined, { month: "long", year: "numeric" }),
    startDate: formatDate(start),
    endDate: formatDate(today),
  };
}

function getSubmissionKey(requestId: string, teacherId: string, subjectId: string) {
  return `${requestId}:${teacherId}:${subjectId}`;
}

function getMpsSubmissionKey(requestId: string, teacherId: string, subjectId: string, sectionId: string) {
  return `${requestId}:${teacherId}:${subjectId}:${sectionId}`;
}

function getCompletionPercentage(completed: number, total: number) {
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
}

const scheduleDays: ScheduleDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function timeToMinutes(time: string) {
  const [hours = "0", minutes = "0"] = time.split(":");
  const parsedHours = Number(hours);
  const normalizedHours = parsedHours > 0 && parsedHours < 6 ? parsedHours + 12 : parsedHours;
  return normalizedHours * 60 + Number(minutes);
}

function formatTimeRange(entry: Pick<ClassScheduleEntry, "startTime" | "endTime">) {
  return `${entry.startTime}-${entry.endTime}`;
}

function getCurrentSchedulePosition() {
  const now = new Date();
  const calendarDay = now.getDay();
  const day = scheduleDays[calendarDay - 1] ?? scheduleDays[0];
  const isWeekend = calendarDay === 0 || calendarDay === 6;
  return {
    day,
    dayIndex: isWeekend ? -1 : scheduleDays.indexOf(day),
    minutes: isWeekend ? -1 : now.getHours() * 60 + now.getMinutes(),
  };
}

function MetricCard({ card }: { card: DashboardCard }) {
  const navigate = useNavigate();
  const Icon = card.icon;
  const content = (
    <div className="flex h-full items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-500">{card.label}</p>
        <p className="mt-3 text-3xl font-bold tracking-tight text-ink">{card.value}</p>
        {card.detail && <p className="mt-2 text-xs font-medium text-slate-500">{card.detail}</p>}
        {typeof card.progress === "number" && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-civic transition-all" style={{ width: `${card.progress}%` }} />
            </div>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{card.progress}% complete</p>
          </div>
        )}
      </div>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-civic ring-1 ring-red-100 transition group-hover:bg-civic group-hover:text-white">
        <Icon size={20} />
      </div>
    </div>
  );

  const cardClassName =
    "group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-red-100 hover:bg-red-50/30 hover:shadow-md";

  if (!card.to) {
    if (card.onClick) {
      return (
        <button
          className={cardClassName}
          onClick={card.onClick}
          type="button"
        >
          {content}
        </button>
      );
    }

    return <article className={cardClassName}>{content}</article>;
  }

  return (
    <button
      className={cardClassName}
      onClick={() => navigate(card.to ?? "/dashboard")}
      type="button"
    >
      {content}
    </button>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const today = getTodayInputValue();
  const currentMonth = useMemo(() => getCurrentMonthRange(), []);
  const [settings, setSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [userSettings, setUserSettings] = useState<UserPortalSettings>(defaultUserPortalSettings);
  const [requests, setRequests] = useState<DllRequest[]>([]);
  const [submissions, setSubmissions] = useState<DllSubmission[]>([]);
  const [documentRequests, setDocumentRequests] = useState<DocumentRequest[]>([]);
  const [documentSubmissions, setDocumentSubmissions] = useState<DocumentRequestSubmission[]>([]);
  const [mpsRequests, setMpsRequests] = useState<MpsRequest[]>([]);
  const [mpsSubmissions, setMpsSubmissions] = useState<MpsSubmission[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadAssignments, setLoadAssignments] = useState<LoadAssignment[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ClassScheduleEntry[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<PersonnelAttendanceRecord[]>([]);
  const [monthlyAttendanceRecords, setMonthlyAttendanceRecords] = useState<PersonnelAttendanceRecord[]>([]);
  const [observationSchedules, setObservationSchedules] = useState<ObservationSchedule[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const canSeeAllDllSummary = profile?.role === "principal" || profile?.role === "master_teacher" || profile?.role === "admin" || profile?.role === "super_admin";
  const canSeeOwnDllSummary = profile?.role === "teacher" && !!profile.assignedTeacherId;
  const canSeeDllSummary = canSeeAllDllSummary || canSeeOwnDllSummary;
  const canSeeUserSummary = profile?.role === "super_admin";
  const canSeeObservationSummary = canAccessModule(profile, "observations");

  useEffect(() => subscribeAcademicSettings(setSettings), []);
  useEffect(() => subscribeUserPortalSettings(profile?.userId, setUserSettings), [profile?.userId]);
  useEffect(() => subscribeDllRequests(setRequests), []);
  useEffect(() => subscribeDocumentRequests(setDocumentRequests), []);
  useEffect(() => subscribeDocumentRequestSubmissions(setDocumentSubmissions), []);
  useEffect(() => subscribeMpsRequests(setMpsRequests), []);
  useEffect(() => subscribeMpsSubmissions(setMpsSubmissions, profile?.role === "teacher" ? profile.assignedTeacherId : undefined), [profile?.assignedTeacherId, profile?.role]);
  useEffect(() => {
    if (!canSeeDllSummary) {
      setSubmissions([]);
      return undefined;
    }

    return subscribeDllSubmissions(setSubmissions, canSeeOwnDllSummary ? profile?.assignedTeacherId : undefined);
  }, [canSeeDllSummary, canSeeOwnDllSummary, profile?.assignedTeacherId]);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeCollection<Section>("sections", setSections), []);
  useEffect(() => subscribeLoadAssignments(setLoadAssignments), []);
  useEffect(() => {
    if (profile?.role !== "teacher" || !profile.assignedTeacherId) {
      setScheduleEntries([]);
      return undefined;
    }

    return subscribeClassSchedulesByPeriod(
      settings.currentSchoolYear,
      settings.currentTerm,
      "all",
      setScheduleEntries,
    );
  }, [profile?.assignedTeacherId, profile?.role, settings.currentSchoolYear, settings.currentTerm]);
  useEffect(() => subscribePersonnelAttendanceByDate(today, setAttendanceRecords), [today]);
  useEffect(
    () => subscribePersonnelAttendanceByDateRange(currentMonth.startDate, currentMonth.endDate, setMonthlyAttendanceRecords),
    [currentMonth.endDate, currentMonth.startDate],
  );
  useEffect(() => {
    if (!canSeeObservationSummary) {
      setObservationSchedules([]);
      return undefined;
    }
    if (profile?.role === "teacher") {
      return profile.assignedTeacherId
        ? subscribeObservationSchedules(setObservationSchedules, { teacherId: profile.assignedTeacherId })
        : undefined;
    }
    return subscribeObservationSchedules(setObservationSchedules);
  }, [canSeeObservationSummary, profile?.assignedTeacherId, profile?.role]);
  useEffect(() => {
    if (!canSeeUserSummary) {
      setUsers([]);
      return undefined;
    }

    return subscribeCollection<UserProfile>("users", setUsers);
  }, [canSeeUserSummary]);

  const activeAssignments = useMemo(
    () =>
      loadAssignments.filter(
        (assignment) =>
          assignment.schoolYear === settings.currentSchoolYear &&
          assignment.term === settings.currentTerm,
      ),
    [loadAssignments, settings.currentSchoolYear, settings.currentTerm],
  );

  const teacherLoadSummaries = useMemo(
    () => buildTeacherLoadSummaries(teachers, loadAssignments, settings.currentSchoolYear, settings.currentTerm),
    [loadAssignments, settings.currentSchoolYear, settings.currentTerm, teachers],
  );

  const ownLoad = profile?.assignedTeacherId
    ? getTeacherTotalLoad(profile.assignedTeacherId, loadAssignments, settings.currentSchoolYear, settings.currentTerm)
    : 0;

  const subjectsById = useMemo(() => new Map(subjects.map((subject) => [subject.subjectId, subject])), [subjects]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]);

  const ownScheduleEntries = useMemo(
    () =>
      scheduleEntries
        .filter((entry) => entry.teacherId === profile?.assignedTeacherId)
        .sort(
          (first, second) =>
            scheduleDays.indexOf(first.day) - scheduleDays.indexOf(second.day) ||
            timeToMinutes(first.startTime) - timeToMinutes(second.startTime) ||
            timeToMinutes(first.endTime) - timeToMinutes(second.endTime),
        ),
    [profile?.assignedTeacherId, scheduleEntries],
  );

  const nextScheduleEntry = useMemo(() => {
    if (ownScheduleEntries.length === 0) return undefined;

    const current = getCurrentSchedulePosition();
    return (
      ownScheduleEntries.find(
        (entry) =>
          scheduleDays.indexOf(entry.day) > current.dayIndex ||
          (entry.day === current.day && timeToMinutes(entry.startTime) >= current.minutes),
      ) ?? ownScheduleEntries[0]
    );
  }, [ownScheduleEntries]);

  const nextScheduleSubjectLabel = nextScheduleEntry
    ? nextScheduleEntry.customTitle || subjectsById.get(nextScheduleEntry.subjectId)?.subjectName || "Scheduled Activity"
    : "No schedule";

  const nextScheduleDetail = nextScheduleEntry
    ? `${nextScheduleEntry.day}, ${formatTimeRange(nextScheduleEntry)}`
    : "tap to view weekly schedule";

  const attendanceSummary = useMemo(
    () => ({
      recorded: attendanceRecords.length,
      present: attendanceRecords.filter((record) => record.status === "present").length,
      absent: attendanceRecords.filter((record) => record.status === "absent").length,
      officialBusiness: attendanceRecords.filter((record) => record.status === "official_business").length,
    }),
    [attendanceRecords],
  );

  const monthlyAttendanceSummary = useMemo(
    () => ({
      recorded: monthlyAttendanceRecords.length,
      present: monthlyAttendanceRecords.filter((record) => record.status === "present").length,
    }),
    [monthlyAttendanceRecords],
  );

  const ownMonthlyAttendanceSummary = useMemo(() => {
    const staffId = profile?.assignedTeacherId ?? profile?.userId;
    const ownRecords = staffId ? monthlyAttendanceRecords.filter((record) => record.staffId === staffId) : [];

    return {
      recorded: ownRecords.length,
      present: ownRecords.filter((record) => record.status === "present").length,
    };
  }, [monthlyAttendanceRecords, profile?.assignedTeacherId, profile?.userId]);

  const ownAttendanceRecord = useMemo(() => {
    const staffId = profile?.assignedTeacherId ?? profile?.userId;
    return staffId ? attendanceRecords.find((record) => record.staffId === staffId) : undefined;
  }, [attendanceRecords, profile?.assignedTeacherId, profile?.userId]);

  const ownAttendanceLabel = ownAttendanceRecord
    ? ownAttendanceRecord.status === "official_business"
      ? "OB"
      : ownAttendanceRecord.status.charAt(0).toUpperCase() + ownAttendanceRecord.status.slice(1)
    : "No Record";

  const documentSummary = useMemo(() => {
    if (!profile) {
      return { total: 0, submitted: 0, confirmed: 0, pending: 0, returned: 0, submittedPercentage: 100 };
    }

    const activeDocumentRequests = documentRequests.filter((request) => request.status === "active");
    const submissionKeys = new Set(documentSubmissions.map((submission) => `${submission.requestId}:${submission.targetUserId}`));

    const ownRequired = activeDocumentRequests.filter((request) => request.targetUserIds.includes(profile.userId));
    const ownSubmitted = ownRequired.filter((request) => submissionKeys.has(`${request.requestId}:${profile.userId}`)).length;

    const createdTargets = activeDocumentRequests
      .filter((request) => request.createdBy === profile.userId)
      .flatMap((request) => request.targetUserIds.map((targetUserId) => ({ requestId: request.requestId, targetUserId })));
    const createdSubmissions = createdTargets
      .map((target) => documentSubmissions.find((submission) => submission.requestId === target.requestId && submission.targetUserId === target.targetUserId))
      .filter((submission): submission is DocumentRequestSubmission => Boolean(submission));
    const createdConfirmed = createdSubmissions.filter((submission) => submission.status === "confirmed").length;

    const total = profile.role === "teacher" ? ownRequired.length : ownRequired.length + createdTargets.length;
    const completed = profile.role === "teacher" ? ownSubmitted : ownSubmitted + createdConfirmed;

    return {
      total,
      submitted: ownSubmitted,
      confirmed: createdConfirmed,
      pending: Math.max(0, total - completed),
      returned: documentSubmissions.filter((submission) => submission.targetUserId === profile.userId && submission.status === "returned").length,
      submittedPercentage: getCompletionPercentage(completed, total),
    };
  }, [documentRequests, documentSubmissions, profile]);

  const mpsSummary = useMemo(() => {
    if (profile?.role !== "teacher" || !profile.assignedTeacherId) {
      return { total: 0, submitted: 0, pending: 0, submittedPercentage: 100 };
    }

    const activeRequests = mpsRequests.filter(
      (request) =>
        request.status === "active" &&
        request.schoolYear === settings.currentSchoolYear &&
        request.term === settings.currentTerm,
    );
    const teacherClasses = activeAssignments.filter((assignment) => assignment.teacherId === profile.assignedTeacherId);
    const submissionKeys = new Set(
      mpsSubmissions
        .filter(
          (submission) =>
            submission.schoolYear === settings.currentSchoolYear &&
            submission.term === settings.currentTerm,
        )
        .map((submission) =>
          getMpsSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId, submission.sectionId),
        ),
    );
    const requiredKeys = activeRequests.flatMap((request) =>
      teacherClasses.map((assignment) =>
        getMpsSubmissionKey(request.requestId, profile.assignedTeacherId ?? "", assignment.subjectId, assignment.sectionId),
      ),
    );
    const submitted = requiredKeys.filter((key) => submissionKeys.has(key)).length;

    return {
      total: requiredKeys.length,
      submitted,
      pending: Math.max(0, requiredKeys.length - submitted),
      submittedPercentage: getCompletionPercentage(submitted, requiredKeys.length),
    };
  }, [
    activeAssignments,
    mpsRequests,
    mpsSubmissions,
    profile?.assignedTeacherId,
    profile?.role,
    settings.currentSchoolYear,
    settings.currentTerm,
  ]);

  const dllSummary = useMemo(() => {
    const activeRequests = requests.filter(
      (request) =>
        request.status === "active" &&
        request.schoolYear === settings.currentSchoolYear &&
        (!request.term || request.term === settings.currentTerm),
    );
    const subjectsById = new Map(subjects.map((subject) => [subject.subjectId, subject]));
    const relevantTeachers = canSeeOwnDllSummary
      ? teachers.filter((teacher) => teacher.teacherId === profile?.assignedTeacherId)
      : teachers.filter((teacher) => teacher.status === "active");
    const visibleSubmissions = submissions.filter(
      (submission) =>
        !submission.archived &&
        (submission.schoolYear || settings.currentSchoolYear) === settings.currentSchoolYear &&
        (!submission.term || submission.term === settings.currentTerm),
    );
    const submissionKeys = new Set(
      visibleSubmissions.map((submission) =>
        getSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId),
      ),
    );
    const approvedKeys = new Set(
      visibleSubmissions
        .filter((submission) => submission.status === "approved")
        .map((submission) =>
          getSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId),
        ),
    );
    const returned = visibleSubmissions.filter((submission) => submission.status === "returned").length;

    const requiredKeys = activeRequests.flatMap((request) =>
      relevantTeachers.flatMap((teacher) => {
        const teacherSubjectIds = Array.from(
          new Set(
            activeAssignments
              .filter((assignment) => assignment.teacherId === teacher.teacherId)
              .map((assignment) => assignment.subjectId),
          ),
        ).filter((subjectId) => subjectsById.has(subjectId));

        return teacherSubjectIds.map((subjectId) => getSubmissionKey(request.requestId, teacher.teacherId, subjectId));
      }),
    );

    const submitted = requiredKeys.filter((key) => submissionKeys.has(key)).length;
    const approved = requiredKeys.filter((key) => approvedKeys.has(key)).length;
    const total = requiredKeys.length;
    const pending = Math.max(0, total - submitted);
    const submittedPercentage = total === 0 ? 0 : Math.round((submitted / total) * 100);

    return { total, submitted, approved, pending, returned, submittedPercentage };
  }, [
    activeAssignments,
    canSeeOwnDllSummary,
    profile?.assignedTeacherId,
    requests,
    settings.currentSchoolYear,
    settings.currentTerm,
    subjects,
    submissions,
    teachers,
  ]);

  const userSummary = useMemo(
    () => ({
      total: users.length,
      pending: users.filter((user) => user.status === "pending").length,
      approved: users.filter((user) => user.status === "approved").length,
      disabled: users.filter((user) => user.status === "disabled").length,
    }),
    [users],
  );

  const observationSummary = useMemo(() => {
    const current = observationSchedules.filter(
      (schedule) =>
        schedule.schoolYear === settings.currentSchoolYear &&
        schedule.term === settings.currentTerm &&
        (profile?.role === "teacher" || schedule.observerId === profile?.userId || profile?.role === "super_admin" || profile?.role === "principal" || profile?.role === "master_teacher"),
    );
    return {
      scheduled: current.filter((schedule) => schedule.status === "scheduled").length,
      done: current.filter((schedule) => schedule.status === "done").length,
      today: current.filter((schedule) => schedule.status === "scheduled" && schedule.scheduleDate === today).length,
    };
  }, [observationSchedules, profile?.role, profile?.userId, settings.currentSchoolYear, settings.currentTerm, today]);

  const sectionSummary = useMemo(
    () => ({
      total: sections.filter((section) => section.status === "active" && section.schoolYear === settings.currentSchoolYear).length,
      grade11: sections.filter((section) => section.status === "active" && section.schoolYear === settings.currentSchoolYear && section.gradeLevel === "11").length,
      grade12: sections.filter((section) => section.status === "active" && section.schoolYear === settings.currentSchoolYear && section.gradeLevel === "12").length,
    }),
    [sections, settings.currentSchoolYear],
  );

  const attendanceCompletion = getCompletionPercentage(monthlyAttendanceSummary.present, monthlyAttendanceSummary.recorded);
  const ownAttendanceCompletion = getCompletionPercentage(ownMonthlyAttendanceSummary.present, ownMonthlyAttendanceSummary.recorded);
  const userApprovalCompletion = getCompletionPercentage(userSummary.approved, userSummary.total);
  const observationCompletion = getCompletionPercentage(observationSummary.done, observationSummary.done + observationSummary.scheduled);

  const complianceBreakdown = useMemo<ComplianceBreakdownItem[]>(() => {
    const items: ComplianceBreakdownItem[] = [];

    if (canSeeUserSummary) {
      items.push({
        label: "User approvals",
        completed: userSummary.approved,
        total: userSummary.total,
        progress: userApprovalCompletion,
        detail: `${userSummary.pending} pending approval`,
      });
    }

    if (canAccessModule(profile, "personnel_attendance")) {
      items.push({
        label: "Personnel attendance",
        completed: monthlyAttendanceSummary.present,
        total: monthlyAttendanceSummary.recorded,
        progress: attendanceCompletion,
        detail: `${currentMonth.label} present records`,
      });
    }

    if (canAccessModule(profile, "my_personnel_attendance")) {
      items.push({
        label: "My attendance",
        completed: ownMonthlyAttendanceSummary.present,
        total: ownMonthlyAttendanceSummary.recorded,
        progress: ownAttendanceCompletion,
        detail: "month-to-date up to today",
      });
    }

    if (canSeeDllSummary) {
      items.push({
        label: "DLL compliance",
        completed: dllSummary.submitted,
        total: dllSummary.total,
        progress: dllSummary.submittedPercentage,
        detail: `${dllSummary.pending} pending`,
      });
    }

    if (canAccessModule(profile, "document_requests")) {
      items.push({
        label: "Document requests",
        completed: documentSummary.total - documentSummary.pending,
        total: documentSummary.total,
        progress: documentSummary.submittedPercentage,
        detail: `${documentSummary.pending} pending`,
      });
    }

    if (canAccessModule(profile, "mps")) {
      items.push({
        label: "MPS compliance",
        completed: mpsSummary.submitted,
        total: mpsSummary.total,
        progress: mpsSummary.submittedPercentage,
        detail: `${mpsSummary.pending} pending`,
      });
    }

    if (canSeeObservationSummary) {
      const observationTotal = observationSummary.done + observationSummary.scheduled;
      items.push({
        label: "Observation completion",
        completed: observationSummary.done,
        total: observationTotal,
        progress: observationCompletion,
        detail: `${observationSummary.today} scheduled today`,
      });
    }

    return items;
  }, [
    attendanceCompletion,
    canSeeDllSummary,
    canSeeObservationSummary,
    canSeeUserSummary,
    currentMonth.label,
    documentSummary,
    dllSummary.pending,
    dllSummary.submitted,
    dllSummary.submittedPercentage,
    dllSummary.total,
    monthlyAttendanceSummary.present,
    monthlyAttendanceSummary.recorded,
    mpsSummary.pending,
    mpsSummary.submitted,
    mpsSummary.submittedPercentage,
    mpsSummary.total,
    observationCompletion,
    observationSummary.done,
    observationSummary.scheduled,
    observationSummary.today,
    ownAttendanceCompletion,
    ownMonthlyAttendanceSummary.present,
    ownMonthlyAttendanceSummary.recorded,
    profile,
    userApprovalCompletion,
    userSummary.approved,
    userSummary.pending,
    userSummary.total,
  ]);

  const overallCompliance = getCompletionPercentage(
    complianceBreakdown.reduce((sum, item) => sum + item.completed, 0),
    complianceBreakdown.reduce((sum, item) => sum + item.total, 0),
  );

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const overloadCount = teacherLoadSummaries.filter((row) => row.status === "Over Teaching Load").length;

    return [
      ...(canSeeUserSummary && userSummary.pending > 0 ? [{
        label: "Approve pending users immediately",
        detail: `${userSummary.pending} user account${userSummary.pending === 1 ? "" : "s"} waiting for approval.`,
        progress: userApprovalCompletion,
        to: "/users",
      }] : []),
      ...(canAccessModule(profile, "personnel_attendance") && attendanceSummary.absent > 0 ? [{
        label: "Review attendance compliance today",
        detail: `${attendanceSummary.absent} personnel marked absent today. ${currentMonth.label}: ${monthlyAttendanceSummary.present}/${monthlyAttendanceSummary.recorded} present.`,
        progress: attendanceCompletion,
        to: "/personnel-attendance",
      }] : []),
      ...(canSeeDllSummary && dllSummary.pending > 0 ? [{
        label: profile?.role === "teacher" ? "Comply with DLL submission now" : "Follow up DLL compliance now",
        detail: `${dllSummary.pending} of ${dllSummary.total} DLL requirement${dllSummary.total === 1 ? "" : "s"} still pending.`,
        progress: dllSummary.submittedPercentage,
        to: "/dll-submissions",
      }] : []),
      ...(canAccessModule(profile, "document_requests") && documentSummary.pending > 0 ? [{
        label: profile?.role === "teacher" ? "Comply with document request now" : "Confirm document request submissions",
        detail: `${documentSummary.pending} document request task${documentSummary.pending === 1 ? "" : "s"} still pending.`,
        progress: documentSummary.submittedPercentage,
        to: "/document-requests",
      }] : []),
      ...(dllSummary.returned > 0 ? [{
        label: "Correct returned DLL submissions",
        detail: `${dllSummary.returned} DLL submission${dllSummary.returned === 1 ? "" : "s"} returned for correction. Resubmit immediately.`,
        progress: dllSummary.submittedPercentage,
        to: "/dll-submissions",
      }] : []),
      ...(canAccessModule(profile, "mps") && mpsSummary.pending > 0 ? [{
        label: "Comply with MPS submission now",
        detail: `${mpsSummary.pending} of ${mpsSummary.total} MPS requirement${mpsSummary.total === 1 ? "" : "s"} still pending.`,
        progress: mpsSummary.submittedPercentage,
        to: "/mps",
      }] : []),
      ...(canSeeObservationSummary && observationSummary.today > 0 ? [{
        label: "Complete today's observation schedule",
        detail: `${observationSummary.today} observation/coaching schedule${observationSummary.today === 1 ? "" : "s"} set for today.`,
        progress: observationCompletion,
        to: "/observations",
      }] : []),
      ...(overloadCount > 0 && canAccessModule(profile, "teacher_loads")
        ? [{
          label: "Resolve overloaded teacher assignments",
          detail: `${overloadCount} teacher${overloadCount === 1 ? "" : "s"} over teaching load. Adjust assignments as soon as possible.`,
          progress: 0,
          to: "/teacher-loads",
        }]
        : []),
    ];
  }, [
    attendanceSummary.absent,
    attendanceCompletion,
    canSeeDllSummary,
    canSeeObservationSummary,
    canSeeUserSummary,
    dllSummary.pending,
    dllSummary.returned,
    dllSummary.submittedPercentage,
    dllSummary.total,
    mpsSummary.pending,
    mpsSummary.submittedPercentage,
    mpsSummary.total,
    currentMonth.label,
    documentSummary.pending,
    documentSummary.submittedPercentage,
    monthlyAttendanceSummary.present,
    monthlyAttendanceSummary.recorded,
    observationSummary.today,
    observationCompletion,
    profile,
    teacherLoadSummaries,
    userApprovalCompletion,
    userSummary.pending,
  ]);

  const topCards = useMemo<DashboardCard[]>(() => {
    const cards: DashboardCard[] = [];

    if (profile?.role === "teacher") {
      cards.push({
        label: "Needs Attention",
        value: attentionItems.length > 0 ? `${overallCompliance}%` : "Clear",
        detail: attentionItems.length > 0 ? "comply immediately" : "all requirements complete",
        icon: AlertTriangle,
        isActive: attentionItems.length > 0,
        progress: overallCompliance,
        onClick: () => document.getElementById("dashboard-needs-attention")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      });
      cards.push({ label: "Next Subject", value: nextScheduleSubjectLabel, detail: nextScheduleDetail, icon: CalendarClock, isActive: ownScheduleEntries.length > 0, onClick: () => setScheduleOpen(true) });
      if (canSeeObservationSummary) {
        cards.push({ label: "My Observation", value: observationSummary.scheduled, detail: `${observationSummary.today} today`, icon: Eye, isActive: observationSummary.scheduled > 0 || observationSummary.today > 0, to: "/observations" });
      }
      if (canAccessModule(profile, "my_personnel_attendance")) {
        cards.push({
          label: "My Attendance",
          value: `${ownAttendanceCompletion}%`,
          detail: `${ownAttendanceLabel} today - ${ownMonthlyAttendanceSummary.present}/${ownMonthlyAttendanceSummary.recorded} present this month`,
          icon: UserCheck,
          isActive: ownAttendanceRecord ? ownAttendanceRecord.status !== "present" : false,
          progress: ownAttendanceCompletion,
          to: "/my-attendance",
        });
      }
      if (canSeeDllSummary) {
        cards.push({ label: "DLL Compliance", value: `${dllSummary.submittedPercentage}%`, detail: `${dllSummary.pending} pending - comply now`, icon: FileCheck2, isActive: dllSummary.pending > 0 || dllSummary.returned > 0, progress: dllSummary.submittedPercentage, to: "/dll-submissions" });
      }
      if (canAccessModule(profile, "document_requests")) {
        cards.push({ label: "Document Requests", value: `${documentSummary.submittedPercentage}%`, detail: `${documentSummary.pending} pending - comply now`, icon: FileText, isActive: documentSummary.pending > 0 || documentSummary.returned > 0, progress: documentSummary.submittedPercentage, to: "/document-requests" });
      }
      if (canAccessModule(profile, "mps")) {
        cards.push({ label: "MPS Compliance", value: `${mpsSummary.submittedPercentage}%`, detail: `${mpsSummary.pending} pending - comply now`, icon: BarChart3, isActive: mpsSummary.pending > 0, progress: mpsSummary.submittedPercentage, to: "/mps" });
      }
      if (canAccessModule(profile, "teacher_loads")) {
        cards.push({ label: "Teacher Load", value: ownLoad, detail: "hours this term", icon: ClipboardList, isActive: ownLoad > 0, to: "/teacher-loads" });
      }
      return userSettings.hideInactiveDashboardCards ? cards.filter((card) => card.isActive !== false) : cards;
    }

    cards.push({ label: "School Year", value: settings.currentSchoolYear, detail: settings.currentTerm, icon: CalendarDays, to: canAccessModule(profile, "settings") ? "/settings" : undefined });

    if (canAccessModule(profile, "personnel_attendance")) {
      cards.push(
        { label: "Attendance Compliance", value: `${attendanceCompletion}%`, detail: `${monthlyAttendanceSummary.present}/${monthlyAttendanceSummary.recorded} present - ${currentMonth.label}`, icon: CheckCircle2, isActive: monthlyAttendanceSummary.recorded > 0 && attendanceCompletion < 100, progress: attendanceCompletion, to: "/personnel-attendance" },
        { label: "Absent Today", value: attendanceSummary.absent, detail: "personnel attendance", icon: XCircle, isActive: attendanceSummary.absent > 0, to: "/personnel-attendance" },
        { label: "Official Business", value: attendanceSummary.officialBusiness, detail: "today", icon: BriefcaseBusiness, isActive: attendanceSummary.officialBusiness > 0, to: "/personnel-attendance" },
      );
    }

    if (canSeeDllSummary) {
      cards.push(
        { label: "DLL Compliance", value: `${dllSummary.submittedPercentage}%`, detail: `${dllSummary.pending} pending`, icon: FileCheck2, isActive: dllSummary.pending > 0 || dllSummary.returned > 0, progress: dllSummary.submittedPercentage, to: "/dll-submissions" },
        { label: "DLL Approved", value: dllSummary.approved, detail: `${dllSummary.returned} returned`, icon: BadgeCheck, isActive: dllSummary.returned > 0, to: "/dll-submissions" },
      );
    }

    if (canAccessModule(profile, "document_requests")) {
      cards.push({ label: "Document Requests", value: `${documentSummary.submittedPercentage}%`, detail: `${documentSummary.pending} pending`, icon: FileText, isActive: documentSummary.pending > 0 || documentSummary.returned > 0, progress: documentSummary.submittedPercentage, to: "/document-requests" });
    }

    if (canSeeObservationSummary) {
      cards.push(
        { label: "Observation Schedules", value: observationSummary.scheduled, detail: `${observationSummary.today} today`, icon: Eye, isActive: observationSummary.scheduled > 0 || observationSummary.today > 0, to: "/observations" },
        { label: "Observation Done", value: observationSummary.done, detail: "completed records", icon: BadgeCheck, isActive: false, to: "/observations" },
      );
    }

    if (canAccessModule(profile, "loading") || canAccessModule(profile, "teacher_loads")) {
      cards.push(
        { label: "Assignments", value: activeAssignments.length, detail: "current school year/term", icon: Layers3, isActive: activeAssignments.length > 0, to: "/loading" },
        { label: "Overloaded", value: teacherLoadSummaries.filter((row) => row.status === "Over Teaching Load").length, detail: "teachers", icon: AlertTriangle, isActive: teacherLoadSummaries.some((row) => row.status === "Over Teaching Load"), to: "/teacher-loads" },
      );
    }

    if (profile?.role === "registrar") {
      cards.push(
        { label: "Active Sections", value: sectionSummary.total, detail: `${settings.currentSchoolYear}`, icon: Layers3, isActive: sectionSummary.total > 0, to: "/sections" },
        { label: "Grade 11", value: sectionSummary.grade11, detail: "active sections", icon: ClipboardList, isActive: sectionSummary.grade11 > 0, to: "/sections" },
        { label: "Grade 12", value: sectionSummary.grade12, detail: "active sections", icon: ClipboardList, isActive: sectionSummary.grade12 > 0, to: "/sections" },
      );
    }

    if (canSeeUserSummary) {
      cards.push(
        { label: "Pending Users", value: userSummary.pending, detail: `${userSummary.total} total users`, icon: UsersRound, isActive: userSummary.pending > 0, to: "/users" },
        { label: "Approved Users", value: userSummary.approved, detail: `${userSummary.disabled} disabled`, icon: ShieldCheck, isActive: userSummary.disabled > 0, to: "/users" },
      );
    }

    return userSettings.hideInactiveDashboardCards ? cards.filter((card) => card.isActive !== false) : cards;
  }, [
    activeAssignments.length,
    attentionItems,
    attendanceCompletion,
    attendanceSummary,
    canSeeDllSummary,
    canSeeUserSummary,
    documentSummary,
    dllSummary,
    mpsSummary,
    currentMonth.label,
    monthlyAttendanceSummary,
    nextScheduleDetail,
    nextScheduleSubjectLabel,
    observationSummary,
    overallCompliance,
    ownAttendanceRecord,
    ownAttendanceCompletion,
    ownAttendanceLabel,
    ownMonthlyAttendanceSummary,
    ownLoad,
    ownScheduleEntries.length,
    profile,
    sectionSummary,
    settings.currentSchoolYear,
    settings.currentTerm,
    teacherLoadSummaries,
    userSettings.hideInactiveDashboardCards,
    userSummary,
  ]);

  const visibleQuickActions = quickActions.filter((action) => canAccessModule(profile, action.module)).slice(0, 6);

  return (
    <section>
      <div className="overflow-hidden rounded-2xl border border-red-100 bg-white/90 shadow-sm shadow-slate-200/70">
        <div className="flex flex-col justify-between gap-3 px-5 py-5 sm:flex-row sm:items-end">
          <div className="flex min-w-0 items-start gap-4">
            <img
              alt="Mataasnakahoy Senior High School"
              className="h-14 w-14 shrink-0 object-contain"
              src="/school-logo.png"
            />
            <div className="min-w-0">
              <div className="mb-3 h-1 w-14 rounded-full bg-signal" />
              <h1 className="text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
              <p className="mt-2 text-sm text-slate-600">
                {profile ? `${getRoleLabel(profile.role)} overview for ${settings.currentSchoolYear}, ${settings.currentTerm}.` : "MSHS Portal overview."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {topCards.map((card) => (
          <MetricCard card={card} key={card.label} />
        ))}
      </div>

      {visibleQuickActions.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Quick Actions</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleQuickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-red-100 hover:bg-red-50/30 hover:shadow-md"
                  key={action.label}
                  onClick={() => navigate(action.to)}
                  type="button"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-civic ring-1 ring-red-100 transition group-hover:bg-civic group-hover:text-white">
                    <Icon size={20} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-ink">{action.label}</span>
                    <span className="mt-1 block text-xs text-slate-500">{action.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section id="dashboard-needs-attention" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Needs Attention</h2>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {attentionItems.length > 0 ? "Please comply with the pending requirements immediately." : "All tracked requirements are complete."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Overall</p>
              <p className="text-xl font-bold text-ink">{overallCompliance}%</p>
            </div>
          </div>
          {complianceBreakdown.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Overall percentage contributors</p>
                <p className="text-xs font-semibold text-slate-500">
                  {complianceBreakdown.reduce((sum, item) => sum + item.completed, 0)}/{complianceBreakdown.reduce((sum, item) => sum + item.total, 0)} completed
                </p>
              </div>
              <div className="mt-3 space-y-3">
                {complianceBreakdown.map((item) => (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" key={item.label}>
                    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-950">{item.label}</p>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">{item.detail}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-950">
                        {item.completed}/{item.total} · {item.progress}%
                      </p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-civic transition-all" style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {attentionItems.length > 0 ? (
            <div className="mt-4 space-y-3">
              {attentionItems.map((item) => (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900" key={item.label}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={17} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-bold text-amber-950">{item.label}</p>
                          <p className="mt-1 font-medium">{item.detail}</p>
                        </div>
                        {item.to && (
                          <button
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-civic px-3 text-xs font-bold text-white transition hover:bg-wine"
                            onClick={() => navigate(item.to ?? "/dashboard")}
                            type="button"
                          >
                            Comply now
                          </button>
                        )}
                      </div>
                      {typeof item.progress === "number" && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-amber-800">
                            <span>Completion</span>
                            <span>{item.progress}%</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-amber-100">
                            <div className="h-full rounded-full bg-civic transition-all" style={{ width: `${item.progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">No urgent items for your dashboard right now.</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Current Context</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">School Year</dt>
              <dd className="font-semibold text-slate-950">{settings.currentSchoolYear}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Term</dt>
              <dd className="font-semibold text-slate-950">{settings.currentTerm}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Active Teachers</dt>
              <dd className="font-semibold text-slate-950">{teachers.filter((teacher) => teacher.status === "active").length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Active Sections</dt>
              <dd className="font-semibold text-slate-950">{sectionSummary.total}</dd>
            </div>
          </dl>
        </section>
      </div>

      {profile?.role === "teacher" && scheduleOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
          <section className="w-full max-w-5xl overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl shadow-slate-950/20">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-wine to-civic px-5 py-4 text-white">
              <div>
                <h2 className="text-lg font-bold">My Weekly Schedule</h2>
                <p className="mt-1 text-sm text-white/75">{settings.currentSchoolYear}, {settings.currentTerm}</p>
              </div>
              <button
                aria-label="Close weekly schedule"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => setScheduleOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto bg-slate-50/50 p-5">
              {ownScheduleEntries.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-5">
                  {scheduleDays.map((day) => {
                    const entriesForDay = ownScheduleEntries.filter((entry) => entry.day === day);

                    return (
                      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70" key={day}>
                        <h3 className="text-sm font-bold text-ink">{day}</h3>
                        <div className="mt-3 space-y-2">
                          {entriesForDay.length > 0 ? entriesForDay.map((entry) => {
                            const subject = subjectsById.get(entry.subjectId);
                            const section = sectionsById.get(entry.sectionId);

                            return (
                              <article className="rounded-xl border border-red-100 bg-red-50/30 p-3 text-sm" key={entry.scheduleId}>
                                <p className="font-bold text-ink">{entry.customTitle || subject?.subjectName || "Scheduled Activity"}</p>
                                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-civic">
                                  <Clock3 size={13} /> {formatTimeRange(entry)}
                                </p>
                                <p className="mt-2 text-xs text-slate-600">
                                  {section?.sectionName ?? entry.customDetails ?? "No section"}
                                  {entry.room ? ` - Room ${entry.room}` : ""}
                                </p>
                              </article>
                            );
                          }) : (
                            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">No classes</p>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
                  No saved schedule entries found for your teacher account this term.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
