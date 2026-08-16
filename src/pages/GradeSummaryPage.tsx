import { BookOpen, ClipboardList, Printer, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { useAuth } from "../providers/AuthProvider";
import { subscribeClassEnrollments, subscribeEnrollmentStudents } from "../services/enrollmentService";
import {
  subscribeAllGradeComputations,
  subscribeGradeComputationsBySection,
} from "../services/gradeComputationService";
import { subscribeSections } from "../services/sectionService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeSubjects } from "../services/subjectService";
import type {
  AcademicSettings,
  AcademicTerm,
  ClassEnrollment,
  EnrollmentStudent,
  GradeComputation,
  Section,
  Subject,
} from "../types/loading";
import { termOptions } from "../types/loading";

type SubjectColumn = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  units: number;
};

function normalizeSex(value?: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["m", "male", "lalaki"].includes(normalized)) return "male";
  if (["f", "female", "babae"].includes(normalized)) return "female";
  return "other";
}

function sexSortValue(value?: string) {
  const normalized = normalizeSex(value);
  if (normalized === "male") return 0;
  if (normalized === "female") return 1;
  return 2;
}

function formatSex(value?: string) {
  const normalized = normalizeSex(value);
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  return value?.trim() || "-";
}

function getStudentSortName(student: EnrollmentStudent) {
  return `${student.lastName} ${student.firstName} ${student.middleName ?? ""}`;
}

function getSubjectUnits(subject?: Pick<Subject, "subjectUnits"> | null) {
  return Number(subject?.subjectUnits || 0);
}

function formatGeneralAverage(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}

