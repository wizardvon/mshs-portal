import {
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Hourglass,
  Printer,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { subscribeDllRequests, subscribeDllSubmissions } from "../services/dllSubmissionService";
import { subscribeCollection } from "../services/firestoreCrud";
import { subscribeMpsRequests, subscribeMpsSubmissions } from "../services/mpsService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import type { AcademicTerm, DllRequest, DllSubmission, MpsRequest, MpsSubmission, PersonnelAttendanceRecord } from "../types/loading";
import { termOptions } from "../types/loading";

type PrintableColumn<T> = {
  label: string;
  value: (record: T) => string | number;
};

type MpsSubjectSummaryRow = {
  subjectId: string;
  subjectName: string;
  gradeLevels: string;
  classCount: number;
  averageMps: number;
  leastMasteredCompetencies: string;
  plannedInterventions: string;
};

type MpsGradeSummaryRow = {
  gradeLevel: string;
  classCount: number;
  averageMps: number;
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

function joinUnique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join("; ");
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
          @media print {
            body { margin: 18px; }
            .summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          }
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

export function ReportsPage() {
  const today = getTodayInputValue();
  const [attendanceStartDate, setAttendanceStartDate] = useState(today);
  const [attendanceEndDate, setAttendanceEndDate] = useState(today);
  const [schoolYear, setSchoolYear] = useState(defaultAcademicSettings.currentSchoolYear);
  const [term, setTerm] = useState<AcademicTerm | "all">(defaultAcademicSettings.currentTerm);
  const [attendanceRecords, setAttendanceRecords] = useState<PersonnelAttendanceRecord[]>([]);
  const [dllRequests, setDllRequests] = useState<DllRequest[]>([]);
  const [dllSubmissions, setDllSubmissions] = useState<DllSubmission[]>([]);
  const [mpsRequests, setMpsRequests] = useState<MpsRequest[]>([]);
  const [mpsSubmissions, setMpsSubmissions] = useState<MpsSubmission[]>([]);

  useEffect(() => subscribeCollection<PersonnelAttendanceRecord>("personnelAttendance", setAttendanceRecords), []);
  useEffect(() => subscribeDllRequests(setDllRequests), []);
  useEffect(() => subscribeDllSubmissions(setDllSubmissions), []);
  useEffect(() => subscribeMpsRequests(setMpsRequests), []);
  useEffect(() => subscribeMpsSubmissions(setMpsSubmissions), []);
  useEffect(
    () =>
      subscribeAcademicSettings((settings) => {
        setSchoolYear(settings.currentSchoolYear);
        setTerm(settings.currentTerm);
      }),
    [],
  );

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
        .sort((first, second) => `${first.subjectName} ${first.gradeLevel}`.localeCompare(`${second.subjectName} ${second.gradeLevel}`)),
    [mpsSubmissions, schoolYear, term],
  );

  const mpsSubjectSummaryRows = useMemo<MpsSubjectSummaryRow[]>(() => {
    const grouped = new Map<string, MpsSubmission[]>();
    filteredMpsSubmissions.forEach((submission) => {
      grouped.set(submission.subjectId, [...(grouped.get(submission.subjectId) ?? []), submission]);
    });

    return Array.from(grouped.entries())
      .map(([subjectId, records]) => ({
        subjectId,
        subjectName: records[0].subjectName,
        gradeLevels: Array.from(new Set(records.map((record) => record.gradeLevel))).sort().join(", "),
        classCount: records.length,
        averageMps: getAverage(records.map((record) => Number(record.mps || 0))),
        leastMasteredCompetencies: joinUnique(records.map((record) => record.leastMasteredCompetency)),
        plannedInterventions: joinUnique(records.map((record) => record.plannedIntervention)) || "No intervention encoded",
      }))
      .sort((first, second) => first.subjectName.localeCompare(second.subjectName));
  }, [filteredMpsSubmissions]);

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

  const termLabel = term === "all" ? "All terms" : term;

  function printAttendanceSummary() {
    printReport(
      "Personnel Attendance Summary",
      `Attendance dates: ${attendanceStartDate} to ${attendanceEndDate}`,
      [
        { label: "Total Records", value: attendanceSummary.total },
        { label: "Present", value: attendanceSummary.present },
        { label: "Absent", value: attendanceSummary.absent },
        { label: "Official Business", value: attendanceSummary.officialBusiness },
        { label: "Teaching", value: attendanceSummary.teaching },
        { label: "Non-teaching", value: attendanceSummary.nonTeaching },
      ],
      [
        { label: "Date", value: (record) => record.attendanceDate },
        { label: "Personnel", value: (record) => record.staffName },
        { label: "Role / Position", value: (record) => record.roleOrPosition },
        { label: "Type", value: (record) => staffTypeLabels[record.staffType] },
        { label: "Status", value: (record) => attendanceStatusLabels[record.status] },
        { label: "Remarks", value: (record) => record.remarks || "" },
      ],
      filteredAttendance,
    );
  }

  function printDllSummary() {
    printReport(
      "DLL Submission Summary",
      `School year: ${schoolYear} | Term: ${termLabel}`,
      [
        { label: "DLL Requests", value: dllSummary.requests },
        { label: "Active Requests", value: dllSummary.activeRequests },
        { label: "Submissions", value: dllSummary.submissions },
        { label: "Submitted", value: dllSummary.submitted },
        { label: "Approved", value: dllSummary.approved },
        { label: "Returned", value: dllSummary.returned },
      ],
      [
        { label: "Teacher", value: (record) => record.teacherName },
        { label: "Subject", value: (record) => record.subjectName },
        { label: "School Year", value: (record) => record.schoolYear || schoolYear },
        { label: "Term", value: (record) => record.term || "" },
        { label: "Type", value: (record) => (record.submissionType === "soft_copy" ? "Soft Copy" : "Hard Copy") },
        { label: "Status", value: (record) => dllStatusLabels[record.status] },
        { label: "Submitted At", value: (record) => formatDateTime(record.submittedAt) },
        { label: "Remarks", value: (record) => record.remarks || "" },
      ],
      filteredDllSubmissions,
    );
  }

  function printMpsSummary() {
    printReport(
      "MPS Subject Summary",
      `School year: ${schoolYear} | Term: ${termLabel}`,
      [
        { label: "MPS Requests", value: mpsSummary.requests },
        { label: "Active Requests", value: mpsSummary.activeRequests },
        { label: "MPS Records", value: mpsSummary.submissions },
        { label: "Subjects Averaged", value: mpsSummary.subjects },
        { label: "Overall Average", value: formatAverage(mpsSummary.overallAverage) },
        ...mpsGradeSummaryRows.map((row) => ({
          label: `${row.gradeLevel} Average`,
          value: `${formatAverage(row.averageMps)} (${row.classCount})`,
        })),
      ],
      [
        { label: "Subject", value: (record) => record.subjectName },
        { label: "Grade Level", value: (record) => record.gradeLevels },
        { label: "No. of Classes", value: (record) => record.classCount },
        { label: "Average MPS", value: (record) => formatAverage(record.averageMps) },
        { label: "Least Mastered Competencies", value: (record) => record.leastMasteredCompetencies || "-" },
        { label: "Planned Interventions", value: (record) => record.plannedInterventions || "-" },
      ],
      mpsSubjectSummaryRows,
    );
  }

  return (
    <section>
      <PageHeader
        description="View and print personnel attendance, DLL submission, and MPS summaries."
        title="Reports"
      />

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
              <Printer size={16} /> Print
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

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Personnel</th>
                <th className="px-4 py-3 font-semibold">Role / Position</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredAttendance.map((record) => (
                <tr key={record.attendanceId}>
                  <td className="px-4 py-3">{record.attendanceDate}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">{record.staffName}</td>
                  <td className="px-4 py-3">{record.roleOrPosition}</td>
                  <td className="px-4 py-3">{staffTypeLabels[record.staffType]}</td>
                  <td className="px-4 py-3">{attendanceStatusLabels[record.status]}</td>
                  <td className="px-4 py-3">{record.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAttendance.length === 0 && (
            <div className="p-5 text-sm text-slate-600">No attendance records found for the selected dates.</div>
          )}
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
              <Printer size={16} /> Print
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

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Teacher</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">School Year</th>
                <th className="px-4 py-3 font-semibold">Term</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Submitted At</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredDllSubmissions.map((record) => (
                <tr key={record.submissionId}>
                  <td className="px-4 py-3 font-medium text-slate-950">{record.teacherName}</td>
                  <td className="px-4 py-3">{record.subjectName}</td>
                  <td className="px-4 py-3">{record.schoolYear || schoolYear}</td>
                  <td className="px-4 py-3">{record.term || "-"}</td>
                  <td className="px-4 py-3">{record.submissionType === "soft_copy" ? "Soft Copy" : "Hard Copy"}</td>
                  <td className="px-4 py-3">{dllStatusLabels[record.status]}</td>
                  <td className="px-4 py-3">{formatDateTime(record.submittedAt) || "-"}</td>
                  <td className="px-4 py-3">{record.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredDllSubmissions.length === 0 && (
            <div className="p-5 text-sm text-slate-600">No DLL submissions found for the selected school year and term.</div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">MPS Subject Summary</h2>
            <p className="mt-1 text-sm text-slate-500">Mean Percentage Score averages by subject, grade level, school year, and term.</p>
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
              <Printer size={16} /> Print
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard detail="matching requests" icon={FileCheck2} label="MPS Requests" value={mpsSummary.requests} />
          <SummaryCard detail="still open" icon={Hourglass} label="Active Requests" value={mpsSummary.activeRequests} />
          <SummaryCard detail="submitted rows" icon={ClipboardList} label="MPS Records" value={mpsSummary.submissions} />
          <SummaryCard detail="same subjects combined" icon={BarChart3} label="Subjects Averaged" value={mpsSummary.subjects} />
          <SummaryCard detail="all filtered MPS records" icon={BarChart3} label="Overall Average" value={formatAverage(mpsSummary.overallAverage)} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Grade Level</th>
                <th className="px-4 py-3 font-semibold">No. of Classes</th>
                <th className="px-4 py-3 font-semibold">Average MPS</th>
                <th className="px-4 py-3 font-semibold">Least Mastered Competencies</th>
                <th className="px-4 py-3 font-semibold">Planned Interventions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {mpsSubjectSummaryRows.map((record) => (
                <tr key={record.subjectId}>
                  <td className="px-4 py-3 font-medium text-slate-950">{record.subjectName}</td>
                  <td className="px-4 py-3">{record.gradeLevels}</td>
                  <td className="px-4 py-3">{record.classCount}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{formatAverage(record.averageMps)}</td>
                  <td className="px-4 py-3">{record.leastMasteredCompetencies || "-"}</td>
                  <td className="px-4 py-3">{record.plannedInterventions || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mpsSubjectSummaryRows.length === 0 && (
            <div className="p-5 text-sm text-slate-600">No MPS submissions found for the selected school year and term.</div>
          )}
        </div>
      </div>
    </section>
  );
}
