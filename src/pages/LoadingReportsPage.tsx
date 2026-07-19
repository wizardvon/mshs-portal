import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FileCheck2,
  Hourglass,
  Printer,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserRoundCheck,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeDllRequests, subscribeDllSubmissions } from "../services/dllSubmissionService";
import { subscribeCollection } from "../services/firestoreCrud";
import { subscribeMpsRequests, subscribeMpsSubmissions } from "../services/mpsService";
import { subscribeObservationSchedules } from "../services/observationService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeTeachers } from "../services/teacherService";
import { exportPortalWorkbook } from "../services/portalExportService";
import { useAuth } from "../providers/AuthProvider";
import type { UserProfile, UserRole } from "../types";
import type { AcademicTerm, DllRequest, DllSubmission, LoadAssignment, MpsRequest, MpsSubmission, ObservationSchedule, PersonnelAttendanceRecord, Section, Subject, Teacher } from "../types/loading";
import { defaultSchoolYear, defaultTerm, termOptions } from "../types/loading";
import { buildTeacherLoadSummaries } from "../utils/loadCalculations";
import { getRoleLabel, roleOptions } from "../utils/accessControl";

type PrintableColumn<T> = {
  label: string;
  value: (record: T) => string | number;
};

type PrintableSection<T> = {
  title: string;
  rows: T[];
};

type MpsSubjectSummaryRow = {
  subjectId: string;
  subjectName: string;
  gradeLevels: string;
  classCount: number;
  expectedClassCount: number;
  averageMps: number;
};

type MpsGradeSummaryRow = {
  gradeLevel: string;
  classCount: number;
  averageMps: number;
};

type DllSubmissionStatusRow = {
  requestLabel: string;
  teacherName: string;
  subjectName: string;
  status: string;
  submittedAt: string;
  remarks: string;
};

type MpsSubmissionStatusRow = {
  requestLabel: string;
  teacherName: string;
  subjectName: string;
  sectionName: string;
  gradeLevel: string;
  status: string;
  submittedAt: string;
  mps: string;
};

const attendanceStatusLabels: Record<PersonnelAttendanceRecord["status"], string> = {
  present: "Present",
  absent: "Absent",
  official_business: "Official Business",
};

const staffTypeLabels: Record<PersonnelAttendanceRecord["staffType"], string> = {
  teaching: "Teaching",
  non_teaching: "Non-teaching",
};

