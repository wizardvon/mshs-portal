import { BookOpen, CheckCircle2, Printer, Save, Users } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { SummaryCard } from "../components/common/SummaryCard";
import { useAuth } from "../providers/AuthProvider";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeClassEnrollments, subscribeEnrollmentStudents } from "../services/enrollmentService";
import {
  getGradeSubmissionId,
  subscribeGradeSubmissionsByTeacher,
  upsertGradeSubmissions,
} from "../services/gradeSubmissionService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import { subscribeTeachers } from "../services/teacherService";
import type {
  AcademicSettings,
  AcademicTerm,
  ClassEnrollment,
  EnrollmentStudent,
  GradeSubmission,
  LoadAssignment,
  Section,
  Subject,
  Teacher,
} from "../types/loading";
import { termOptions } from "../types/loading";

type AssignedClass = {
  assignment: LoadAssignment;
  subjectName: string;
  subjectCode: string;
  sectionName: string;
};

type RosterRow = {
  classEnrollment: ClassEnrollment;
  student?: EnrollmentStudent;
  existingGrade?: GradeSubmission;
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

function getStudentSortName(row: RosterRow) {
  const student = row.student;
  if (student) return `${student.lastName} ${student.firstName} ${student.middleName ?? ""}`;
  return row.classEnrollment.studentName;
}

function sanitizeGradeInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 3);
}