function formatRoundedGeneralAverage(value: number | null) {
  return value === null ? "-" : Math.round(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function GradeSummaryPage() {
  const { profile } = useAuth();
  const canViewAll =
    profile?.role === "super_admin" ||
    profile?.role === "principal" ||
    profile?.role === "master_teacher";
  const advisorySectionId = profile?.advisingSectionId ?? "";
  const [academicSettings, setAcademicSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [schoolYear, setSchoolYear] = useState(defaultAcademicSettings.currentSchoolYear);
  const [term, setTerm] = useState<AcademicTerm>(defaultAcademicSettings.currentTerm);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<EnrollmentStudent[]>([]);
  const [classEnrollments, setClassEnrollments] = useState<ClassEnrollment[]>([]);
  const [gradeComputations, setGradeComputations] = useState<GradeComputation[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");

  useEffect(() => subscribeAcademicSettings(setAcademicSettings), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeEnrollmentStudents(setStudents), []);
  useEffect(() => subscribeClassEnrollments(setClassEnrollments), []);
  useEffect(() => {
    if (canViewAll) return subscribeAllGradeComputations(setGradeComputations);
    return subscribeGradeComputationsBySection(advisorySectionId, setGradeComputations);
  }, [advisorySectionId, canViewAll]);

  useEffect(() => {
    setSchoolYear(academicSettings.currentSchoolYear);
    setTerm(academicSettings.currentTerm);
  }, [academicSettings.currentSchoolYear, academicSettings.currentTerm]);

  const visibleSections = useMemo(
    () =>
      sections
        .filter((section) => section.schoolYear === schoolYear && section.status === "active")
        .filter((section) => canViewAll || section.sectionId === advisorySectionId)
        .sort((first, second) =>
          `${first.gradeLevel} ${first.sectionName}`.localeCompare(
            `${second.gradeLevel} ${second.sectionName}`,
          ),
        ),
    [advisorySectionId, canViewAll, schoolYear, sections],
  );

  useEffect(() => {
    if (
      selectedSectionId &&
      visibleSections.some((section) => section.sectionId === selectedSectionId)
    ) {
      return;
    }

    setSelectedSectionId(visibleSections[0]?.sectionId ?? "");
  }, [selectedSectionId, visibleSections]);

  const selectedSection = useMemo(
    () => visibleSections.find((section) => section.sectionId === selectedSectionId) ?? null,
    [selectedSectionId, visibleSections],
  );

  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.subjectId, subject])),
    [subjects],
  );

  const sectionStudents = useMemo(
    () =>
      students
        .filter(
          (student) =>
            student.schoolYear === schoolYear &&
            student.sectionId === selectedSectionId &&
            student.status === "enrolled",
        )
        .sort((first, second) => {
          const sexSort = sexSortValue(first.sex) - sexSortValue(second.sex);
          if (sexSort !== 0) return sexSort;
          return getStudentSortName(first).localeCompare(getStudentSortName(second));
        }),
    [schoolYear, selectedSectionId, students],
  );

  const sectionGrades = useMemo(
    () =>
      gradeComputations.filter(
        (computation) =>
          computation.schoolYear === schoolYear &&
          computation.term === term &&
          computation.sectionId === selectedSectionId,
      ),
    [gradeComputations, schoolYear, selectedSectionId, term],
  );

  const sectionClassEnrollments = useMemo(
    () =>
      classEnrollments.filter(
        (enrollment) =>
          enrollment.schoolYear === schoolYear &&
          enrollment.term === term &&
          enrollment.sectionId === selectedSectionId &&
          enrollment.status === "enrolled",
      ),
    [classEnrollments, schoolYear, selectedSectionId, term],
  );

  const subjectColumns = useMemo<SubjectColumn[]>(() => {
    const subjectColumnsById = new Map<string, SubjectColumn>();

    sectionClassEnrollments.forEach((enrollment) => {
      subjectColumnsById.set(enrollment.subjectId, {
        subjectId: enrollment.subjectId,
        subjectName: enrollment.subjectName,
        subjectCode: enrollment.subjectCode,
        units: getSubjectUnits(subjectsById.get(enrollment.subjectId)),
      });
    });

    sectionGrades.forEach((computation) => {
      subjectColumnsById.set(computation.subjectId, {
        subjectId: computation.subjectId,
        subjectName: computation.subjectName,
        subjectCode: computation.subjectCode,
        units: getSubjectUnits(subjectsById.get(computation.subjectId)),
      });
    });

    return [...subjectColumnsById.values()].sort((first, second) =>
      `${first.subjectName} ${first.subjectCode}`.localeCompare(
        `${second.subjectName} ${second.subjectCode}`,
      ),
    );
  }, [sectionClassEnrollments, sectionGrades, subjectsById]);

  const enrollmentsByStudentSubject = useMemo(
    () =>
      new Set(
        sectionClassEnrollments.map(
          (enrollment) => `${enrollment.enrollmentId}:${enrollment.subjectId}`,
        ),
      ),
    [sectionClassEnrollments],
  );

  const gradesByStudentSubject = useMemo(
    () =>
      new Map(
        sectionGrades.map((computation) => [
          `${computation.enrollmentId}:${computation.subjectId}`,
          computation,
        ]),
      ),
    [sectionGrades],
  );

  function getStudentGeneralAverage(student: EnrollmentStudent) {
    const totals = subjectColumns.reduce(
      (total, subject) => {
        const grade = gradesByStudentSubject.get(`${student.enrollmentId}:${subject.subjectId}`);

        if (!grade || subject.units <= 0) return total;

        return {
          weightedGrades: total.weightedGrades + Number(grade.finalGrade || 0) * subject.units,
          units: total.units + subject.units,
        };
      },
      { weightedGrades: 0, units: 0 },
    );

    return totals.units > 0 ? totals.weightedGrades / totals.units : null;
  }

  function getStudentSubjectGradeText(student: EnrollmentStudent, subject: SubjectColumn) {
    const key = `${student.enrollmentId}:${subject.subjectId}`;
    const hasSubject = enrollmentsByStudentSubject.has(key);
    const grade = gradesByStudentSubject.get(key);

    if (grade) return String(grade.finalGrade);
    if (hasSubject) return "Pending";
    return "-";
  }

  function openPrintableReport(title: string, body: string, pageCss = "") {
    const printWindow = window.open("", "_blank", "width=1100,height=800");

    if (!printWindow) {
      window.print();
      return;
    }

    const generatedAt = new Date().toLocaleString();

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body { color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; }
      header { border-bottom: 2px solid #0f172a; margin-bottom: 14px; padding-bottom: 8px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      h2 { font-size: 15px; margin: 0 0 4px; }
      p { margin: 2px 0; }
      .muted { color: #475569; }
      .page { padding: 12mm; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #e2e8f0; font-weight: 700; }
      .right { text-align: right; }
      .center { text-align: center; }
      .strong { font-weight: 700; }
      .no-print { margin: 12px; padding: 8px 12px; }
      @media print { .no-print { display: none; } }
      ${pageCss}
    </style>
  </head>
  <body>
    <button class="no-print" onclick="window.print()">Print / Save as PDF</button>
    ${body}
    <script>
      window.addEventListener("load", () => setTimeout(() => window.print(), 250));
    </script>
  </body>
</html>`);
    printWindow.document.close();
  }

  function printSectionSummary() {
    if (!selectedSection) return;

    const subjectHeaders = subjectColumns
      .map(
        (subject) =>
          `<th>${escapeHtml(subject.subjectName)}<br /><span class="muted">${escapeHtml(subject.subjectCode || "No code")} / ${escapeHtml(subject.units)} unit${subject.units === 1 ? "" : "s"}</span></th>`,
      )
      .join("");
    const rows = sectionStudents.length
      ? sectionStudents
          .map((student, index) => {
            const generalAverage = getStudentGeneralAverage(student);
            const grades = subjectColumns
              .map((subject) => `<td class="center">${escapeHtml(getStudentSubjectGradeText(student, subject))}</td>`)
              .join("");

            return `<tr>
              <td>${index + 1}</td>
              <td><span class="strong">${escapeHtml(student.displayName)}</span><br /><span class="muted">${escapeHtml(student.lrn)}</span></td>
              <td>${escapeHtml(formatSex(student.sex))}</td>
              ${grades}
              <td class="center strong">${escapeHtml(formatGeneralAverage(generalAverage))}</td>
              <td class="center strong">${escapeHtml(formatRoundedGeneralAverage(generalAverage))}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="${subjectColumns.length + 5}" class="center muted">No enrolled students found.</td></tr>`;

    openPrintableReport(
      `Summary of Grades - ${selectedSection.sectionName}`,
      `<section class="page">
        <header>
          <h1>Summary of Grades</h1>
          <p class="muted">School Year ${escapeHtml(schoolYear)} / ${escapeHtml(term)}</p>
          <p class="muted">Grade ${escapeHtml(selectedSection.gradeLevel)} / ${escapeHtml(selectedSection.strand)} / ${escapeHtml(selectedSection.sectionName)}</p>
          <p class="muted">Printed: ${escapeHtml(new Date().toLocaleString())}</p>
        </header>
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Student</th>
              <th>Sex</th>
              ${subjectHeaders}
              <th>Raw General Average</th>
              <th>General Average</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`,
      "@page { size: A4 landscape; margin: 10mm; }",
    );
  }

  function printStudentSummaries() {
    if (!selectedSection) return;

    const pages = sectionStudents.length
      ? sectionStudents
          .map((student) => {
            const generalAverage = getStudentGeneralAverage(student);
            const gradeRows = subjectColumns
              .map(
                (subject) => `<tr>
                  <td>${escapeHtml(subject.subjectName)}<br /><span class="muted">${escapeHtml(subject.subjectCode || "No code")}</span></td>
                  <td class="center">${escapeHtml(subject.units)}</td>
                  <td class="center strong">${escapeHtml(getStudentSubjectGradeText(student, subject))}</td>
                </tr>`,
              )
              .join("");

            return `<section class="page student-page">
              <header>
                <h1>Student Grade Summary</h1>
                <p class="muted">School Year ${escapeHtml(schoolYear)} / ${escapeHtml(term)}</p>
                <p class="muted">Grade ${escapeHtml(selectedSection.gradeLevel)} / ${escapeHtml(selectedSection.strand)} / ${escapeHtml(selectedSection.sectionName)}</p>
              </header>
              <h2>${escapeHtml(student.displayName)}</h2>
              <p class="muted">LRN: ${escapeHtml(student.lrn)} / Sex: ${escapeHtml(formatSex(student.sex))}</p>
              <table style="margin-top: 14px;">
                <thead><tr><th>Subject</th><th class="center">Units</th><th class="center">Grade</th></tr></thead>
                <tbody>${gradeRows || `<tr><td colspan="3" class="center muted">No subjects found.</td></tr>`}</tbody>
              </table>
              <table style="margin-top: 14px;">
                <tbody>
                  <tr><th>Raw General Average</th><td class="center strong">${escapeHtml(formatGeneralAverage(generalAverage))}</td></tr>
                  <tr><th>General Average</th><td class="center strong">${escapeHtml(formatRoundedGeneralAverage(generalAverage))}</td></tr>
                </tbody>
              </table>
            </section>`;
          })
          .join("")
      : `<section class="page"><p>No enrolled students found.</p></section>`;

    openPrintableReport(
      `Student Grade Summaries - ${selectedSection.sectionName}`,
      pages,
      "@page { size: A4 portrait; margin: 12mm; } .student-page { min-height: 297mm; page-break-after: always; } .student-page:last-child { page-break-after: auto; }",
    );
  }

  const encodedCount = sectionGrades.length;
  const expectedCount = sectionClassEnrollments.length;

  return (
    <section>
      <PageHeader
        actions={
          selectedSection && (
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={printSectionSummary}
                type="button"
              >
                <Printer size={16} />
                Print Section
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={printStudentSummaries}
                type="button"
              >
                <Printer size={16} />
                Print Students
              </button>
            </div>
          )
        }
        description="Read-only section grade summary from the final grades saved in Computation of Grades."
        title="Summary of Grades"
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          onChange={(event) => setSchoolYear(event.target.value)}
          value={schoolYear}
        />
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          onChange={(event) => setTerm(event.target.value as AcademicTerm)}
          value={term}
        >
          {termOptions.map((termOption) => (
            <option key={termOption} value={termOption}>
              {termOption}
            </option>
          ))}
        </select>
        {canViewAll && (
          <select
            className="h-10 min-w-64 rounded-md border border-slate-300 bg-white px-3 text-sm"
            onChange={(event) => setSelectedSectionId(event.target.value)}
            value={selectedSectionId}
          >
            {visibleSections.map((section) => (
              <option key={section.sectionId} value={section.sectionId}>
                {section.sectionName} - Grade {section.gradeLevel}
              </option>
            ))}
          </select>
        )}
      </div>

      {!canViewAll && !advisorySectionId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Your account is not assigned to an advisory section yet.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard detail="selected section" icon={Users} label="Students" value={sectionStudents.length} />
            <SummaryCard detail="subjects found" icon={BookOpen} label="Subjects" value={subjectColumns.length} />
            <SummaryCard detail={`${encodedCount}/${expectedCount} computed`} icon={ClipboardList} label="Grades" value={encodedCount} />
          </div>

          {selectedSection ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h2 className="text-base font-semibold text-slate-950">
                  {selectedSection.sectionName}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Grade {selectedSection.gradeLevel} / {selectedSection.strand} / {term}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="w-16 px-4 py-3 font-semibold">No.</th>
                      <th className="min-w-64 px-4 py-3 font-semibold">Student</th>
                      <th className="w-24 px-4 py-3 font-semibold">Sex</th>
                      {subjectColumns.map((subject) => (
                        <th className="min-w-36 px-3 py-3 font-semibold" key={subject.subjectId}>
                          <span className="block">{subject.subjectName}</span>
                          <span className="mt-1 block text-[11px] font-normal text-slate-300">
                            {subject.subjectCode || "No code"}
                          </span>
                          <span className="mt-1 block text-[11px] font-normal text-slate-300">
                            {subject.units} unit{subject.units === 1 ? "" : "s"}
                          </span>
                        </th>
                      ))}
                      <th className="min-w-36 px-3 py-3 font-semibold">Raw General Average</th>
                      <th className="min-w-36 px-3 py-3 font-semibold">General Average</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {sectionStudents.map((student, index) => {
                      const generalAverage = getStudentGeneralAverage(student);

                      return (
                        <tr className="hover:bg-slate-50/70" key={student.enrollmentId}>
                          <td className="px-4 py-3 align-middle text-slate-500">{index + 1}</td>
                          <td className="px-4 py-3 align-middle">
                            <p className="font-semibold text-slate-950">{student.displayName}</p>
                            <p className="mt-1 text-xs text-slate-500">{student.lrn}</p>
                          </td>
                          <td className="px-4 py-3 align-middle">{formatSex(student.sex)}</td>
                          {subjectColumns.map((subject) => {
                            const key = `${student.enrollmentId}:${subject.subjectId}`;
                            const hasSubject = enrollmentsByStudentSubject.has(key);
                            const grade = gradesByStudentSubject.get(key);

                            return (
                              <td className="px-3 py-3 align-middle" key={subject.subjectId}>
                                {grade ? (
                                  <span className="font-bold text-slate-950">{grade.finalGrade}</span>
                                ) : hasSubject ? (
                                  <span className="text-xs font-medium text-amber-700">Pending</span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 align-middle font-bold text-slate-950">
                            {formatGeneralAverage(generalAverage)}
                          </td>
                          <td className="px-3 py-3 align-middle font-bold text-slate-950">
                            {formatRoundedGeneralAverage(generalAverage)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sectionStudents.length === 0 && (
                <div className="p-5 text-sm text-slate-600">
                  No enrolled students found for this section.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
              No section is available for this school year.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
