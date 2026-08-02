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
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeDllRequests, subscribeDllSubmissions } from "../services/dllSubmissionService";
import { subscribeCollection } from "../services/firestoreCrud";
import { subscribeMpsRequests, subscribeMpsSubmissions } from "../services/mpsService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeTosiaAssessments, subscribeTosiaRequests } from "../services/tosiaService";
import type { AcademicTerm, DllRequest, DllSubmission, LoadAssignment, MpsRequest, MpsSubmission, PersonnelAttendanceRecord, TosiaAssessment, TosiaItemResponse, TosiaRequest } from "../types/loading";
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

type TosiaAssessmentSummary = {
  mappedItems: number;
  mean: number;
  mps: number;
  sd: number;
  lmc: string;
  mmc: string;
};

type TosiaSubjectSummaryRow = {
  subjectId: string;
  subjectName: string;
  gradeLevels: string;
  sectionCount: number;
  totalStudents: number;
  averageMps: number;
  sd: number;
  interpretation: ReturnType<typeof mpsInterpretation>;
};

type TosiaTeacherSummaryRow = {
  teacherId: string;
  teacherName: string;
  subjects: string;
  sectionCount: number;
  totalStudents: number;
  averageMps: number;
  sd: number;
  interpretation: ReturnType<typeof mpsInterpretation>;
};

type TosiaRequestSummaryRow = {
  request: TosiaRequest;
  expectedClasses: number;
  submittedClasses: number;
  teachersSubmitted: number;
  totalStudents: number;
  overallMps: number;
};

type TosiaPrintMode = "overall" | "subject" | "teacher";

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

function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
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

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function standardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function mpsInterpretation(percent: number) {
  if (percent >= 96) return { label: "Mastered", code: "M" };
  if (percent >= 86) return { label: "Closely Approximating Mastery", code: "CAM" };
  if (percent >= 66) return { label: "Moving Towards Mastery", code: "MTM" };
  if (percent >= 35) return { label: "Average Mastery", code: "AM" };
  if (percent >= 15) return { label: "Low Mastery", code: "LM" };
  if (percent >= 5) return { label: "Very Low Mastery", code: "VLM" };
  return { label: "Absolutely No Mastery", code: "ANM" };
}