function parseGrade(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  const grade = Number(value);
  if (!Number.isInteger(grade) || grade < 60 || grade > 100) return null;
  return grade;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function GradeSubmissionsPage() {
  const { profile } = useAuth();
  const assignedTeacherId = profile?.role === "teacher" || profile?.role === "master_teacher"
    ? profile.assignedTeacherId ?? ""
    : "";
  const [academicSettings, setAcademicSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [schoolYear, setSchoolYear] = useState(defaultAcademicSettings.currentSchoolYear);
  const [term, setTerm] = useState<AcademicTerm>(defaultAcademicSettings.currentTerm);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [classEnrollments, setClassEnrollments] = useState<ClassEnrollment[]>([]);
  const [students, setStudents] = useState<EnrollmentStudent[]>([]);
  const [gradeSubmissions, setGradeSubmissions] = useState<GradeSubmission[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => subscribeAcademicSettings(setAcademicSettings), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeLoadAssignments(setAssignments), []);
  useEffect(() => subscribeClassEnrollments(setClassEnrollments), []);
  useEffect(() => subscribeEnrollmentStudents(setStudents), []);
  useEffect(
    () => subscribeGradeSubmissionsByTeacher(assignedTeacherId, setGradeSubmissions),
    [assignedTeacherId],
  );

  useEffect(() => {
    setSchoolYear(academicSettings.currentSchoolYear);
    setTerm(academicSettings.currentTerm);
  }, [academicSettings.currentSchoolYear, academicSettings.currentTerm]);

  const teacher = useMemo(
    () => teachers.find((item) => item.teacherId === assignedTeacherId),
    [assignedTeacherId, teachers],
  );

  const studentsByEnrollmentId = useMemo(
    () => new Map(students.map((student) => [student.enrollmentId, student])),
    [students],
  );

  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.subjectId, subject])),
    [subjects],
  );

  const sectionsById = useMemo(
    () => new Map(sections.map((section) => [section.sectionId, section])),
    [sections],
  );

  const gradeSubmissionsById = useMemo(
    () =>
      new Map(
        gradeSubmissions.map((submission) => [submission.gradeSubmissionId, submission]),
      ),
    [gradeSubmissions],
  );

  const assignedClasses = useMemo<AssignedClass[]>(
    () =>
      assignments
        .filter(
          (assignment) =>
            assignment.teacherId === assignedTeacherId &&
            assignment.schoolYear === schoolYear &&
            assignment.term === term,
        )
        .map((assignment) => {
          const sampleEnrollment = classEnrollments.find(
            (enrollment) =>
              enrollment.schoolYear === assignment.schoolYear &&
              enrollment.term === assignment.term &&
              enrollment.subjectId === assignment.subjectId &&
              enrollment.sectionId === assignment.sectionId,
          );

          return {
            assignment,
            subjectName:
              sampleEnrollment?.subjectName ??
              subjectsById.get(assignment.subjectId)?.subjectName ??
              assignment.subjectId,
            subjectCode:
              sampleEnrollment?.subjectCode ??
              subjectsById.get(assignment.subjectId)?.subjectCode ??
              "",
            sectionName:
              sampleEnrollment?.sectionName ??
              sectionsById.get(assignment.sectionId)?.sectionName ??
              assignment.sectionId,
          };
        })
        .sort((first, second) =>
          `${first.sectionName} ${first.subjectName}`.localeCompare(
            `${second.sectionName} ${second.subjectName}`,
          ),
        ),
    [assignedTeacherId, assignments, classEnrollments, schoolYear, sectionsById, subjectsById, term],
  );

  useEffect(() => {
    if (
      selectedAssignmentId &&
      assignedClasses.some((classItem) => classItem.assignment.assignmentId === selectedAssignmentId)
    ) {
      return;
    }

    setSelectedAssignmentId(assignedClasses[0]?.assignment.assignmentId ?? "");
  }, [assignedClasses, selectedAssignmentId]);

  const selectedClass = useMemo(
    () =>
      assignedClasses.find(
        (classItem) => classItem.assignment.assignmentId === selectedAssignmentId,
      ) ?? null,
    [assignedClasses, selectedAssignmentId],
  );

  const rosterRows = useMemo<RosterRow[]>(() => {
    if (!selectedClass) return [];

    return classEnrollments
      .filter(
        (enrollment) =>
          enrollment.status === "enrolled" &&
          enrollment.schoolYear === selectedClass.assignment.schoolYear &&
          enrollment.term === selectedClass.assignment.term &&
          enrollment.subjectId === selectedClass.assignment.subjectId &&
          enrollment.sectionId === selectedClass.assignment.sectionId &&
          enrollment.teacherId === assignedTeacherId,
      )
      .map((classEnrollment) => {
        const gradeSubmissionId = getGradeSubmissionId(
          selectedClass.assignment.assignmentId,
          classEnrollment.enrollmentId,
        );

        return {
          classEnrollment,
          student: studentsByEnrollmentId.get(classEnrollment.enrollmentId),
          existingGrade: gradeSubmissionsById.get(gradeSubmissionId),
        };
      })
      .sort((first, second) => {
        const sexSort =
          sexSortValue(first.student?.sex) - sexSortValue(second.student?.sex);

        if (sexSort !== 0) return sexSort;

        return getStudentSortName(first).localeCompare(getStudentSortName(second));
      });
  }, [
    assignedTeacherId,
    classEnrollments,
    gradeSubmissionsById,
    selectedClass,
    studentsByEnrollmentId,
  ]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};

    rosterRows.forEach((row) => {
      nextDrafts[row.classEnrollment.classEnrollmentId] =
        row.existingGrade?.grade !== undefined ? String(row.existingGrade.grade) : "";
    });

    setDrafts(nextDrafts);
    setMessage("");
    setError("");
  }, [rosterRows]);

  const summary = useMemo(
    () => ({
      assignedClasses: assignedClasses.length,
      students: rosterRows.length,
      encoded: rosterRows.filter((row) => {
        const draft = drafts[row.classEnrollment.classEnrollmentId] ?? "";
        return parseGrade(draft) !== null;
      }).length,
    }),
    [assignedClasses.length, drafts, rosterRows],
  );

  function updateDraft(classEnrollmentId: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [classEnrollmentId]: sanitizeGradeInput(value),
    }));
    setError("");
    setMessage("");
  }

  function handleGradeKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    inputRefs.current[index + 1]?.focus();
    inputRefs.current[index + 1]?.select();
  }

  async function saveGrades() {
    if (!profile || !assignedTeacherId || !selectedClass) {
      setError("Your user account must be linked to a teacher record before submitting grades.");
      return;
    }

    const invalidRows = rosterRows.filter((row) => {
      const value = drafts[row.classEnrollment.classEnrollmentId] ?? "";
      return value.trim() !== "" && parseGrade(value) === null;
    });

    if (invalidRows.length > 0) {
      setError("Grades must be whole numbers from 60 to 100.");
      return;
    }

    const rowsToSave = rosterRows.filter((row) => {
      const value = drafts[row.classEnrollment.classEnrollmentId] ?? "";
      return parseGrade(value) !== null;
    });

    if (rowsToSave.length === 0) {
      setError("Enter at least one valid grade before saving.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      await upsertGradeSubmissions(
        rowsToSave.map((row) => {
          const grade = parseGrade(drafts[row.classEnrollment.classEnrollmentId] ?? "");

          return {
            exists: Boolean(row.existingGrade),
            submission: {
              assignmentId: selectedClass.assignment.assignmentId,
              classEnrollmentId: row.classEnrollment.classEnrollmentId,
              enrollmentId: row.classEnrollment.enrollmentId,
              lrn: row.classEnrollment.lrn,
              studentName: row.student?.displayName ?? row.classEnrollment.studentName,
              schoolYear: selectedClass.assignment.schoolYear,
              term: selectedClass.assignment.term,
              teacherId: assignedTeacherId,
              teacherName: teacher?.fullName ?? profile.fullName,
              subjectId: selectedClass.assignment.subjectId,
              subjectCode: row.classEnrollment.subjectCode,
              subjectName: row.classEnrollment.subjectName,
              sectionId: selectedClass.assignment.sectionId,
              sectionName: row.classEnrollment.sectionName,
              gradeLevel: selectedClass.assignment.gradeLevel,
              strand: selectedClass.assignment.strand,
              grade: grade ?? 0,
              submittedBy: profile.userId,
            },
          };
        }),
      );

      setMessage(`Saved ${rowsToSave.length} grade${rowsToSave.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to save grades.");
    } finally {
      setSaving(false);
    }
  }

  function printSelectedSubjectSection() {
    if (!selectedClass) return;

    const printWindow = window.open("", "_blank", "width=1100,height=800");

    if (!printWindow) {
      window.print();
      return;
    }

    const rows = rosterRows.length
      ? rosterRows
          .map((row, index) => {
            const draft = drafts[row.classEnrollment.classEnrollmentId] ?? "";
            const grade = parseGrade(draft);
            const status = row.existingGrade
              ? "Saved"
              : grade !== null
                ? "Ready"
                : "Blank";

            return `<tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(row.student?.displayName ?? row.classEnrollment.studentName)}</strong><br /><span class="muted">${escapeHtml(row.classEnrollment.lrn)}</span></td>
              <td>${escapeHtml(formatSex(row.student?.sex))}</td>
              <td class="center strong">${escapeHtml(grade ?? "")}</td>
              <td>${escapeHtml(status)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5" class="center muted">No enrolled students found.</td></tr>`;

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(selectedClass.subjectName)} - ${escapeHtml(selectedClass.sectionName)}</title>
    <style>
      * { box-sizing: border-box; }
      body { color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; }
      .page { padding: 12mm; }
      header { border-bottom: 2px solid #0f172a; margin-bottom: 14px; padding-bottom: 8px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      p { margin: 2px 0; }
      .muted { color: #475569; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
      th { background: #e2e8f0; font-weight: 700; }
      .center { text-align: center; }
      .strong { font-weight: 700; }
      .signature-grid { display: grid; gap: 24px; grid-template-columns: repeat(2, 1fr); margin-top: 34px; }
      .signature-line { border-top: 1px solid #0f172a; padding-top: 5px; text-align: center; }
      .no-print { margin: 12px; padding: 8px 12px; }
      @page { size: A4 portrait; margin: 12mm; }
      @media print { .no-print { display: none; } }
    </style>
  </head>
  <body>
    <button class="no-print" onclick="window.print()">Print / Save as PDF</button>
    <section class="page">
      <header>
        <h1>Grade Submission</h1>
        <p class="muted">School Year ${escapeHtml(schoolYear)} / ${escapeHtml(term)}</p>
        <p class="muted">Teacher: ${escapeHtml(teacher?.fullName ?? profile?.fullName ?? "")}</p>
        <p class="muted">Subject: ${escapeHtml(selectedClass.subjectName)} ${selectedClass.subjectCode ? `(${escapeHtml(selectedClass.subjectCode)})` : ""}</p>
        <p class="muted">Section: ${escapeHtml(selectedClass.sectionName)} / Grade ${escapeHtml(selectedClass.assignment.gradeLevel)} / ${escapeHtml(selectedClass.assignment.strand)}</p>
        <p class="muted">Printed: ${escapeHtml(new Date().toLocaleString())}</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Student</th>
            <th>Sex</th>
            <th class="center">Grade</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="signature-grid">
        <div class="signature-line">Submitted by</div>
        <div class="signature-line">Checked by</div>
      </div>
    </section>
    <script>
      window.addEventListener("load", () => setTimeout(() => window.print(), 250));
    </script>
  </body>
</html>`);
    printWindow.document.close();
  }

  return (
    <section>
      <PageHeader
        description="Encode grades only for subject-sections assigned to your teacher account."
        title="Grade Submission"
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
      </div>

      {(message || error) && (
        <p className={`mb-5 rounded-md px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </p>
      )}

      {!assignedTeacherId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Your account is not linked to a teacher record yet.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard detail="assigned to you" icon={BookOpen} label="Subject-Sections" value={summary.assignedClasses} />
            <SummaryCard detail="selected class" icon={Users} label="Students" value={summary.students} />
            <SummaryCard detail="valid entries" icon={CheckCircle2} label="Encoded Grades" value={summary.encoded} />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assignedClasses.map((classItem) => {
              const selected = classItem.assignment.assignmentId === selectedAssignmentId;

              return (
                <button
                  className={[
                    "rounded-md border bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50",
                    selected ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200",
                  ].join(" ")}
                  key={classItem.assignment.assignmentId}
                  onClick={() => setSelectedAssignmentId(classItem.assignment.assignmentId)}
                  type="button"
                >
                  <p className="font-semibold text-slate-950">{classItem.subjectName}</p>
                  <p className="mt-1 text-sm text-slate-600">{classItem.sectionName}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {classItem.subjectCode || "No code"} / Grade {classItem.assignment.gradeLevel} / {classItem.assignment.strand}
                  </p>
                </button>
              );
            })}
          </div>

          {assignedClasses.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
              No subject-section loads are assigned to you for this school year and term.
            </div>
          )}

          {selectedClass && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    {selectedClass.subjectName} - {selectedClass.sectionName}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Grade {selectedClass.assignment.gradeLevel} / {selectedClass.assignment.strand} / {term}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={rosterRows.length === 0}
                    onClick={printSelectedSubjectSection}
                    type="button"
                  >
                    <Printer size={16} /> Print
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
                    disabled={saving || rosterRows.length === 0}
                    onClick={() => void saveGrades()}
                    type="button"
                  >
                    <Save size={16} /> {saving ? "Saving..." : "Save Grades"}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="w-16 px-4 py-3 font-semibold">No.</th>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="w-24 px-4 py-3 font-semibold">Sex</th>
                      <th className="w-36 px-4 py-3 font-semibold">Grade</th>
                      <th className="w-32 px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rosterRows.map((row, index) => {
                      const draft = drafts[row.classEnrollment.classEnrollmentId] ?? "";
                      const validGrade = parseGrade(draft);
                      const invalid = draft.trim() !== "" && validGrade === null;

                      return (
                        <tr className="hover:bg-slate-50/70" key={row.classEnrollment.classEnrollmentId}>
                          <td className="px-4 py-3 align-middle text-slate-500">{index + 1}</td>
                          <td className="px-4 py-3 align-middle">
                            <p className="font-semibold text-slate-950">
                              {row.student?.displayName ?? row.classEnrollment.studentName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{row.classEnrollment.lrn}</p>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {formatSex(row.student?.sex)}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <input
                              aria-label={`Grade for ${row.student?.displayName ?? row.classEnrollment.studentName}`}
                              className={[
                                "h-10 w-24 rounded-md border px-3 text-center font-semibold outline-none",
                                invalid
                                  ? "border-red-300 bg-red-50 text-red-700 ring-1 ring-red-200"
                                  : "border-slate-300 text-slate-950 focus:border-blue-300 focus:ring-2 focus:ring-blue-100",
                              ].join(" ")}
                              inputMode="numeric"
                              onChange={(event) => updateDraft(row.classEnrollment.classEnrollmentId, event.target.value)}
                              onKeyDown={(event) => handleGradeKeyDown(event, index)}
                              pattern="[0-9]*"
                              ref={(element) => {
                                inputRefs.current[index] = element;
                              }}
                              value={draft}
                            />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {row.existingGrade ? (
                              <StatusBadge label="Saved" tone="green" />
                            ) : validGrade !== null ? (
                              <StatusBadge label="Ready" tone="blue" />
                            ) : (
                              <StatusBadge label="Blank" tone="slate" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {rosterRows.length === 0 && (
                <div className="p-5 text-sm text-slate-600">
                  No enrolled students found for this subject-section.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
