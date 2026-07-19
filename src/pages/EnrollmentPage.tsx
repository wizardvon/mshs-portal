import {
  BookOpenCheck,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ModalForm } from "../components/common/ModalForm";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { subscribeCurriculumMappings } from "../services/curriculumService";
import {
  addClassEnrollmentsForStudents,
  deleteClassEnrollmentsForStudent,
  deleteEnrollmentStudent,
  importEnrollmentStudents,
  replaceClassEnrollmentsForStudent,
  saveEnrollmentStudent,
  subscribeClassEnrollments,
  subscribeEnrollmentStudents,
  updateEnrollmentStudent,
  type ClassSubjectEnrollmentInput,
} from "../services/enrollmentService";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import type {
  AcademicTerm,
  ClassEnrollment,
  CurriculumMapping,
  EnrollmentStatus,
  EnrollmentStudent,
  LoadAssignment,
  Section,
  Subject,
} from "../types/loading";
import { defaultSchoolYear, defaultTerm, termOptions } from "../types/loading";

type StudentForm = Omit<
  EnrollmentStudent,
  "enrollmentId" | "schoolYear" | "gradeLevel" | "strand" | "sectionId" | "sectionName" | "createdAt" | "updatedAt"
>;
type ImportedStudent = Omit<EnrollmentStudent, "enrollmentId" | "createdAt" | "updatedAt">;

const emptyStudentForm: StudentForm = {
  lrn: "",
  displayName: "",
  lastName: "",
  firstName: "",
  middleName: "",
  sex: "",
  age: undefined,
  birthDate: "",
  shsAdmissionDate: "",
  completedLevel: "",
  completionDate: "",
  jhsGeneralAverage: "",
  oldHsGeneralAverage: "",
  peptRating: "",
  alsRating: "",
  assessmentDate: "",
  learningCenter: "",
  previousSchoolName: "",
  previousSchoolAddress: "",
  eligibilityNotes: "",
  status: "enrolled",
};