const dllStatusLabels: Record<DllSubmission["status"], string> = {
  submitted: "Submitted",
  approved: "Approved",
  returned: "Returned",
};

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value?: { toDate?: () => Date }) {
  const date = value?.toDate?.();
  if (!date) return "";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getAverage(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function formatAverage(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function getDllSubmissionKey(requestId: string, teacherId: string, subjectId: string) {
  return `${requestId}:${teacherId}:${subjectId}`;
}

function getMpsSubmissionKey(requestId: string, teacherId: string, subjectId: string, sectionId: string) {
  return `${requestId}:${teacherId}:${subjectId}:${sectionId}`;
}

function getUniqueClassCount(assignments: LoadAssignment[]) {
  return new Set(assignments.map((assignment) => `${assignment.subjectId}:${assignment.sectionId}`)).size;
}

function getRequestTerm(request: DllRequest | MpsRequest, selectedTerm: AcademicTerm | "all") {
  return request.term ?? (selectedTerm === "all" ? defaultTerm : selectedTerm);
}

function printReport<T>(
  title: string,
  subtitle: string,
  summary: Array<{ label: string; value: string | number }>,
  columns: Array<PrintableColumn<T>>,
  rows: T[],
) {
  const summaryHtml = summary
    .map(
      (item) => `
        <div class="summary-card">
          <p>${escapeHtml(item.label)}</p>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `,
    )
    .join("");
  const headerHtml = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const bodyHtml = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              ${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="${columns.length}">No records found.</td></tr>`;
  const reportWindow = window.open("", "_blank", "width=1100,height=800");
  if (!reportWindow) return;

  reportWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #0f172a; font-family: Arial, sans-serif; margin: 28px; }
          h1 { font-size: 22px; margin: 0; }
          .subtitle { color: #475569; font-size: 13px; margin: 8px 0 18px; }
          .summary { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 18px; }
          .summary-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; }
          .summary-card p { color: #475569; font-size: 12px; margin: 0 0 8px; }
          .summary-card strong { font-size: 20px; }
          table { border-collapse: collapse; font-size: 12px; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; font-weight: 700; }
          @media print { body { margin: 18px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        <div class="summary">${summaryHtml}</div>
        <table>
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  reportWindow.document.close();
}

function printSectionedReport<T>(
  title: string,
  subtitle: string,
  summary: Array<{ label: string; value: string | number }>,
  columns: Array<PrintableColumn<T>>,
  sections: Array<PrintableSection<T>>,
) {
  const summaryHtml = summary
    .map(
      (item) => `
        <div class="summary-card">
          <p>${escapeHtml(item.label)}</p>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `,
    )
    .join("");
  const headerHtml = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const totalRows = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const sectionsHtml = sections
    .map((section) => {
      const bodyHtml = section.rows.length
        ? section.rows
            .map(
              (row) => `
                <tr>
                  ${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join("")}
                </tr>
              `,
            )
            .join("")
        : `<tr><td colspan="${columns.length}">No records found.</td></tr>`;

      return `
        <section class="report-section">
          <h2>${escapeHtml(section.title)} (${section.rows.length})</h2>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </section>
      `;
    })
    .join("");
  const reportWindow = window.open("", "_blank", "width=1100,height=800");
  if (!reportWindow) return;

  reportWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #0f172a; font-family: Arial, sans-serif; margin: 28px; }
          h1 { font-size: 22px; margin: 0; }
          h2 { font-size: 16px; margin: 0 0 10px; }
          .subtitle { color: #475569; font-size: 13px; margin: 8px 0 18px; }
          .summary { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 18px; }
          .summary-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; }
          .summary-card p { color: #475569; font-size: 12px; margin: 0 0 8px; }
          .summary-card strong { font-size: 20px; }
          .report-section { margin-top: 18px; page-break-inside: avoid; }
          table { border-collapse: collapse; font-size: 12px; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; font-weight: 700; }
          @media print { body { margin: 18px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        <div class="summary">${summaryHtml}</div>
        ${totalRows ? sectionsHtml : `<p>No records found.</p>`}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  reportWindow.document.close();
}

function printSummaryReport(
  title: string,
  subtitle: string,
  summary: Array<{ label: string; value: string | number }>,
) {
  const rowsHtml = summary
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${escapeHtml(item.value)}</td>
        </tr>
      `,
    )
    .join("");
  const summaryHtml = summary
    .map(
      (item) => `
        <div class="summary-card">
          <p>${escapeHtml(item.label)}</p>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `,
    )
    .join("");
  const reportWindow = window.open("", "_blank", "width=900,height=700");
  if (!reportWindow) return;

  reportWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #0f172a; font-family: Arial, sans-serif; margin: 28px; }
          h1 { font-size: 22px; margin: 0; }
          .subtitle { color: #475569; font-size: 13px; margin: 8px 0 18px; }
          .summary { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 18px; }
          .summary-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; }
          .summary-card p { color: #475569; font-size: 12px; margin: 0 0 8px; }
          .summary-card strong { font-size: 20px; }
          table { border-collapse: collapse; font-size: 13px; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 9px; text-align: left; }
          th { background: #f1f5f9; font-weight: 700; }
          @media print { body { margin: 18px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        <div class="summary">${summaryHtml}</div>
        <table>
          <thead>
            <tr>
              <th>Report Item</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  reportWindow.document.close();
}

export function LoadingReportsPage() {
  const { profile } = useAuth();
  const today = getTodayInputValue();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<PersonnelAttendanceRecord[]>([]);
  const [dllRequests, setDllRequests] = useState<DllRequest[]>([]);
  const [dllSubmissions, setDllSubmissions] = useState<DllSubmission[]>([]);
  const [mpsRequests, setMpsRequests] = useState<MpsRequest[]>([]);
  const [mpsSubmissions, setMpsSubmissions] = useState<MpsSubmission[]>([]);
  const [observationSchedules, setObservationSchedules] = useState<ObservationSchedule[]>([]);
  const [attendanceStartDate, setAttendanceStartDate] = useState(today);
  const [attendanceEndDate, setAttendanceEndDate] = useState(today);
  const [selectedAttendanceStaffId, setSelectedAttendanceStaffId] = useState("");
  const [schoolYear, setSchoolYear] = useState(defaultAcademicSettings.currentSchoolYear);
  const [term, setTerm] = useState<AcademicTerm | "all">(defaultAcademicSettings.currentTerm);
  const [selectedDllTeacherId, setSelectedDllTeacherId] = useState("");
  const [selectedMpsSubjectId, setSelectedMpsSubjectId] = useState("");
  const [selectedObservationTeacherId, setSelectedObservationTeacherId] = useState("");
  const [isExportingPortal, setIsExportingPortal] = useState(false);
  const isSuperAdmin = profile?.role === "super_admin";

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeLoadAssignments(setAssignments), []);
  useEffect(() => subscribeCollection<Section>("sections", setSections), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeCollection<PersonnelAttendanceRecord>("personnelAttendance", setAttendanceRecords), []);
  useEffect(() => subscribeDllRequests(setDllRequests), []);
  useEffect(() => subscribeDllSubmissions(setDllSubmissions), []);
  useEffect(() => subscribeMpsRequests(setMpsRequests), []);
  useEffect(() => subscribeMpsSubmissions(setMpsSubmissions), []);
  useEffect(() => subscribeObservationSchedules(setObservationSchedules), []);
  useEffect(
    () =>
      subscribeAcademicSettings((settings) => {
        setSchoolYear(settings.currentSchoolYear);
        setTerm(settings.currentTerm);
      }),
    [],
  );
  useEffect(() => {
    if (!isSuperAdmin) {
      setUsers([]);
      return undefined;
    }

    return subscribeCollection<UserProfile>("users", setUsers);
  }, [isSuperAdmin]);

  const summaries = buildTeacherLoadSummaries(teachers, assignments, defaultSchoolYear, defaultTerm);
  const teachersById = useMemo(() => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])), [teachers]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]);
  const subjectsById = useMemo(() => new Map(subjects.map((subject) => [subject.subjectId, subject])), [subjects]);
  const approvedUsers = users.filter((user) => user.status === "approved").length;
  const pendingUsers = users.filter((user) => user.status === "pending").length;
  const disabledUsers = users.filter((user) => user.status === "disabled").length;
  const roleCounts = roleOptions.reduce(
    (counts, role) => ({
      ...counts,
      [role.value]: users.filter((user) => user.role === role.value).length,
    }),
    {} as Record<UserRole, number>,
  );
  const primaryRoleCards: Array<{ role: UserRole; icon: LucideIcon }> = [
    { role: "teacher", icon: UsersRound },
    { role: "admin", icon: UserCog },
    { role: "master_teacher", icon: UserRoundCheck },
    { role: "principal", icon: ShieldCheck },
  ];

  const filteredAttendance = useMemo(
    () =>
      attendanceRecords
        .filter((record) => record.attendanceDate >= attendanceStartDate && record.attendanceDate <= attendanceEndDate)
        .sort((first, second) =>
          `${first.attendanceDate} ${first.staffName}`.localeCompare(`${second.attendanceDate} ${second.staffName}`),
        ),
    [attendanceEndDate, attendanceRecords, attendanceStartDate],
  );

  const attendanceSummary = useMemo(
    () => ({
      total: filteredAttendance.length,
      present: filteredAttendance.filter((record) => record.status === "present").length,
      absent: filteredAttendance.filter((record) => record.status === "absent").length,
      officialBusiness: filteredAttendance.filter((record) => record.status === "official_business").length,
      teaching: filteredAttendance.filter((record) => record.staffType === "teaching").length,
      nonTeaching: filteredAttendance.filter((record) => record.staffType === "non_teaching").length,
    }),
    [filteredAttendance],
  );

  const attendanceStaffOptions = useMemo(() => {
    const staffById = new Map<string, PersonnelAttendanceRecord>();

    attendanceRecords.forEach((record) => {
      if (!staffById.has(record.staffId)) {
        staffById.set(record.staffId, record);
      }
    });

    return Array.from(staffById.values()).sort((first, second) => first.staffName.localeCompare(second.staffName));
  }, [attendanceRecords]);

  const selectedStaffRecords = useMemo(
    () =>
      attendanceRecords
        .filter((record) => record.staffId === selectedAttendanceStaffId)
        .sort((first, second) => first.attendanceDate.localeCompare(second.attendanceDate)),
    [attendanceRecords, selectedAttendanceStaffId],
  );

  const selectedStaff = attendanceStaffOptions.find((record) => record.staffId === selectedAttendanceStaffId);

  const selectedStaffSummary = useMemo(
    () => ({
      total: selectedStaffRecords.length,
      present: selectedStaffRecords.filter((record) => record.status === "present").length,
      absent: selectedStaffRecords.filter((record) => record.status === "absent").length,
      officialBusiness: selectedStaffRecords.filter((record) => record.status === "official_business").length,
    }),
    [selectedStaffRecords],
  );

  const filteredDllRequests = useMemo(
    () =>
      dllRequests
        .filter((request) => request.schoolYear === schoolYear)
        .filter((request) => term === "all" || request.term === term)
        .sort((first, second) => first.weekLabel.localeCompare(second.weekLabel)),
    [dllRequests, schoolYear, term],
  );

  const filteredDllSubmissions = useMemo(
    () =>
      dllSubmissions
        .filter((submission) => !submission.archived)
        .filter((submission) => (submission.schoolYear || schoolYear) === schoolYear)
        .filter((submission) => term === "all" || submission.term === term)
        .sort((first, second) => first.teacherName.localeCompare(second.teacherName)),
    [dllSubmissions, schoolYear, term],
  );

  const dllSummary = useMemo(
    () => ({
      requests: filteredDllRequests.length,
      activeRequests: filteredDllRequests.filter((request) => request.status === "active").length,
      submissions: filteredDllSubmissions.length,
      submitted: filteredDllSubmissions.filter((submission) => submission.status === "submitted").length,
      approved: filteredDllSubmissions.filter((submission) => submission.status === "approved").length,
      returned: filteredDllSubmissions.filter((submission) => submission.status === "returned").length,
    }),
    [filteredDllRequests, filteredDllSubmissions],
  );

  const dllTeacherOptions = useMemo(() => {
    const teachersById = new Map<string, DllSubmission>();

    filteredDllSubmissions.forEach((submission) => {
      if (!teachersById.has(submission.teacherId)) {
        teachersById.set(submission.teacherId, submission);
      }
    });

    return Array.from(teachersById.values()).sort((first, second) => first.teacherName.localeCompare(second.teacherName));
  }, [filteredDllSubmissions]);

  const selectedDllTeacherSubmissions = useMemo(
    () =>
      filteredDllSubmissions
        .filter((submission) => submission.teacherId === selectedDllTeacherId)
        .sort((first, second) => {
          const firstDate = first.submittedAt?.toMillis?.() ?? 0;
          const secondDate = second.submittedAt?.toMillis?.() ?? 0;
          return secondDate - firstDate;
        }),
    [filteredDllSubmissions, selectedDllTeacherId],
  );

  const selectedDllTeacher = dllTeacherOptions.find((submission) => submission.teacherId === selectedDllTeacherId);

  const selectedDllTeacherSummary = useMemo(
    () => ({
      submissions: selectedDllTeacherSubmissions.length,
      submitted: selectedDllTeacherSubmissions.filter((submission) => submission.status === "submitted").length,
      approved: selectedDllTeacherSubmissions.filter((submission) => submission.status === "approved").length,
      returned: selectedDllTeacherSubmissions.filter((submission) => submission.status === "returned").length,
      softCopy: selectedDllTeacherSubmissions.filter((submission) => submission.submissionType === "soft_copy").length,
      hardCopy: selectedDllTeacherSubmissions.filter((submission) => submission.submissionType === "hard_copy").length,
    }),
    [selectedDllTeacherSubmissions],
  );

  const dllSubmissionStatusRows = useMemo<DllSubmissionStatusRow[]>(() => {
    const submissionsByKey = new Map(
      filteredDllSubmissions.map((submission) => [
        getDllSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId),
        submission,
      ]),
    );

    return filteredDllRequests.flatMap((request) => {
      const requestTerm = getRequestTerm(request, term);
      const assignmentsForRequest = assignments.filter(
        (assignment) => assignment.schoolYear === request.schoolYear && assignment.term === requestTerm,
      );
      const teacherSubjectKeys = new Set<string>();

      return assignmentsForRequest
        .flatMap((assignment) => {
          const key = getDllSubmissionKey(request.requestId, assignment.teacherId, assignment.subjectId);
          if (teacherSubjectKeys.has(key)) return [];
          teacherSubjectKeys.add(key);

          const submission = submissionsByKey.get(key);
          const teacherName = teachersById.get(assignment.teacherId)?.fullName ?? submission?.teacherName ?? "Unknown teacher";
          const subjectName = subjectsById.get(assignment.subjectId)?.subjectName ?? submission?.subjectName ?? "Unknown subject";

          return [
            {
              requestLabel: request.weekLabel || request.title,
              teacherName,
              subjectName,
              status: submission ? dllStatusLabels[submission.status] : "Not Submitted",
              submittedAt: submission ? formatDateTime(submission.submittedAt) : "",
              remarks: submission?.remarks || "",
            },
          ];
        })
        .sort((first, second) => `${first.requestLabel} ${first.teacherName} ${first.subjectName}`.localeCompare(`${second.requestLabel} ${second.teacherName} ${second.subjectName}`));
    });
  }, [assignments, filteredDllRequests, filteredDllSubmissions, subjectsById, teachersById, term]);

  const filteredMpsRequests = useMemo(
    () =>
      mpsRequests
        .filter((request) => request.schoolYear === schoolYear)
        .filter((request) => term === "all" || request.term === term),
    [mpsRequests, schoolYear, term],
  );

  const filteredMpsSubmissions = useMemo(
    () =>
      mpsSubmissions
        .filter((submission) => submission.schoolYear === schoolYear)
        .filter((submission) => term === "all" || submission.term === term)
        .sort((first, second) => `${first.subjectName} ${first.gradeLevel} ${first.sectionName}`.localeCompare(`${second.subjectName} ${second.gradeLevel} ${second.sectionName}`)),
    [mpsSubmissions, schoolYear, term],
  );

  const mpsSubjectSummaryRows = useMemo<MpsSubjectSummaryRow[]>(() => {
    const grouped = new Map<string, MpsSubmission[]>();
    const expectedClassCounts = new Map<string, number>();

    assignments
      .filter((assignment) => assignment.schoolYear === schoolYear)
      .filter((assignment) => term === "all" || assignment.term === term)
      .forEach((assignment) => {
        expectedClassCounts.set(
          assignment.subjectId,
          getUniqueClassCount(
            assignments.filter(
              (item) =>
                item.schoolYear === schoolYear &&
                item.subjectId === assignment.subjectId &&
                (term === "all" || item.term === term),
            ),
          ),
        );
      });

    filteredMpsSubmissions.forEach((submission) => {
      grouped.set(submission.subjectId, [...(grouped.get(submission.subjectId) ?? []), submission]);
    });

    return Array.from(grouped.entries())
      .map(([subjectId, records]) => ({
        subjectId,
        subjectName: records[0].subjectName,
        gradeLevels: Array.from(new Set(records.map((record) => record.gradeLevel))).sort().join(", "),
        classCount: records.length,
        expectedClassCount: expectedClassCounts.get(subjectId) ?? records.length,
        averageMps: getAverage(records.map((record) => Number(record.mps || 0))),
      }))
      .sort((first, second) => first.subjectName.localeCompare(second.subjectName));
  }, [assignments, filteredMpsSubmissions, schoolYear, term]);

  const mpsGradeSummaryRows = useMemo<MpsGradeSummaryRow[]>(() => {
    const grouped = new Map<string, MpsSubmission[]>();

    filteredMpsSubmissions.forEach((submission) => {
      grouped.set(submission.gradeLevel, [...(grouped.get(submission.gradeLevel) ?? []), submission]);
    });

    return Array.from(grouped.entries())
      .map(([gradeLevel, records]) => ({
        gradeLevel,
        classCount: records.length,
        averageMps: getAverage(records.map((record) => Number(record.mps || 0))),
      }))
      .sort((first, second) => first.gradeLevel.localeCompare(second.gradeLevel));
  }, [filteredMpsSubmissions]);

  const mpsSummary = useMemo(
    () => ({
      requests: filteredMpsRequests.length,
      activeRequests: filteredMpsRequests.filter((request) => request.status === "active").length,
      submissions: filteredMpsSubmissions.length,
      subjects: mpsSubjectSummaryRows.length,
      overallAverage: getAverage(filteredMpsSubmissions.map((submission) => Number(submission.mps || 0))),
    }),
    [filteredMpsRequests, filteredMpsSubmissions, mpsSubjectSummaryRows.length],
  );

  const selectedMpsSubjectRecords = useMemo(
    () =>
      filteredMpsSubmissions
        .filter((submission) => submission.subjectId === selectedMpsSubjectId)
        .sort((first, second) => `${first.gradeLevel} ${first.sectionName}`.localeCompare(`${second.gradeLevel} ${second.sectionName}`)),
    [filteredMpsSubmissions, selectedMpsSubjectId],
  );

  const selectedMpsSubject = mpsSubjectSummaryRows.find((subject) => subject.subjectId === selectedMpsSubjectId);

  const selectedMpsSubjectSummary = useMemo(
    () => ({
      classes: selectedMpsSubjectRecords.length,
      expectedClasses: selectedMpsSubject?.expectedClassCount ?? selectedMpsSubjectRecords.length,
      gradeLevels: Array.from(new Set(selectedMpsSubjectRecords.map((record) => record.gradeLevel))).sort().join(", ") || "-",
      averageMps: getAverage(selectedMpsSubjectRecords.map((record) => Number(record.mps || 0))),
    }),
    [selectedMpsSubject?.expectedClassCount, selectedMpsSubjectRecords],
  );

  const mpsSubmissionStatusRows = useMemo<MpsSubmissionStatusRow[]>(() => {
    const submissionsByKey = new Map(
      filteredMpsSubmissions.map((submission) => [
        getMpsSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId, submission.sectionId),
        submission,
      ]),
    );

    return filteredMpsRequests.flatMap((request) => {
      const assignmentsForRequest = assignments.filter(
        (assignment) => assignment.schoolYear === request.schoolYear && assignment.term === request.term,
      );

      return assignmentsForRequest
        .map((assignment) => {
          const submission = submissionsByKey.get(
            getMpsSubmissionKey(request.requestId, assignment.teacherId, assignment.subjectId, assignment.sectionId),
          );
          const teacherName = teachersById.get(assignment.teacherId)?.fullName ?? submission?.teacherName ?? "Unknown teacher";
          const subjectName = subjectsById.get(assignment.subjectId)?.subjectName ?? submission?.subjectName ?? "Unknown subject";
          const sectionName = submission?.sectionName ?? sectionsById.get(assignment.sectionId)?.sectionName ?? assignment.sectionId;

          return {
            requestLabel: request.testName || request.title,
            teacherName,
            subjectName,
            sectionName,
            gradeLevel: assignment.gradeLevel,
            status: submission ? "Submitted" : "Not Submitted",
            submittedAt: submission ? formatDateTime(submission.submittedAt) : "",
            mps: submission ? formatAverage(submission.mps) : "",
          };
        })
        .sort((first, second) => `${first.requestLabel} ${first.teacherName} ${first.subjectName} ${first.sectionName}`.localeCompare(`${second.requestLabel} ${second.teacherName} ${second.subjectName} ${second.sectionName}`));
    });
  }, [assignments, filteredMpsRequests, filteredMpsSubmissions, sectionsById, subjectsById, teachersById]);

  const filteredObservationSchedules = useMemo(
    () =>
      observationSchedules
        .filter((schedule) => schedule.schoolYear === schoolYear)
        .filter((schedule) => term === "all" || schedule.term === term)
        .sort((first, second) => `${first.scheduleDate} ${first.startTime}`.localeCompare(`${second.scheduleDate} ${second.startTime}`)),
    [observationSchedules, schoolYear, term],
  );

  const observationSummary = useMemo(
    () => ({
      total: filteredObservationSchedules.length,
      scheduled: filteredObservationSchedules.filter((schedule) => schedule.status === "scheduled").length,
      done: filteredObservationSchedules.filter((schedule) => schedule.status === "done").length,
      cancelled: filteredObservationSchedules.filter((schedule) => schedule.status === "cancelled").length,
      classroomObservation: filteredObservationSchedules.filter((schedule) => schedule.activityType === "classroom_observation").length,
      coachingMentoring: filteredObservationSchedules.filter((schedule) => schedule.activityType === "coaching_mentoring").length,
    }),
    [filteredObservationSchedules],
  );

  const observationTeacherOptions = useMemo(() => {
    const teachersById = new Map<string, ObservationSchedule>();
    filteredObservationSchedules.forEach((schedule) => {
      if (!teachersById.has(schedule.teacherId)) {
        teachersById.set(schedule.teacherId, schedule);
      }
    });
    return Array.from(teachersById.values()).sort((first, second) => first.teacherName.localeCompare(second.teacherName));
  }, [filteredObservationSchedules]);

  const selectedObservationTeacherRecords = useMemo(
    () => filteredObservationSchedules.filter((schedule) => schedule.teacherId === selectedObservationTeacherId),
    [filteredObservationSchedules, selectedObservationTeacherId],
  );

  const selectedObservationTeacher = observationTeacherOptions.find((schedule) => schedule.teacherId === selectedObservationTeacherId);

  const selectedObservationTeacherSummary = useMemo(
    () => ({
      total: selectedObservationTeacherRecords.length,
      scheduled: selectedObservationTeacherRecords.filter((schedule) => schedule.status === "scheduled").length,
      done: selectedObservationTeacherRecords.filter((schedule) => schedule.status === "done").length,
      classroomObservationDone: selectedObservationTeacherRecords.filter((schedule) => schedule.activityType === "classroom_observation" && schedule.status === "done").length,
      coachingMentoringDone: selectedObservationTeacherRecords.filter((schedule) => schedule.activityType === "coaching_mentoring" && schedule.status === "done").length,
    }),
    [selectedObservationTeacherRecords],
  );

  const termLabel = term === "all" ? "All terms" : term;

  function getAttendanceSummaryItems(summary: typeof attendanceSummary | typeof selectedStaffSummary) {
    return [
      { label: "Total Records", value: summary.total },
      { label: "Present", value: summary.present },
      { label: "Absent", value: summary.absent },
      { label: "Official Business", value: summary.officialBusiness },
      ...("teaching" in summary
        ? [
            { label: "Teaching Personnel", value: summary.teaching },
            { label: "Non-teaching Personnel", value: summary.nonTeaching },
          ]
        : []),
    ];
  }

  function getDllSummaryItems(summary: typeof dllSummary | typeof selectedDllTeacherSummary) {
    return [
      ...("requests" in summary
        ? [
            { label: "DLL Requests", value: summary.requests },
            { label: "Active Requests", value: summary.activeRequests },
          ]
        : []),
      { label: "Submissions", value: summary.submissions },
      { label: "Submitted", value: summary.submitted },
      { label: "Approved", value: summary.approved },
      { label: "Returned", value: summary.returned },
      ...("softCopy" in summary
        ? [
            { label: "Soft Copy", value: summary.softCopy },
            { label: "Hard Copy", value: summary.hardCopy },
          ]
        : []),
    ];
  }

  function getMpsSummaryItems() {
    return [
      { label: "MPS Requests", value: mpsSummary.requests },
      { label: "Active Requests", value: mpsSummary.activeRequests },
      { label: "MPS Records", value: mpsSummary.submissions },
      { label: "Subjects Averaged", value: mpsSummary.subjects },
      { label: "Overall Average", value: formatAverage(mpsSummary.overallAverage) },
      ...mpsGradeSummaryRows.map((row) => ({
        label: `${row.gradeLevel} Average`,
        value: `${formatAverage(row.averageMps)} (${row.classCount} class${row.classCount === 1 ? "" : "es"})`,
      })),
    ];
  }

  function getObservationSummaryItems(summary: typeof observationSummary | typeof selectedObservationTeacherSummary) {
    return [
      { label: "Total Records", value: summary.total },
      { label: "Scheduled/Pending", value: summary.scheduled },
      { label: "Done", value: summary.done },
      ...("cancelled" in summary
        ? [
            { label: "Cancelled", value: summary.cancelled },
            { label: "Classroom Observation", value: summary.classroomObservation },
            { label: "Coaching/Mentoring", value: summary.coachingMentoring },
          ]
        : [
            { label: "Classroom Observation Done", value: summary.classroomObservationDone },
            { label: "Coaching/Mentoring Done", value: summary.coachingMentoringDone },
          ]),
    ];
  }

  function printAttendanceSummary() {
    printSummaryReport(
      "Personnel Attendance Summary",
      `Attendance dates: ${attendanceStartDate} to ${attendanceEndDate}`,
      getAttendanceSummaryItems(attendanceSummary),
    );
  }

  function printAttendanceByStaff() {
    if (!selectedStaff) {
      window.alert("Select a personnel first.");
      return;
    }

    printReport(
      `${selectedStaff.staffName} Attendance Report`,
      `${staffTypeLabels[selectedStaff.staffType]} | ${selectedStaff.roleOrPosition} | Complete attendance records`,
      getAttendanceSummaryItems(selectedStaffSummary),
      [
        { label: "Date", value: (record) => record.attendanceDate },
        { label: "Status", value: (record) => attendanceStatusLabels[record.status] },
        { label: "Remarks", value: (record) => record.remarks || "" },
        { label: "Recorded By", value: (record) => record.recorderName },
      ],
      selectedStaffRecords,
    );
  }

  function printDllSummary() {
    printSummaryReport(
      "DLL Submission Summary",
      `School year: ${schoolYear} | Term: ${termLabel}`,
      getDllSummaryItems(dllSummary),
    );
  }

  function printDllSubmissionStatus() {
    const submittedRows = dllSubmissionStatusRows.filter((row) => row.status !== "Not Submitted");
    const notSubmittedRows = dllSubmissionStatusRows.filter((row) => row.status === "Not Submitted");

    printSectionedReport(
      "DLL Teacher Submission Status",
      `School year: ${schoolYear} | Term: ${termLabel} | Submitted and not submitted DLL requirements`,
      [
        { label: "Required Rows", value: dllSubmissionStatusRows.length },
        { label: "Submitted", value: submittedRows.length },
        { label: "Not Submitted", value: notSubmittedRows.length },
      ],
      [
        { label: "Request", value: (record) => record.requestLabel },
        { label: "Teacher", value: (record) => record.teacherName },
        { label: "Subject", value: (record) => record.subjectName },
        { label: "Status", value: (record) => record.status },
        { label: "Submitted At", value: (record) => record.submittedAt },
        { label: "Remarks", value: (record) => record.remarks },
      ],
      [
        { title: "Submitted DLL Requirements", rows: submittedRows },
        { title: "Not Submitted DLL Requirements", rows: notSubmittedRows },
      ],
    );
  }

  function printDllByTeacher() {
    if (!selectedDllTeacher) {
      window.alert("Select a teacher first.");
      return;
    }

    printReport(
      `${selectedDllTeacher.teacherName} DLL Submission Report`,
      `School year: ${schoolYear} | Term: ${termLabel} | Complete DLL submission records`,
      getDllSummaryItems(selectedDllTeacherSummary),
      [
        { label: "Subject", value: (record) => record.subjectName },
        { label: "School Year", value: (record) => record.schoolYear || schoolYear },
        { label: "Term", value: (record) => record.term || "" },
        { label: "Type", value: (record) => (record.submissionType === "soft_copy" ? "Soft Copy" : "Hard Copy") },
        { label: "Submitted To / Link", value: (record) => (record.submissionType === "soft_copy" ? record.link || "" : record.submittedTo || "") },
        { label: "Status", value: (record) => dllStatusLabels[record.status] },
        { label: "Submitted At", value: (record) => formatDateTime(record.submittedAt) },
        { label: "Remarks", value: (record) => record.remarks || "" },
      ],
      selectedDllTeacherSubmissions,
    );
  }

  function printMpsSummary() {
    printReport(
      "MPS Subject Summary",
      `School year: ${schoolYear} | Term: ${termLabel}`,
      getMpsSummaryItems(),
      [
        { label: "Subject", value: (record) => record.subjectName },
        { label: "Grade Level", value: (record) => record.gradeLevels },
        { label: "No. of Classes", value: (record) => `${record.classCount}/${record.expectedClassCount}` },
        { label: "Average MPS", value: (record) => formatAverage(record.averageMps) },
      ],
      mpsSubjectSummaryRows,
    );
  }

  function printMpsSubmissionStatus() {
    const submittedRows = mpsSubmissionStatusRows.filter((row) => row.status === "Submitted");
    const notSubmittedRows = mpsSubmissionStatusRows.filter((row) => row.status === "Not Submitted");

    printSectionedReport(
      "MPS Teacher Submission Status",
      `School year: ${schoolYear} | Term: ${termLabel} | Submitted and not submitted MPS requirements`,
      [
        { label: "Required Rows", value: mpsSubmissionStatusRows.length },
        { label: "Submitted", value: submittedRows.length },
        { label: "Not Submitted", value: notSubmittedRows.length },
      ],
      [
        { label: "Request", value: (record) => record.requestLabel },
        { label: "Teacher", value: (record) => record.teacherName },
        { label: "Subject", value: (record) => record.subjectName },
        { label: "Class", value: (record) => record.sectionName },
        { label: "Grade Level", value: (record) => record.gradeLevel },
        { label: "Status", value: (record) => record.status },
        { label: "MPS", value: (record) => record.mps },
        { label: "Submitted At", value: (record) => record.submittedAt },
      ],
      [
        { title: "Submitted MPS Requirements", rows: submittedRows },
        { title: "Not Submitted MPS Requirements", rows: notSubmittedRows },
      ],
    );
  }

  function printMpsBySubject() {
    if (!selectedMpsSubject) {
      window.alert("Select a subject first.");
      return;
    }

    printReport(
      `${selectedMpsSubject.subjectName} MPS Report`,
      `School year: ${schoolYear} | Term: ${termLabel} | Grade level: ${selectedMpsSubjectSummary.gradeLevels}`,
      [
        { label: "Classes", value: `${selectedMpsSubjectSummary.classes}/${selectedMpsSubjectSummary.expectedClasses}` },
        { label: "Grade Level", value: selectedMpsSubjectSummary.gradeLevels },
        { label: "Average MPS", value: formatAverage(selectedMpsSubjectSummary.averageMps) },
      ],
      [
        { label: "Teacher", value: (record) => record.teacherName },
        { label: "Class", value: (record) => record.sectionName },
        { label: "Grade Level", value: (record) => record.gradeLevel },
        { label: "MPS", value: (record) => formatAverage(record.mps) },
        { label: "Least Mastered Competency", value: (record) => record.leastMasteredCompetency },
        { label: "Planned Intervention", value: (record) => record.plannedIntervention || "" },
      ],
      selectedMpsSubjectRecords,
    );
  }

  function printObservationSummary() {
    printSummaryReport(
      "Observation, Coaching, and Mentoring Summary",
      `School year: ${schoolYear} | Term: ${termLabel}`,
      getObservationSummaryItems(observationSummary),
    );
  }

  function printObservationByTeacher() {
    if (!selectedObservationTeacher) {
      window.alert("Select a teacher first.");
      return;
    }

    printReport(
      `${selectedObservationTeacher.teacherName} Observation and Coaching Report`,
      `School year: ${schoolYear} | Term: ${termLabel}`,
      getObservationSummaryItems(selectedObservationTeacherSummary),
      [
        { label: "Date", value: (record) => record.scheduleDate },
        { label: "Time", value: (record) => `${record.day}, ${record.startTime}-${record.endTime}` },
        { label: "Activity", value: (record) => record.activityType === "classroom_observation" ? `Classroom Observation - ${record.observationType || ""}` : "Coaching/Mentoring" },
        { label: "Class / Subject", value: (record) => `${record.sectionName || ""} ${record.subjectName || ""}`.trim() },
        { label: "Observer", value: (record) => record.observerName },
        { label: "Status", value: (record) => record.status },
        { label: "Notes", value: (record) => record.notes || "" },
      ],
      selectedObservationTeacherRecords,
    );
  }

  async function exportAllPortalData() {
    setIsExportingPortal(true);

    try {
      const result = await exportPortalWorkbook();
      if (result.errorCount > 0) {
        window.alert(`Export completed, but ${result.errorCount} collection${result.errorCount === 1 ? "" : "s"} could not be read. Check the export_errors sheet in the workbook.`);
      }
    } catch (caught) {
      console.error(caught);
      window.alert(caught instanceof Error ? caught.message : "Unable to export portal data.");
    } finally {
      setIsExportingPortal(false);
    }
  }

  return (
    <section>
      <PageHeader
        actions={
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isExportingPortal}
            onClick={() => void exportAllPortalData()}
            type="button"
          >
            <FileSpreadsheet size={16} /> {isExportingPortal ? "Exporting..." : "Export All Data"}
          </button>
        }
        description="View loading, user, attendance, DLL submission, and MPS summaries."
        title="Reports"
      />
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={BarChart3} label="Assignments" value={assignments.length} />
        <SummaryCard icon={Clock} label="Under Teaching Load" value={summaries.filter((row) => row.status === "Under Teaching Load").length} />
        <SummaryCard icon={CheckCircle2} label="Normal / Full Teaching Load" value={summaries.filter((row) => row.status === "Normal Teaching Load" || row.status === "Full Teaching Load").length} />
        <SummaryCard icon={AlertTriangle} label="Over Teaching Load" value={summaries.filter((row) => row.status === "Over Teaching Load").length} />
      </div>

      {isSuperAdmin && (
        <>
          <h2 className="mt-6 text-sm font-semibold text-slate-950">User Reports</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={UsersRound} label="Total Users" value={users.length} detail={`${approvedUsers} approved`} />
            <SummaryCard icon={Clock} label="Pending Users" value={pendingUsers} detail="awaiting approval" />
            <SummaryCard icon={UserCheck} label="Approved Users" value={approvedUsers} detail={`${disabledUsers} disabled`} />
            <SummaryCard icon={ShieldCheck} label="Super Admin" value={roleCounts.super_admin} detail="full access users" />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {primaryRoleCards.map(({ role, icon }) => (
              <SummaryCard
                detail="registered accounts"
                icon={icon}
                key={role}
                label={getRoleLabel(role)}
                value={roleCounts[role]}
              />
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 text-right font-semibold">No. of Users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {roleOptions.map((role) => (
                  <tr key={role.value}>
                    <td className="px-4 py-3 font-medium text-slate-900">{role.label}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">{roleCounts[role.value]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Attendance Summary</h2>
            <p className="mt-1 text-sm text-slate-500">Teaching and non-teaching personnel attendance by date range.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setAttendanceStartDate(event.target.value)}
              type="date"
              value={attendanceStartDate}
            />
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setAttendanceEndDate(event.target.value)}
              type="date"
              value={attendanceEndDate}
            />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90"
              onClick={printAttendanceSummary}
              type="button"
            >
              <Printer size={16} /> Print Summary
            </button>
            <select
              className="h-10 min-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setSelectedAttendanceStaffId(event.target.value)}
              value={selectedAttendanceStaffId}
            >
              <option value="">Select personnel</option>
              {attendanceStaffOptions.map((record) => (
                <option key={record.staffId} value={record.staffId}>
                  {record.staffName}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedAttendanceStaffId}
              onClick={printAttendanceByStaff}
              type="button"
            >
              <Printer size={16} /> Print Per Teacher
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard detail="saved attendance rows" icon={ClipboardList} label="Records" value={attendanceSummary.total} />
          <SummaryCard detail="present for duty" icon={CheckCircle2} label="Present" value={attendanceSummary.present} />
          <SummaryCard detail="not present" icon={XCircle} label="Absent" value={attendanceSummary.absent} />
          <SummaryCard detail="official business" icon={BriefcaseBusiness} label="Official Business" value={attendanceSummary.officialBusiness} />
          <SummaryCard detail="teaching personnel" icon={CalendarDays} label="Teaching" value={attendanceSummary.teaching} />
          <SummaryCard detail="non-teaching personnel" icon={CalendarDays} label="Non-teaching" value={attendanceSummary.nonTeaching} />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">DLL Submission Summary</h2>
            <p className="mt-1 text-sm text-slate-500">DLL requests and submitted DLL records by school year and term.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setSchoolYear(event.target.value)}
              placeholder="School year"
              value={schoolYear}
            />
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setTerm(event.target.value as AcademicTerm | "all")}
              value={term}
            >
              <option value="all">All Terms</option>
              {termOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90"
              onClick={printDllSummary}
              type="button"
            >
              <Printer size={16} /> Print Summary
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={printDllSubmissionStatus}
              type="button"
            >
              <Printer size={16} /> Print Submission Status
            </button>
            <select
              className="h-10 min-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setSelectedDllTeacherId(event.target.value)}
              value={selectedDllTeacherId}
            >
              <option value="">Select teacher</option>
              {dllTeacherOptions.map((submission) => (
                <option key={submission.teacherId} value={submission.teacherId}>
                  {submission.teacherName}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedDllTeacherId}
              onClick={printDllByTeacher}
              type="button"
            >
              <Printer size={16} /> Print Per Teacher
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard detail="matching requests" icon={FileCheck2} label="DLL Requests" value={dllSummary.requests} />
          <SummaryCard detail="still open" icon={Hourglass} label="Active Requests" value={dllSummary.activeRequests} />
          <SummaryCard detail="submitted rows" icon={ClipboardList} label="Submissions" value={dllSummary.submissions} />
          <SummaryCard detail="for review" icon={CheckCircle2} label="Submitted" value={dllSummary.submitted} />
          <SummaryCard detail="approved records" icon={BadgeCheck} label="Approved" value={dllSummary.approved} />
          <SummaryCard detail="returned records" icon={XCircle} label="Returned" value={dllSummary.returned} />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">MPS Summary</h2>
            <p className="mt-1 text-sm text-slate-500">MPS averages by subject and grade level for the selected school year and term.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setSchoolYear(event.target.value)}
              placeholder="School year"
              value={schoolYear}
            />
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setTerm(event.target.value as AcademicTerm | "all")}
              value={term}
            >
              <option value="all">All Terms</option>
              {termOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90"
              onClick={printMpsSummary}
              type="button"
            >
              <Printer size={16} /> Print Summary
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={printMpsSubmissionStatus}
              type="button"
            >
              <Printer size={16} /> Print Submission Status
            </button>
            <select
              className="h-10 min-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setSelectedMpsSubjectId(event.target.value)}
              value={selectedMpsSubjectId}
            >
              <option value="">Select subject</option>
              {mpsSubjectSummaryRows.map((subject) => (
                <option key={subject.subjectId} value={subject.subjectId}>
                  {subject.subjectName}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedMpsSubjectId}
              onClick={printMpsBySubject}
              type="button"
            >
              <Printer size={16} /> Print Per Subject
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard detail="matching requests" icon={FileCheck2} label="MPS Requests" value={mpsSummary.requests} />
          <SummaryCard detail="still open" icon={Hourglass} label="Active Requests" value={mpsSummary.activeRequests} />
          <SummaryCard detail="submitted rows" icon={ClipboardList} label="MPS Records" value={mpsSummary.submissions} />
          <SummaryCard detail="same subjects combined" icon={BarChart3} label="Subjects Averaged" value={mpsSummary.subjects} />
          <SummaryCard detail="all MPS records" icon={BarChart3} label="Overall Average" value={formatAverage(mpsSummary.overallAverage)} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {mpsGradeSummaryRows.map((row) => (
            <SummaryCard
              detail={`${row.classCount} class${row.classCount === 1 ? "" : "es"}`}
              icon={BarChart3}
              key={row.gradeLevel}
              label={`${row.gradeLevel} Average`}
              value={formatAverage(row.averageMps)}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Observation & Coaching Summary</h2>
            <p className="mt-1 text-sm text-slate-500">Classroom observation, coaching, and mentoring records by school year and term.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setSchoolYear(event.target.value)}
              placeholder="School year"
              value={schoolYear}
            />
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setTerm(event.target.value as AcademicTerm | "all")}
              value={term}
            >
              <option value="all">All Terms</option>
              {termOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90"
              onClick={printObservationSummary}
              type="button"
            >
              <Printer size={16} /> Print Summary
            </button>
            <select
              className="h-10 min-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setSelectedObservationTeacherId(event.target.value)}
              value={selectedObservationTeacherId}
            >
              <option value="">Select teacher</option>
              {observationTeacherOptions.map((schedule) => (
                <option key={schedule.teacherId} value={schedule.teacherId}>
                  {schedule.teacherName}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedObservationTeacherId}
              onClick={printObservationByTeacher}
              type="button"
            >
              <Printer size={16} /> Print Per Teacher
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard detail="all matching rows" icon={ClipboardList} label="Records" value={observationSummary.total} />
          <SummaryCard detail="not yet done" icon={Hourglass} label="Scheduled/Pending" value={observationSummary.scheduled} />
          <SummaryCard detail="completed rows" icon={CheckCircle2} label="Done" value={observationSummary.done} />
          <SummaryCard detail="cancelled rows" icon={XCircle} label="Cancelled" value={observationSummary.cancelled} />
          <SummaryCard detail="all CO types" icon={FileCheck2} label="Classroom Observation" value={observationSummary.classroomObservation} />
          <SummaryCard detail="coaching or mentoring" icon={UserRoundCheck} label="Coaching/Mentoring" value={observationSummary.coachingMentoring} />
        </div>
      </div>
    </section>
  );
}