function getTosiaClassKey(requestId: string, teacherId: string, subjectId: string, sectionId: string) {
  return `${requestId}:${teacherId}:${subjectId}:${sectionId}`;
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function summarizeTosiaAssessment(assessment: Pick<TosiaAssessment, "competencies" | "itemResponses" | "totalItems" | "totalStudents">): TosiaAssessmentSummary {
  const itemResponses = normalizeTosiaItemResponses(assessment);
  const itemsByCompetency = new Map<string, TosiaItemResponse[]>();
  itemResponses.forEach((item) => {
    if (!item.competencyId) return;
    itemsByCompetency.set(item.competencyId, [...(itemsByCompetency.get(item.competencyId) ?? []), item]);
  });

  const rankedCompetencies = assessment.competencies
    .filter((competency) => competency.content.trim() && (itemsByCompetency.get(competency.competencyId)?.length ?? 0) > 0)
    .map((competency) => {
      const items = itemsByCompetency.get(competency.competencyId) ?? [];
      const averagePercent =
        assessment.totalStudents > 0 && items.length > 0
          ? items.reduce((sum, item) => sum + (Number(item.correctResponses || 0) / assessment.totalStudents) * 100, 0) / items.length
          : 0;

      return { content: competency.content, averagePercent };
    })
    .sort((first, second) => first.averagePercent - second.averagePercent);

  const correctValues = itemResponses.map((item) => Number(item.correctResponses || 0));
  const totalCorrect = correctValues.reduce((sum, value) => sum + value, 0);
  const mps = assessment.totalStudents > 0 && assessment.totalItems > 0
    ? (totalCorrect / (assessment.totalStudents * assessment.totalItems)) * 100
    : 0;

  return {
    mappedItems: itemResponses.filter((item) => item.competencyId).length,
    mean: assessment.totalStudents > 0 ? totalCorrect / assessment.totalStudents : 0,
    mps,
    sd: standardDeviation(correctValues),
    lmc: rankedCompetencies[0]?.content || "No mapped competency",
    mmc: rankedCompetencies[rankedCompetencies.length - 1]?.content || "No mapped competency",
  };
}

function normalizeTosiaItemResponses(assessment: Pick<TosiaAssessment, "itemResponses" | "totalItems" | "totalStudents">): TosiaItemResponse[] {
  const totalItems = Math.max(0, Math.floor(Number(assessment.totalItems || assessment.itemResponses.length || 0)));
  const totalStudents = Math.max(0, Number(assessment.totalStudents || 0));
  const byItemNumber = new Map<number, TosiaItemResponse>();

  assessment.itemResponses.forEach((item) => {
    const itemNumber = Math.floor(Number(item.itemNumber || 0));
    if (itemNumber < 1 || itemNumber > totalItems || byItemNumber.has(itemNumber)) return;
    const correctResponses = Math.max(0, Math.floor(Number(item.correctResponses || 0)));
    byItemNumber.set(itemNumber, {
      ...item,
      itemNumber,
      correctResponses: totalStudents > 0 ? Math.min(totalStudents, correctResponses) : correctResponses,
    });
  });

  return Array.from({ length: totalItems }, (_, index) => {
    const itemNumber = index + 1;
    return byItemNumber.get(itemNumber) ?? {
      itemNumber,
      competencyId: "",
      skillLevel: "remembering" as TosiaItemResponse["skillLevel"],
      correctResponses: 0,
    };
  });
}

function getTosiaAssessmentMps(assessment: Pick<TosiaAssessment, "itemResponses" | "totalItems" | "totalStudents">) {
  const itemResponses = normalizeTosiaItemResponses(assessment);
  const totalStudents = Number(assessment.totalStudents || 0);
  const totalItems = Number(assessment.totalItems || itemResponses.length || 0);
  const totalCorrect = itemResponses.reduce((sum, item) => sum + Number(item.correctResponses || 0), 0);

  return totalStudents > 0 && totalItems > 0 ? (totalCorrect / (totalStudents * totalItems)) * 100 : 0;
}

function getTosiaSubjectSummaryRows(assessments: TosiaAssessment[]): TosiaSubjectSummaryRow[] {
  const grouped = new Map<string, TosiaAssessment[]>();
  assessments.forEach((assessment) => {
    const subjectKey = assessment.subjectId || assessment.subjectName;
    grouped.set(subjectKey, [...(grouped.get(subjectKey) ?? []), assessment]);
  });

  return Array.from(grouped.entries())
    .map(([subjectId, records]) => {
      const totalStudents = records.reduce((sum, assessment) => sum + Number(assessment.totalStudents || 0), 0);
      const averageMps = totalStudents > 0
        ? records.reduce((sum, assessment) => sum + getTosiaAssessmentMps(assessment) * Number(assessment.totalStudents || 0), 0) / totalStudents
        : 0;
      const sectionMpsValues = records.map((assessment) => getTosiaAssessmentMps(assessment));

      return {
        subjectId,
        subjectName: records[0].subjectName,
        gradeLevels: Array.from(new Set(records.map((record) => `${record.gradeLevel} ${record.strand}`.trim()).filter(Boolean))).sort().join(", "),
        sectionCount: records.length,
        totalStudents,
        averageMps,
        sd: standardDeviation(sectionMpsValues),
        interpretation: mpsInterpretation(averageMps),
      };
    })
    .sort((first, second) => first.subjectName.localeCompare(second.subjectName));
}

function getTosiaTeacherSummaryRows(assessments: TosiaAssessment[]): TosiaTeacherSummaryRow[] {
  const grouped = new Map<string, TosiaAssessment[]>();
  assessments.forEach((assessment) => {
    const teacherKey = assessment.teacherId || assessment.teacherName;
    grouped.set(teacherKey, [...(grouped.get(teacherKey) ?? []), assessment]);
  });

  return Array.from(grouped.entries())
    .map(([teacherId, records]) => {
      const totalStudents = records.reduce((sum, assessment) => sum + Number(assessment.totalStudents || 0), 0);
      const averageMps = totalStudents > 0
        ? records.reduce((sum, assessment) => sum + getTosiaAssessmentMps(assessment) * Number(assessment.totalStudents || 0), 0) / totalStudents
        : 0;
      const sectionMpsValues = records.map((assessment) => getTosiaAssessmentMps(assessment));

      return {
        teacherId,
        teacherName: records[0].teacherName,
        subjects: Array.from(new Set(records.map((record) => record.subjectName).filter(Boolean))).sort().join(", "),
        sectionCount: records.length,
        totalStudents,
        averageMps,
        sd: standardDeviation(sectionMpsValues),
        interpretation: mpsInterpretation(averageMps),
      };
    })
    .sort((first, second) => first.teacherName.localeCompare(second.teacherName));
}

function summarizeTosiaRequest(request: TosiaRequest, assessments: TosiaAssessment[], assignments: LoadAssignment[]): TosiaRequestSummaryRow {
  const requestAssessments = assessments.filter((assessment) => assessment.requestId === request.requestId);
  const expectedClasses = new Set(
    assignments
      .filter((assignment) => assignment.schoolYear === request.schoolYear && assignment.term === request.term)
      .map((assignment) => getTosiaClassKey(request.requestId, assignment.teacherId, assignment.subjectId, assignment.sectionId)),
  ).size;
  const submittedClasses = new Set(
    requestAssessments.map((assessment) => getTosiaClassKey(request.requestId, assessment.teacherId, assessment.subjectId ?? "", assessment.sectionId ?? "")),
  ).size;
  const totalPossible = requestAssessments.reduce(
    (sum, assessment) => sum + Number(assessment.totalStudents || 0) * Number(assessment.totalItems || assessment.itemResponses.length || 0),
    0,
  );
  const totalCorrect = requestAssessments.reduce(
    (sum, assessment) => sum + normalizeTosiaItemResponses(assessment).reduce((itemSum, item) => itemSum + Number(item.correctResponses || 0), 0),
    0,
  );

  return {
    request,
    expectedClasses,
    submittedClasses,
    teachersSubmitted: new Set(requestAssessments.map((assessment) => assessment.teacherId || assessment.teacherName)).size,
    totalStudents: requestAssessments.reduce((sum, assessment) => sum + Number(assessment.totalStudents || 0), 0),
    overallMps: totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : 0,
  };
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

function printTosiaSummaryReport(request: TosiaRequest, assessments: TosiaAssessment[], assignments: LoadAssignment[], mode: TosiaPrintMode = "overall") {
  const reportWindow = window.open("", "_blank", "width=1200,height=850");
  if (!reportWindow) return;

  const requestAssessments = assessments
    .filter((assessment) => assessment.requestId === request.requestId)
    .sort((first, second) => `${first.gradeLevel} ${first.sectionName} ${first.subjectName}`.localeCompare(`${second.gradeLevel} ${second.sectionName} ${second.subjectName}`));
  const expectedClassCount = new Set(
    assignments
      .filter((assignment) => assignment.schoolYear === request.schoolYear && assignment.term === request.term)
      .map((assignment) => getTosiaClassKey(request.requestId, assignment.teacherId, assignment.subjectId, assignment.sectionId)),
  ).size;
  const submittedClassCount = new Set(
    requestAssessments.map((assessment) => getTosiaClassKey(request.requestId, assessment.teacherId, assessment.subjectId ?? "", assessment.sectionId ?? "")),
  ).size;
  const teacherCount = new Set(requestAssessments.map((assessment) => assessment.teacherId || assessment.teacherName)).size;
  const totalStudents = requestAssessments.reduce((sum, assessment) => sum + Number(assessment.totalStudents || 0), 0);
  const totalItems = requestAssessments.reduce((sum, assessment) => sum + Number(assessment.totalItems || assessment.itemResponses.length || 0), 0);
  const correctValues = requestAssessments.flatMap((assessment) => normalizeTosiaItemResponses(assessment).map((item) => Number(item.correctResponses || 0)));
  const totalCorrect = correctValues.reduce((sum, value) => sum + value, 0);
  const totalPossible = requestAssessments.reduce(
    (sum, assessment) => sum + Number(assessment.totalStudents || 0) * Number(assessment.totalItems || assessment.itemResponses.length || 0),
    0,
  );
  const overallMps = totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : 0;
  const overallInterpretation = mpsInterpretation(overallMps);
  const reportTitle = mode === "subject"
    ? "TOSIA Pro Summary Per Subject"
    : mode === "teacher"
      ? "TOSIA Pro Summary Per Teacher"
      : "Summary of TOSIA Pro";
  const subjectRows = getTosiaSubjectSummaryRows(requestAssessments).map((subject, index) => `<tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(subject.subjectName)}</td>
      <td>${escapeHtml(subject.gradeLevels || "-")}</td>
      <td class="center">${subject.sectionCount}</td>
      <td class="center">${subject.totalStudents}</td>
      <td class="center">${round(subject.averageMps, 2)}%</td>
      <td class="center">${round(subject.sd, 2)}</td>
      <td>${escapeHtml(subject.interpretation.label)} (${escapeHtml(subject.interpretation.code)})</td>
    </tr>`);
  const teacherRows = getTosiaTeacherSummaryRows(requestAssessments).map((teacher, index) => `<tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(teacher.teacherName)}</td>
      <td>${escapeHtml(teacher.subjects || "-")}</td>
      <td class="center">${teacher.sectionCount}</td>
      <td class="center">${teacher.totalStudents}</td>
      <td class="center">${round(teacher.averageMps, 2)}%</td>
      <td class="center">${round(teacher.sd, 2)}</td>
      <td>${escapeHtml(teacher.interpretation.label)} (${escapeHtml(teacher.interpretation.code)})</td>
    </tr>`);
  const summaryRows = requestAssessments.map((assessment, index) => {
    const assessmentSummary = summarizeTosiaAssessment(assessment);
    const interpretation = mpsInterpretation(assessmentSummary.mps);

    return `<tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(assessment.teacherName)}</td>
      <td>${escapeHtml(assessment.subjectName)}</td>
      <td>${escapeHtml(assessment.sectionName)}</td>
      <td class="center">${escapeHtml(`${assessment.gradeLevel} ${assessment.strand}`.trim())}</td>
      <td class="center">${assessment.totalStudents}</td>
      <td class="center">${assessment.totalItems}</td>
      <td class="center">${assessmentSummary.mappedItems}/${assessment.totalItems}</td>
      <td class="center">${round(assessmentSummary.mean, 2)}</td>
      <td class="center">${round(assessmentSummary.mps, 2)}%</td>
      <td>${escapeHtml(interpretation.code)}</td>
      <td>${escapeHtml(assessmentSummary.lmc)}</td>
      <td>${escapeHtml(assessmentSummary.mmc)}</td>
    </tr>`;
  });
  const emptySubjectRow = `<tr><td colspan="8" class="center">No TOSIA Pro subjects have been submitted for this request.</td></tr>`;
  const emptyTeacherRow = `<tr><td colspan="8" class="center">No TOSIA Pro teachers have been submitted for this request.</td></tr>`;
  const emptyRow = `<tr><td colspan="13" class="center">No TOSIA Pro assessments have been submitted for this request.</td></tr>`;
  const rowChunks = mode === "overall" ? chunkRows(summaryRows.length ? summaryRows : [emptyRow], 15) : [[]];
  const renderPage = (rows: string[], index: number) => {
    const isFirstPage = index === 0;
    const isLastPage = index === rowChunks.length - 1;
    const signatorySource = requestAssessments[0];

    return `<main class="print-page">
      <div class="print-content">
        <header class="report-heading">
          <h1>${escapeHtml(isFirstPage ? reportTitle : `${reportTitle} Continued`)}</h1>
          <p>${escapeHtml(request.testName)} | ${escapeHtml(request.term)}, S.Y. ${escapeHtml(request.schoolYear)}</p>
          <p>${escapeHtml(request.title)}${request.dueDate ? ` | Due ${escapeHtml(formatDate(request.dueDate))}` : ""}</p>
        </header>
        ${isFirstPage ? `<h2>Summary of Request</h2>
          <table>
            <tbody>
              <tr><th>Expected Classes</th><td class="center">${expectedClassCount}</td><th>Submitted Classes</th><td class="center">${submittedClassCount}</td><th>Teachers Submitted</th><td class="center">${teacherCount}</td></tr>
              <tr><th>Total Students</th><td class="center">${totalStudents}</td><th>Total Submitted Items</th><td class="center">${totalItems}</td><th>Overall MPS</th><td class="center">${round(overallMps, 2)}%</td></tr>
              <tr><th>Standard Deviation</th><td class="center">${round(standardDeviation(correctValues), 2)}</td><th>Verbal Interpretation</th><td colspan="3">${escapeHtml(overallInterpretation.label)} (${escapeHtml(overallInterpretation.code)})</td></tr>
            </tbody>
          </table>` : ""}
        ${isFirstPage && (mode === "overall" || mode === "subject") ? `<h2>Subject Summary</h2>
          <table>
            <thead><tr><th>No.</th><th>Subject</th><th>Grade / Strand</th><th>Sections</th><th>Students</th><th>Average MPS</th><th>SD</th><th>Verbal Interpretation</th></tr></thead>
            <tbody>${subjectRows.length ? subjectRows.join("") : emptySubjectRow}</tbody>
          </table>` : ""}
        ${isFirstPage && (mode === "overall" || mode === "teacher") ? `<h2>Teacher Summary</h2>
          <table>
            <thead><tr><th>No.</th><th>Teacher</th><th>Subjects</th><th>Sections</th><th>Students</th><th>Average MPS</th><th>SD</th><th>Verbal Interpretation</th></tr></thead>
            <tbody>${teacherRows.length ? teacherRows.join("") : emptyTeacherRow}</tbody>
          </table>` : ""}
        ${mode === "overall" ? `<h2>Class Summary</h2>
        <table>
          <thead><tr><th>No.</th><th>Teacher</th><th>Subject</th><th>Section</th><th>Grade / Strand</th><th>Students</th><th>Items</th><th>Mapped</th><th>Mean</th><th>MPS</th><th>VI</th><th>Least Mastered</th><th>Most Mastered</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>` : ""}
        ${isLastPage ? `<section class="signatures">
          <div><strong>${escapeHtml(signatorySource?.preparedBy || "Prepared by")}</strong><p>${escapeHtml(signatorySource?.preparedByPosition || "")}</p></div>
          <div><strong>${escapeHtml(signatorySource?.checkedBy || "Checked by")}</strong><p>${escapeHtml(signatorySource?.checkedByPosition || "")}</p></div>
          <div><strong>${escapeHtml(signatorySource?.notedBy || "Noted by")}</strong><p>${escapeHtml(signatorySource?.notedByPosition || "")}</p></div>
        </section>` : ""}
      </div>
    </main>`;
  };

  reportWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Summary of TOSIA Pro</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: A4 landscape; margin: 0; }
      body { background: #e5e7eb; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 10px; margin: 0; }
      .no-print { position: fixed; z-index: 20; top: 10px; left: 10px; border: 0; border-radius: 8px; background: #7f1d1d; color: white; cursor: pointer; font: 700 12px Arial, sans-serif; padding: 9px 12px; }
      .print-page { position: relative; width: 297mm; height: 210mm; margin: 0 auto; overflow: hidden; background: white; break-after: page; page-break-after: always; }
      .print-page:last-child { break-after: auto; page-break-after: auto; }
      .print-content { position: relative; z-index: 1; height: 100%; padding: 12mm 10mm; font-size: 10px; }
      .report-heading { border-bottom: 1.5px solid #111827; margin-bottom: 8px; padding-bottom: 5px; text-align: center; }
      h1 { font-size: 14px; margin: 0 0 3px; text-transform: uppercase; }
      h2 { font-size: 10px; margin: 9px 0 4px; }
      p { font-size: 10px; margin: 2px 0; }
      table { border-collapse: collapse; font-size: 9px; margin-bottom: 8px; width: 100%; page-break-inside: auto; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 1px solid #94a3b8; padding: 2px 4px; text-align: left; vertical-align: top; }
      th { background: #e2e8f0; font-weight: 700; }
      .center { text-align: center; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 24px; page-break-inside: avoid; }
      .signatures div { text-align: center; }
      .signatures strong { border-top: 1px solid #111827; display: block; font-size: 10px; padding-top: 5px; }
      @media screen {
        body { padding: 18px 0; }
        .print-page { box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18); margin-bottom: 18px; }
      }
      @media print {
        body { background: white; }
        .no-print { display: none; }
        .print-page { margin: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <button class="no-print" onclick="window.print()">Print / Save as PDF</button>
    ${rowChunks.map(renderPage).join("")}
    <script>window.onload = () => { window.focus(); setTimeout(() => window.print(), 250); };</script>
  </body>
</html>`);
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
  const [tosiaRequests, setTosiaRequests] = useState<TosiaRequest[]>([]);
  const [tosiaAssessments, setTosiaAssessments] = useState<TosiaAssessment[]>([]);
  const [loadAssignments, setLoadAssignments] = useState<LoadAssignment[]>([]);
  const [selectedTosiaRequestId, setSelectedTosiaRequestId] = useState("");
  const [selectedTosiaSubjectId, setSelectedTosiaSubjectId] = useState("");

  useEffect(() => subscribeCollection<PersonnelAttendanceRecord>("personnelAttendance", setAttendanceRecords), []);
  useEffect(() => subscribeLoadAssignments(setLoadAssignments), []);
  useEffect(() => subscribeDllRequests(setDllRequests), []);
  useEffect(() => subscribeDllSubmissions(setDllSubmissions), []);
  useEffect(() => subscribeMpsRequests(setMpsRequests), []);
  useEffect(() => subscribeMpsSubmissions(setMpsSubmissions), []);
  useEffect(() => subscribeTosiaRequests(setTosiaRequests), []);
  useEffect(() => subscribeTosiaAssessments(setTosiaAssessments), []);
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

  const filteredTosiaRequests = useMemo(
    () =>
      tosiaRequests
        .filter((request) => request.schoolYear === schoolYear)
        .filter((request) => term === "all" || request.term === term)
        .sort((first, second) => `${first.dueDate} ${first.testName}`.localeCompare(`${second.dueDate} ${second.testName}`)),
    [schoolYear, term, tosiaRequests],
  );

  const selectedTosiaRequest = useMemo(
    () => filteredTosiaRequests.find((request) => request.requestId === selectedTosiaRequestId) ?? filteredTosiaRequests[0],
    [filteredTosiaRequests, selectedTosiaRequestId],
  );

  useEffect(() => {
    setSelectedTosiaSubjectId("");
  }, [selectedTosiaRequest?.requestId]);

  const selectedTosiaAssessments = useMemo(
    () =>
      selectedTosiaRequest
        ? tosiaAssessments
            .filter((assessment) => assessment.requestId === selectedTosiaRequest.requestId)
            .sort((first, second) => `${first.subjectName} ${first.sectionName}`.localeCompare(`${second.subjectName} ${second.sectionName}`))
        : [],
    [selectedTosiaRequest, tosiaAssessments],
  );

  const tosiaRequestSummaryRows = useMemo<TosiaRequestSummaryRow[]>(
    () => filteredTosiaRequests.map((request) => summarizeTosiaRequest(request, tosiaAssessments, loadAssignments)),
    [filteredTosiaRequests, loadAssignments, tosiaAssessments],
  );

  const selectedTosiaRequestSummary = useMemo(
    () => tosiaRequestSummaryRows.find((row) => row.request.requestId === selectedTosiaRequest?.requestId),
    [selectedTosiaRequest?.requestId, tosiaRequestSummaryRows],
  );

  const tosiaSubjectSummaryRows = useMemo(
    () => getTosiaSubjectSummaryRows(selectedTosiaAssessments),
    [selectedTosiaAssessments],
  );

  const selectedTosiaSubject = useMemo(
    () => tosiaSubjectSummaryRows.find((row) => row.subjectId === selectedTosiaSubjectId) ?? tosiaSubjectSummaryRows[0],
    [selectedTosiaSubjectId, tosiaSubjectSummaryRows],
  );

  const selectedTosiaSubjectAssessments = useMemo(
    () =>
      selectedTosiaSubject
        ? selectedTosiaAssessments.filter((assessment) => (assessment.subjectId || assessment.subjectName) === selectedTosiaSubject.subjectId)
        : [],
    [selectedTosiaAssessments, selectedTosiaSubject],
  );

  const tosiaSummary = useMemo(() => {
    return {
      requests: filteredTosiaRequests.length,
      activeRequests: filteredTosiaRequests.filter((request) => request.status === "active").length,
      expectedClasses: selectedTosiaRequestSummary?.expectedClasses ?? 0,
      submittedClasses: selectedTosiaRequestSummary?.submittedClasses ?? 0,
      teachersSubmitted: selectedTosiaRequestSummary?.teachersSubmitted ?? 0,
      totalStudents: selectedTosiaRequestSummary?.totalStudents ?? 0,
      overallMps: selectedTosiaRequestSummary?.overallMps ?? 0,
    };
  }, [filteredTosiaRequests, selectedTosiaRequestSummary]);

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

  function printTosiaSummary(mode: TosiaPrintMode) {
    if (!selectedTosiaRequest) return;
    printTosiaSummaryReport(selectedTosiaRequest, tosiaAssessments, loadAssignments, mode);
  }

  return (
    <section>
      <PageHeader
        description="View and print personnel attendance, DLL submission, MPS, and TOSIA Pro summaries."
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

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Summary of TOSIA Pro</h2>
            <p className="mt-1 text-sm text-slate-500">Printable TOSIA Pro request summary with submitted classes, MPS, and mastery results.</p>
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
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedTosiaRequest}
              onClick={() => printTosiaSummary("overall")}
              type="button"
            >
              <Printer size={16} /> Overall
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedTosiaRequest}
              onClick={() => printTosiaSummary("subject")}
              type="button"
            >
              <Printer size={16} /> Per Subject
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedTosiaRequest}
              onClick={() => printTosiaSummary("teacher")}
              type="button"
            >
              <Printer size={16} /> Per Teacher
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard detail="matching requests" icon={FileCheck2} label="TOSIA Requests" value={tosiaSummary.requests} />
          <SummaryCard detail="still open" icon={Hourglass} label="Active Requests" value={tosiaSummary.activeRequests} />
          <SummaryCard detail="from loading records" icon={ClipboardList} label="Expected Classes" value={tosiaSummary.expectedClasses} />
          <SummaryCard detail="with TOSIA records" icon={CheckCircle2} label="Submitted Classes" value={tosiaSummary.submittedClasses} />
          <SummaryCard detail="unique submitters" icon={BadgeCheck} label="Teachers Submitted" value={tosiaSummary.teachersSubmitted} />
          <SummaryCard detail="selected request" icon={BarChart3} label="Overall MPS" value={`${formatAverage(tosiaSummary.overallMps)}%`} />
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">TOSIA Pro Request</th>
                <th className="px-4 py-3 font-semibold">Term</th>
                <th className="px-4 py-3 font-semibold">Due Date</th>
                <th className="px-4 py-3 font-semibold">Expected Classes</th>
                <th className="px-4 py-3 font-semibold">Submitted Classes</th>
                <th className="px-4 py-3 font-semibold">Teachers</th>
                <th className="px-4 py-3 font-semibold">Students</th>
                <th className="px-4 py-3 font-semibold">Overall MPS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {tosiaRequestSummaryRows.map((row) => {
                const isSelected = row.request.requestId === selectedTosiaRequest?.requestId;

                return (
                  <tr
                    aria-selected={isSelected}
                    className={`cursor-pointer transition hover:bg-slate-50 ${isSelected ? "bg-red-50 text-slate-950" : ""}`}
                    key={row.request.requestId}
                    onClick={() => setSelectedTosiaRequestId(row.request.requestId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTosiaRequestId(row.request.requestId);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 font-medium text-slate-950">
                      <div>{row.request.testName}</div>
                      <div className="text-xs font-normal text-slate-500">{row.request.title}</div>
                    </td>
                    <td className="px-4 py-3">{row.request.term}</td>
                    <td className="px-4 py-3">{formatDate(row.request.dueDate)}</td>
                    <td className="px-4 py-3">{row.expectedClasses}</td>
                    <td className="px-4 py-3">{row.submittedClasses}</td>
                    <td className="px-4 py-3">{row.teachersSubmitted}</td>
                    <td className="px-4 py-3">{row.totalStudents}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{formatAverage(row.overallMps)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tosiaRequestSummaryRows.length === 0 && (
            <div className="p-5 text-sm text-slate-600">No TOSIA Pro requests found for the selected school year and term.</div>
          )}
        </div>

        {selectedTosiaRequest && (
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Subject Summary</th>
                  <th className="px-4 py-3 font-semibold">Grade / Strand</th>
                  <th className="px-4 py-3 font-semibold">Sections</th>
                  <th className="px-4 py-3 font-semibold">Students</th>
                  <th className="px-4 py-3 font-semibold">Average MPS</th>
                  <th className="px-4 py-3 font-semibold">SD</th>
                  <th className="px-4 py-3 font-semibold">VI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {tosiaSubjectSummaryRows.map((subject) => {
                  const isSelected = subject.subjectId === selectedTosiaSubject?.subjectId;

                  return (
                    <tr
                      aria-selected={isSelected}
                      className={`cursor-pointer transition hover:bg-slate-50 ${isSelected ? "bg-red-50 text-slate-950" : ""}`}
                      key={subject.subjectId}
                      onClick={() => setSelectedTosiaSubjectId(subject.subjectId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedTosiaSubjectId(subject.subjectId);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="px-4 py-3 font-medium text-slate-950">{subject.subjectName}</td>
                      <td className="px-4 py-3">{subject.gradeLevels || "-"}</td>
                      <td className="px-4 py-3">{subject.sectionCount}</td>
                      <td className="px-4 py-3">{subject.totalStudents}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">{formatAverage(subject.averageMps)}%</td>
                      <td className="px-4 py-3">{formatAverage(subject.sd)}</td>
                      <td className="px-4 py-3">{subject.interpretation.code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tosiaSubjectSummaryRows.length === 0 && (
              <div className="p-5 text-sm text-slate-600">No subject summaries found for the selected request.</div>
            )}
          </div>
        )}

        {selectedTosiaSubject && (
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Section</th>
                  <th className="px-4 py-3 font-semibold">Teacher</th>
                  <th className="px-4 py-3 font-semibold">Grade / Strand</th>
                  <th className="px-4 py-3 font-semibold">Students</th>
                  <th className="px-4 py-3 font-semibold">Items</th>
                  <th className="px-4 py-3 font-semibold">Mapped</th>
                  <th className="px-4 py-3 font-semibold">Mean</th>
                  <th className="px-4 py-3 font-semibold">MPS</th>
                  <th className="px-4 py-3 font-semibold">VI</th>
                  <th className="px-4 py-3 font-semibold">Least Mastered</th>
                  <th className="px-4 py-3 font-semibold">Most Mastered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {selectedTosiaSubjectAssessments.map((assessment) => {
                  const assessmentSummary = summarizeTosiaAssessment(assessment);
                  const interpretation = mpsInterpretation(assessmentSummary.mps);

                  return (
                    <tr key={assessment.assessmentId}>
                      <td className="px-4 py-3 font-medium text-slate-950">{assessment.sectionName}</td>
                      <td className="px-4 py-3">{assessment.teacherName}</td>
                      <td className="px-4 py-3">{`${assessment.gradeLevel} ${assessment.strand}`.trim()}</td>
                      <td className="px-4 py-3">{assessment.totalStudents}</td>
                      <td className="px-4 py-3">{assessment.totalItems}</td>
                      <td className="px-4 py-3">{assessmentSummary.mappedItems}/{assessment.totalItems}</td>
                      <td className="px-4 py-3">{formatAverage(assessmentSummary.mean)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">{formatAverage(assessmentSummary.mps)}%</td>
                      <td className="px-4 py-3">{interpretation.code}</td>
                      <td className="px-4 py-3">{assessmentSummary.lmc}</td>
                      <td className="px-4 py-3">{assessmentSummary.mmc}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selectedTosiaSubjectAssessments.length === 0 && (
              <div className="p-5 text-sm text-slate-600">No section results found for the selected subject.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