const templateHeaders = {
  displayName: "nameofstudent",
  lastName: "lastname",
  firstName: "firstname",
  middleName: "middlename",
  lrn: "lrn",
  sex: "sex",
  age: "age",
  birthDate: "dateofbirthmmddyyyy",
  shsAdmissionDate: "dateofshsadmissionmmddyyyy",
  completedLevel: "completedlevel",
  completionDate: "dateofcompletionmmddyyyy",
  jhsGeneralAverage: "genaveragejhscompleter",
  oldHsGeneralAverage: "genaverageoldhscompleter",
  peptRating: "ratingpeptpasser",
  alsRating: "ratingalsaepasser",
  assessmentDate: "dateofassessmentmmddyyyy",
  learningCenter: "nameaddressofcommunitylearningcenter",
  previousSchoolName: "nameofschool",
  previousSchoolAddress: "schooladdress",
  eligibilityNotes: "othersplsspecify",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asText(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function asOptionalNumber(value: unknown) {
  const text = asText(value);
  if (!text) return undefined;
  const numberValue = Number(text);
  return Number.isNaN(numberValue) ? undefined : numberValue;
}

function excelDateToText(value: unknown) {
  if (value instanceof Date) return value.toLocaleDateString("en-US");
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US");
  }
  return asText(value);
}

function buildDisplayName(form: StudentForm) {
  if (form.displayName.trim()) return form.displayName.trim();
  return [form.lastName, form.firstName, form.middleName].filter(Boolean).join(", ");
}

export function EnrollmentPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [term, setTerm] = useState<AcademicTerm>(defaultTerm);
  const [gradeLevel, setGradeLevel] = useState("11");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mappings, setMappings] = useState<CurriculumMapping[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [students, setStudents] = useState<EnrollmentStudent[]>([]);
  const [classEnrollments, setClassEnrollments] = useState<ClassEnrollment[]>([]);
  const [studentForm, setStudentForm] = useState<StudentForm>(emptyStudentForm);
  const [editingStudent, setEditingStudent] = useState<EnrollmentStudent | null>(null);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [expandedStudentId, setExpandedStudentId] = useState("");
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClassStudent, setEditingClassStudent] = useState<EnrollmentStudent | null>(null);
  const [selectedClassKeys, setSelectedClassKeys] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeCurriculumMappings(setMappings), []);
  useEffect(() => subscribeLoadAssignments(setAssignments), []);
  useEffect(() => subscribeEnrollmentStudents(setStudents), []);
  useEffect(() => subscribeClassEnrollments(setClassEnrollments), []);

  const availableSections = useMemo(
    () =>
      sections
        .filter(
          (section) =>
            section.status === "active" &&
            section.schoolYear === schoolYear &&
            section.gradeLevel === gradeLevel,
        )
        .sort((first, second) => first.sectionName.localeCompare(second.sectionName)),
    [gradeLevel, schoolYear, sections],
  );

  const selectedSection = useMemo(
    () => availableSections.find((section) => section.sectionId === selectedSectionId) ?? null,
    [availableSections, selectedSectionId],
  );

  useEffect(() => {
    if (selectedSectionId && availableSections.some((section) => section.sectionId === selectedSectionId)) {
      return;
    }
    setSelectedSectionId(availableSections[0]?.sectionId ?? "");
  }, [availableSections, selectedSectionId]);

  const roster = useMemo(
    () =>
      students
        .filter(
          (student) =>
            student.schoolYear === schoolYear &&
            student.sectionId === selectedSectionId,
        )
        .sort((first, second) =>
          `${first.lastName} ${first.firstName}`.localeCompare(`${second.lastName} ${second.firstName}`),
        ),
    [schoolYear, selectedSectionId, students],
  );

  useEffect(() => {
    const visibleIds = new Set(roster.map((student) => student.enrollmentId));
    setSelectedStudentIds((current) => current.filter((studentId) => visibleIds.has(studentId)));
  }, [roster]);

  const availableClassSubjects = useMemo(() => {
    const sectionsById = new Map(sections.map((section) => [section.sectionId, section]));
    const subjectsById = new Map(subjects.map((subject) => [subject.subjectId, subject]));
    const assignmentsByClass = new Map(
      assignments
        .filter((assignment) => assignment.schoolYear === schoolYear && assignment.term === term)
        .map((assignment) => [`${assignment.sectionId}:${assignment.subjectId}`, assignment]),
    );
    const uniqueOptions = new Map<string, ClassSubjectEnrollmentInput>();

    mappings
      .filter((mapping) => mapping.schoolYear === schoolYear && mapping.term === term)
      .forEach((mapping) => {
        const section = sectionsById.get(mapping.sectionId);
        const subject = subjectsById.get(mapping.subjectId);

        if (
          !section ||
          !subject ||
          section.status !== "active" ||
          subject.status !== "active" ||
          section.schoolYear !== schoolYear ||
          subject.term !== term ||
          subject.gradeLevel !== gradeLevel
        ) {
          return;
        }

        const key = `${section.sectionId}:${subject.subjectId}`;
        uniqueOptions.set(key, {
          section,
          subject,
          assignment: assignmentsByClass.get(key),
        });
      });

    return [...uniqueOptions.values()].sort((first, second) =>
      `${first.subject.subjectName} ${first.section.sectionName}`.localeCompare(
        `${second.subject.subjectName} ${second.section.sectionName}`,
      ),
    );
  }, [assignments, gradeLevel, mappings, schoolYear, sections, subjects, term]);

  const classEnrollmentCount = useMemo(
    () =>
      classEnrollments.filter(
        (enrollment) =>
          enrollment.schoolYear === schoolYear &&
          enrollment.term === term &&
          roster.some((student) => student.enrollmentId === enrollment.enrollmentId),
      ).length,
    [classEnrollments, roster, schoolYear, term],
  );

  const selectedStudents = useMemo(
    () => roster.filter((student) => selectedStudentIds.includes(student.enrollmentId)),
    [roster, selectedStudentIds],
  );

  function startAddStudent() {
    setEditingStudent(null);
    setStudentForm(emptyStudentForm);
    setStudentModalOpen(true);
  }

  function startEditStudent(student: EnrollmentStudent) {
    setEditingStudent(student);
    setStudentForm({
      lrn: student.lrn,
      displayName: student.displayName,
      lastName: student.lastName,
      firstName: student.firstName,
      middleName: student.middleName ?? "",
      sex: student.sex ?? "",
      age: student.age,
      birthDate: student.birthDate ?? "",
      shsAdmissionDate: student.shsAdmissionDate ?? "",
      completedLevel: student.completedLevel ?? "",
      completionDate: student.completionDate ?? "",
      jhsGeneralAverage: student.jhsGeneralAverage ?? "",
      oldHsGeneralAverage: student.oldHsGeneralAverage ?? "",
      peptRating: student.peptRating ?? "",
      alsRating: student.alsRating ?? "",
      assessmentDate: student.assessmentDate ?? "",
      learningCenter: student.learningCenter ?? "",
      previousSchoolName: student.previousSchoolName ?? "",
      previousSchoolAddress: student.previousSchoolAddress ?? "",
      eligibilityNotes: student.eligibilityNotes ?? "",
      status: student.status,
    });
    setStudentModalOpen(true);
  }

  async function saveStudent() {
    if (!selectedSection) return;
    const lrn = studentForm.lrn.trim();
    if (!lrn) {
      setError("LRN is required.");
      return;
    }

    const payload = {
      ...studentForm,
      lrn,
      displayName: buildDisplayName(studentForm),
      lastName: studentForm.lastName.trim(),
      firstName: studentForm.firstName.trim(),
      middleName: studentForm.middleName?.trim(),
      schoolYear,
      gradeLevel: selectedSection.gradeLevel,
      strand: selectedSection.strand,
      sectionId: selectedSection.sectionId,
      sectionName: selectedSection.sectionName,
    };

    if (editingStudent) await updateEnrollmentStudent(editingStudent.enrollmentId, payload);
    else await saveEnrollmentStudent(payload);
    setStudentModalOpen(false);
    setMessage(editingStudent ? "Student updated." : "Student added.");
    setError("");
  }

  async function removeStudent(student: EnrollmentStudent) {
    const confirmed = window.confirm(`Delete ${student.displayName} from this roster?`);
    if (!confirmed) return;
    await deleteClassEnrollmentsForStudent(student.enrollmentId);
    await deleteEnrollmentStudent(student.enrollmentId);
    setMessage("Student removed from the roster.");
  }

  async function importTemplate(file: File) {
    if (!selectedSection) return;
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "lrn"));

      if (headerIndex < 0) {
        setError("Could not find the LRN header. Use the enrollment template with headers on row 2.");
        return;
      }

      const headers = rows[headerIndex].map(normalizeHeader);
      const indexOf = (header: string) => headers.indexOf(header);
      const lrnIndex = indexOf(templateHeaders.lrn);

      if (lrnIndex < 0) {
        setError("The template must include an LRN column.");
        return;
      }

      const imported: Array<ImportedStudent | null> = rows
        .slice(headerIndex + 1)
        .map((row) => {
          const value = (key: keyof typeof templateHeaders) => {
            const index = indexOf(templateHeaders[key]);
            return index >= 0 ? row[index] : "";
          };
          const lrn = asText(row[lrnIndex]);
          const lastName = asText(value("lastName"));
          const firstName = asText(value("firstName"));
          const displayName = asText(value("displayName")) || [lastName, firstName].filter(Boolean).join(", ");

          if (!lrn || !displayName) return null;

          return {
            lrn,
            displayName,
            lastName,
            firstName,
            middleName: asText(value("middleName")),
            sex: asText(value("sex")),
            age: asOptionalNumber(value("age")),
            birthDate: excelDateToText(value("birthDate")),
            shsAdmissionDate: excelDateToText(value("shsAdmissionDate")),
            completedLevel: asText(value("completedLevel")),
            completionDate: excelDateToText(value("completionDate")),
            jhsGeneralAverage: asText(value("jhsGeneralAverage")),
            oldHsGeneralAverage: asText(value("oldHsGeneralAverage")),
            peptRating: asText(value("peptRating")),
            alsRating: asText(value("alsRating")),
            assessmentDate: excelDateToText(value("assessmentDate")),
            learningCenter: asText(value("learningCenter")),
            previousSchoolName: asText(value("previousSchoolName")),
            previousSchoolAddress: asText(value("previousSchoolAddress")),
            eligibilityNotes: asText(value("eligibilityNotes")),
            schoolYear,
            gradeLevel: selectedSection.gradeLevel,
            strand: selectedSection.strand,
            sectionId: selectedSection.sectionId,
            sectionName: selectedSection.sectionName,
            status: "enrolled" as EnrollmentStatus,
          };
        });

      const validStudents = imported.filter((student): student is ImportedStudent => student !== null);
      const uniqueByLrn = [...new Map(validStudents.map((student) => [student.lrn, student])).values()];
      await importEnrollmentStudents(uniqueByLrn);
      setMessage(`Imported ${uniqueByLrn.length} student(s) into ${selectedSection.sectionName}.`);
    } catch {
      setError("Unable to import this file. Use the enrollment template in .xlsx, .xls, or .csv format.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function classKey(option: ClassSubjectEnrollmentInput) {
    return `${option.section.sectionId}:${option.subject.subjectId}`;
  }

  function startBulkClassEnrollment() {
    setEditingClassStudent(null);
    setSelectedClassKeys([]);
    setClassModalOpen(true);
  }

  function startEditClassEnrollment(student: EnrollmentStudent) {
    setEditingClassStudent(student);
    setSelectedClassKeys(
      classEnrollments
        .filter(
          (enrollment) =>
            enrollment.enrollmentId === student.enrollmentId &&
            enrollment.schoolYear === schoolYear &&
            enrollment.term === term,
        )
        .map((enrollment) => `${enrollment.sectionId}:${enrollment.subjectId}`),
    );
    setClassModalOpen(true);
  }

  function toggleStudentSelection(studentId: string) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((selectedId) => selectedId !== studentId)
        : [...current, studentId],
    );
  }

  function toggleAllStudents() {
    if (selectedStudentIds.length === roster.length) {
      setSelectedStudentIds([]);
      return;
    }
    setSelectedStudentIds(roster.map((student) => student.enrollmentId));
  }

  function toggleClassSelection(key: string) {
    setSelectedClassKeys((current) =>
      current.includes(key)
        ? current.filter((selectedKey) => selectedKey !== key)
        : [...current, key],
    );
  }

  async function saveClassSubjectSelection() {
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const selectedOptions = availableClassSubjects.filter((option) =>
        selectedClassKeys.includes(classKey(option)),
      );

      if (editingClassStudent) {
        const result = await replaceClassEnrollmentsForStudent({
          options: selectedOptions,
          schoolYear,
          student: editingClassStudent,
          term,
        });
        setMessage(`Updated ${result.subjects} class-subject(s) for ${editingClassStudent.displayName}.`);
      } else {
        const result = await addClassEnrollmentsForStudents({
          options: selectedOptions,
          schoolYear,
          students: selectedStudents,
          term,
        });
        setMessage(
          `Enrolled ${result.students} student(s) into ${result.subjects} class-subject(s), ${result.records} record(s).`,
        );
      }
      setClassModalOpen(false);
      setSelectedStudentIds([]);
    } catch {
      setError("Unable to save class-subject enrollment right now.");
    } finally {
      setBusy(false);
    }
  }

  function enrollmentsForStudent(student: EnrollmentStudent) {
    return classEnrollments
      .filter(
        (enrollment) =>
          enrollment.enrollmentId === student.enrollmentId &&
          enrollment.schoolYear === schoolYear &&
          enrollment.term === term,
      )
      .sort((first, second) =>
        `${first.subjectName} ${first.sectionName}`.localeCompare(
          `${second.subjectName} ${second.sectionName}`,
        ),
      );
  }

  return (
    <section>
      <PageHeader
        description="Build section rosters from LRN-based records, then enroll the section into mapped subjects/classes."
        title="Enrollment"
      />

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[130px_160px_minmax(220px,1fr)_170px]">
          <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSchoolYear(event.target.value)} value={schoolYear} />
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setGradeLevel(event.target.value)} value={gradeLevel}>
            <option value="11">Grade 11</option>
            <option value="12">Grade 12</option>
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSelectedSectionId(event.target.value)} value={selectedSectionId}>
            {availableSections.length === 0 && <option value="">No section for this grade/year</option>}
            {availableSections.map((section) => (
              <option key={section.sectionId} value={section.sectionId}>
                {section.sectionName} - {section.strand}
              </option>
            ))}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setTerm(event.target.value as AcademicTerm)} value={term}>
            {termOptions.map((termOption) => <option key={termOption} value={termOption}>{termOption}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Roster</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{roster.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Available Class-Subjects</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{availableClassSubjects.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Class Enrollments</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{classEnrollmentCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Section</p>
          <p className="mt-2 truncate text-base font-bold text-slate-950">{selectedSection?.sectionName ?? "None"}</p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Enrollment template import</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Uses the DepEd-style template with grouped headers on row 1 and actual headers on row 2. LRN is read from the LRN column and stored as the student ID key.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={!selectedSection || busy} onClick={() => fileInputRef.current?.click()} type="button">
              <Upload size={16} /> {busy ? "Working..." : "Upload Excel"}
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={!selectedSection} onClick={startAddStudent} type="button">
              <Plus size={16} /> Add Student
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={!selectedSection || busy || selectedStudents.length === 0 || availableClassSubjects.length === 0} onClick={startBulkClassEnrollment} type="button">
              <BookOpenCheck size={16} /> Enroll to Class-Subject
            </button>
          </div>
        </div>
        {message && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <input accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importTemplate(file);
        }} ref={fileInputRef} type="file" />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {roster.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">No students enrolled in this section yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      aria-label="Select all students"
                      checked={roster.length > 0 && selectedStudentIds.length === roster.length}
                      className="h-4 w-4 rounded border-slate-300"
                      onChange={toggleAllStudents}
                      type="checkbox"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">LRN</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Sex</th>
                  <th className="px-4 py-3 font-semibold">Age</th>
                  <th className="px-4 py-3 font-semibold">Class-Subjects</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {roster.map((student) => {
                  const studentEnrollments = enrollmentsForStudent(student);
                  const expanded = expandedStudentId === student.enrollmentId;

                  return (
                    <Fragment key={student.enrollmentId}>
                      <tr className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 align-middle">
                          <input
                            aria-label={`Select ${student.displayName}`}
                            checked={selectedStudentIds.includes(student.enrollmentId)}
                            className="h-4 w-4 rounded border-slate-300"
                            onChange={() => toggleStudentSelection(student.enrollmentId)}
                            onClick={(event) => event.stopPropagation()}
                            type="checkbox"
                          />
                        </td>
                        <td
                          className="cursor-pointer px-4 py-3 align-middle"
                          onClick={() => setExpandedStudentId(expanded ? "" : student.enrollmentId)}
                        >
                          <span className="inline-flex items-center gap-2 font-mono text-xs">
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            {student.lrn}
                          </span>
                        </td>
                        <td
                          className="cursor-pointer px-4 py-3 align-middle"
                          onClick={() => setExpandedStudentId(expanded ? "" : student.enrollmentId)}
                        >
                          <span className="font-semibold text-slate-950">{student.displayName}</span>
                        </td>
                        <td className="px-4 py-3 align-middle">{student.sex || "-"}</td>
                        <td className="px-4 py-3 align-middle">{student.age ?? "-"}</td>
                        <td className="px-4 py-3 align-middle">{studentEnrollments.length}</td>
                        <td className="px-4 py-3 align-middle">
                          <StatusBadge label={student.status} tone={student.status === "enrolled" ? "green" : "slate"} />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex justify-end gap-2">
                            <button className="rounded-md border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" onClick={() => startEditClassEnrollment(student)} type="button">
                              <BookOpenCheck size={16} />
                            </button>
                            <button className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" onClick={() => startEditStudent(student)} type="button">
                              <Pencil size={16} />
                            </button>
                            <button className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => void removeStudent(student)} type="button">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${student.enrollmentId}-subjects`} className="bg-slate-50/70">
                          <td className="px-4 py-4" colSpan={8}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase text-slate-500">Enrolled Class-Subjects</p>
                                {studentEnrollments.length === 0 ? (
                                  <p className="mt-2 text-sm text-slate-500">No class-subjects enrolled yet.</p>
                                ) : (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {studentEnrollments.map((enrollment) => (
                                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200" key={enrollment.classEnrollmentId}>
                                        {enrollment.subjectCode} - {enrollment.subjectName} / {enrollment.sectionName}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => startEditClassEnrollment(student)} type="button">
                                <Pencil size={15} /> Edit Subjects
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalForm onClose={() => setStudentModalOpen(false)} onSubmit={saveStudent} open={studentModalOpen} title={editingStudent ? "Edit Student" : "Add Student"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="h-11 rounded-md border border-slate-300 px-3 disabled:bg-slate-100 disabled:text-slate-500" disabled={Boolean(editingStudent)} onChange={(event) => setStudentForm({ ...studentForm, lrn: event.target.value })} placeholder="LRN" required value={studentForm.lrn} />
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, status: event.target.value as EnrollmentStatus })} value={studentForm.status}>
            <option value="enrolled">Enrolled</option>
            <option value="transferred">Transferred</option>
            <option value="dropped">Dropped</option>
          </select>
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, lastName: event.target.value })} placeholder="Last Name" required value={studentForm.lastName} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, firstName: event.target.value })} placeholder="First Name" required value={studentForm.firstName} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, middleName: event.target.value })} placeholder="Middle Name" value={studentForm.middleName} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, displayName: event.target.value })} placeholder="Display Name" value={studentForm.displayName} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, sex: event.target.value })} placeholder="Sex" value={studentForm.sex} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, age: asOptionalNumber(event.target.value) })} placeholder="Age" type="number" value={studentForm.age ?? ""} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, birthDate: event.target.value })} placeholder="Date of Birth" value={studentForm.birthDate} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, shsAdmissionDate: event.target.value })} placeholder="SHS Admission Date" value={studentForm.shsAdmissionDate} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, previousSchoolName: event.target.value })} placeholder="Previous School" value={studentForm.previousSchoolName} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setStudentForm({ ...studentForm, previousSchoolAddress: event.target.value })} placeholder="School Address" value={studentForm.previousSchoolAddress} />
        </div>
      </ModalForm>

      <ModalForm
        onClose={() => setClassModalOpen(false)}
        onSubmit={saveClassSubjectSelection}
        open={classModalOpen}
        submitLabel={editingClassStudent ? "Save Subjects" : "Confirm Enrollment"}
        title={editingClassStudent ? `Edit Subjects - ${editingClassStudent.displayName}` : "Enroll to Class-Subject"}
      >
        <div className="space-y-3">
          {!editingClassStudent && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {selectedStudents.length} selected student(s)
            </p>
          )}
          {availableClassSubjects.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No class-subjects are available for this grade, school year, and term.
            </p>
          ) : (
            <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {availableClassSubjects.map((option) => {
                const key = classKey(option);
                const checked = selectedClassKeys.includes(key);

                return (
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-slate-50" key={key}>
                    <input
                      checked={checked}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                      onChange={() => toggleClassSelection(key)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-950">
                        {option.subject.subjectName} - {option.section.sectionName}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {option.subject.subjectCode} / Grade {option.subject.gradeLevel} / {option.section.strand}
                        {option.assignment?.teacherId ? " / Teacher assigned" : " / No teacher assigned"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </ModalForm>
    </section>
  );
}
