import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import printFooter from "../assets/print/footer.jpg";
import printHeader from "../assets/print/header.jpg";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { useAuth } from "../providers/AuthProvider";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeCollection } from "../services/firestoreCrud";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeTeachers } from "../services/teacherService";
import {
  createTosiaRequest,
  deleteAllTosiaRecords,
  deleteTosiaAssessment,
  deleteTosiaRequest,
  saveTosiaAssessment,
  subscribeTosiaAssessments,
  subscribeTosiaRequests,
  updateTosiaRequest,
} from "../services/tosiaService";
import type {
  AcademicSettings,
  AcademicTerm,
  LoadAssignment,
  Section,
  Subject,
  Teacher,
  TosiaAssessment,
  TosiaCompetency,
  TosiaItemResponse,
  TosiaRequest,
  TosiaRequestStatus,
  TosiaSkillLevel,
} from "../types/loading";
import { termOptions } from "../types/loading";

type CompetencyAnalysis = TosiaCompetency & {
  weight: number;
  suggestedItems: number;
  levelCounts: Record<TosiaSkillLevel, number>;
  levelItems: Record<TosiaSkillLevel, number[]>;
  averagePercent: number;
};

type ItemAnalysis = TosiaItemResponse & {
  competencyName: string;
  percent: number;
  remark: string;
};

type AssessmentSummary = {
  mappedItems: number;
  mean: number;
  mps: number;
  sd: number;
  lmc: string;
  mmc: string;
};

type SubjectAssessmentSummary = AssessmentSummary & {
  totalItems: number;
  totalStudents: number;
};

type FormState = Omit<TosiaAssessment, "createdAt" | "updatedAt">;

type RequestForm = {
  title: string;
  schoolYear: string;
  term: AcademicTerm;
  testName: string;
  dueDate: string;
  instructions: string;
};

const skillLevels: Array<{ value: TosiaSkillLevel; label: string; shortLabel: string }> = [
  { value: "remembering", label: "Remembering (Knowledge)", shortLabel: "R" },
  { value: "understanding", label: "Understanding (Comprehension/Application)", shortLabel: "U" },
  { value: "thinking", label: "Thinking (Analysis/Synthesis/Evaluation)", shortLabel: "T" },
];

const emptyRequestForm: RequestForm = {
  title: "TOSIA Pro Submission",
  schoolYear: defaultAcademicSettings.currentSchoolYear,
  term: defaultAcademicSettings.currentTerm,
  testName: "",
  dueDate: "",
  instructions: "",
};

const deleteAllPassword = "dxuxihnfwcls";

const emptyCompetency = (order: number): TosiaCompetency => ({
  competencyId: makeId("comp"),
  order,
  content: "",
  hours: 0,
  plannedItems: 0,
});

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function getTosiaClassKey(requestId: string, teacherId: string, subjectId: string, sectionId: string) {
  return `${requestId}:${teacherId}:${subjectId}:${sectionId}`;
}

function masteryRemark(percent: number) {
  if (percent > 75) return "Mastered";
  if (percent < 50) return "Not Mastered";
  return "Nearing Mastery";
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

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getTimestampMillis(value?: { toMillis?: () => number }) {
  return value?.toMillis?.() ?? 0;
}

function standardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function summarizeAssessment(assessment: Pick<TosiaAssessment, "competencies" | "itemResponses" | "totalItems" | "totalStudents">): AssessmentSummary {
  const itemResponses = normalizeTosiaItemResponses(assessment.itemResponses, assessment.totalItems, assessment.totalStudents);
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

function summarizeSubjectAssessments(assessments: TosiaAssessment[]): SubjectAssessmentSummary {
  const competencyTotals = new Map<string, { content: string; correct: number; possible: number }>();
  const sectionMpsValues: number[] = [];
  let mappedItems = 0;
  let totalCorrect = 0;
  let totalItems = 0;
  let totalPossible = 0;
  let totalStudents = 0;

  assessments.forEach((assessment) => {
    const studentCount = Math.max(0, Number(assessment.totalStudents || 0));
    const itemResponses = normalizeTosiaItemResponses(assessment.itemResponses, assessment.totalItems, studentCount);
    const competenciesById = new Map(assessment.competencies.map((competency) => [competency.competencyId, competency]));
    const assessmentTotalCorrect = itemResponses.reduce((sum, item) => sum + Number(item.correctResponses || 0), 0);
    const assessmentPossible = studentCount * itemResponses.length;

    totalStudents += studentCount;
    totalItems += itemResponses.length;
    totalCorrect += assessmentTotalCorrect;
    totalPossible += assessmentPossible;
    mappedItems += itemResponses.filter((item) => item.competencyId).length;
    sectionMpsValues.push(assessmentPossible > 0 ? (assessmentTotalCorrect / assessmentPossible) * 100 : 0);

    itemResponses.forEach((item) => {
      const content = competenciesById.get(item.competencyId)?.content.trim();
      if (!content) return;
      const key = content.toLowerCase();
      const current = competencyTotals.get(key) ?? { content, correct: 0, possible: 0 };
      current.correct += Number(item.correctResponses || 0);
      current.possible += studentCount;
      competencyTotals.set(key, current);
    });
  });

  const rankedCompetencies = Array.from(competencyTotals.values())
    .map((competency) => ({
      content: competency.content,
      percent: competency.possible > 0 ? (competency.correct / competency.possible) * 100 : 0,
    }))
    .sort((first, second) => first.percent - second.percent || first.content.localeCompare(second.content));

  return {
    mappedItems,
    mean: totalStudents > 0 ? totalCorrect / totalStudents : 0,
    mps: totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : 0,
    sd: standardDeviation(sectionMpsValues),
    lmc: rankedCompetencies[0]?.content || "No mapped competency",
    mmc: rankedCompetencies[rankedCompetencies.length - 1]?.content || "No mapped competency",
    totalItems,
    totalStudents,
  };
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createBlankForm(settings: AcademicSettings, profileName = ""): FormState {
  const firstCompetency = emptyCompetency(1);
  return {
    assessmentId: "",
    requestId: "",
    title: "TOSIA Pro Assessment",
    schoolYear: settings.currentSchoolYear,
    term: settings.currentTerm,
    quarter: "1st Summative Test",
    subjectId: "",
    subjectName: "",
    sectionId: "",
    sectionName: "",
    gradeLevel: "",
    strand: "",
    teacherId: "",
    teacherName: profileName,
    preparedBy: profileName,
    preparedByPosition: "",
    checkedBy: "",
    checkedByPosition: "",
    notedBy: "",
    notedByPosition: "",
    examDate: todayInputValue(),
    analysisDate: todayInputValue(),
    totalStudents: 0,
    totalItems: 30,
    competencies: [firstCompetency],
    itemResponses: buildItemResponses(30),
    createdBy: "",
    updatedBy: "",
  };
}

function buildItemResponses(totalItems: number, competencyId = ""): TosiaItemResponse[] {
  return Array.from({ length: Math.max(0, totalItems) }, (_, index) => ({
    itemNumber: index + 1,
    competencyId,
    skillLevel: "remembering",
    correctResponses: 0,
  }));
}

function normalizeTosiaItemResponses(itemResponses: TosiaItemResponse[], totalItems: number, totalStudents: number): TosiaItemResponse[] {
  const normalizedTotalItems = Math.max(0, Math.floor(Number(totalItems || itemResponses.length || 0)));
  const normalizedTotalStudents = Math.max(0, Number(totalStudents || 0));
  const byItemNumber = new Map<number, TosiaItemResponse>();

  itemResponses.forEach((item) => {
    const itemNumber = Math.floor(Number(item.itemNumber || 0));
    if (itemNumber < 1 || itemNumber > normalizedTotalItems || byItemNumber.has(itemNumber)) return;
    byItemNumber.set(itemNumber, {
      ...item,
      itemNumber,
      correctResponses: normalizeCorrectResponses(item.correctResponses, normalizedTotalStudents),
    });
  });

  return Array.from({ length: normalizedTotalItems }, (_, index) => {
    const itemNumber = index + 1;
    return byItemNumber.get(itemNumber) ?? {
      itemNumber,
      competencyId: "",
      skillLevel: "remembering" as TosiaItemResponse["skillLevel"],
      correctResponses: 0,
    };
  });
}

function formatNumbers(numbers: number[]) {
  return [...numbers].sort((first, second) => first - second).join(", ");
}

function parseItemNumbers(value: string, totalItems: number) {
  const numbers = new Set<number>();
  value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        const low = Math.min(start, end);
        const high = Math.max(start, end);
        for (let itemNumber = low; itemNumber <= high; itemNumber += 1) {
          if (itemNumber >= 1 && itemNumber <= totalItems) numbers.add(itemNumber);
        }
        return;
      }

      const itemNumber = Number(part);
      if (Number.isInteger(itemNumber) && itemNumber >= 1 && itemNumber <= totalItems) {
        numbers.add(itemNumber);
      }
    });

  return numbers;
}

function numberInputValue(value: number) {
  return Number(value || 0) === 0 ? "" : String(value);
}

function normalizeCorrectResponses(value: number, totalStudents: number) {
  const responses = Math.max(0, Number(value || 0));
  return totalStudents > 0 ? Math.min(totalStudents, responses) : responses;
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function printReport(title: string, body: string | string[], orientation: "portrait" | "landscape" = "portrait") {
  const printWindow = window.open("", "_blank", "width=1200,height=850");

  if (!printWindow) {
    window.print();
    return;
  }

  const pages = Array.isArray(body) ? body : [body];
  const pagesHtml = pages.map((pageBody) => `
    <main class="print-page">
      <img class="print-header-img" src="${printHeader}" alt="" />
      <img class="print-footer-img" src="${printFooter}" alt="" />
      <div class="print-content">${pageBody}</div>
    </main>
  `).join("");

  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: A4 ${orientation}; margin: 0; }
      body { background: #e5e7eb; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; }
      .no-print { position: fixed; z-index: 20; top: 10px; left: 10px; border: 0; border-radius: 8px; background: #7f1d1d; color: white; cursor: pointer; font: 700 12px Arial, sans-serif; padding: 9px 12px; }
      .print-page { position: relative; width: ${orientation === "landscape" ? "297mm" : "210mm"}; height: ${orientation === "landscape" ? "210mm" : "297mm"}; margin: 0 auto; overflow: hidden; background: white; break-after: page; page-break-after: always; }
      .print-page:last-child { break-after: auto; page-break-after: auto; }
      .print-header-img { position: absolute; z-index: 0; top: 0; left: 0; width: 100%; height: auto; display: block; }
      .print-footer-img { position: absolute; z-index: 0; bottom: 0; left: 0; width: 100%; height: auto; display: block; }
      .print-content { position: relative; z-index: 1; height: 100%; padding: ${orientation === "landscape" ? "49mm 10mm 23mm" : "49mm 12mm 24mm"}; font-size: 11px; }
      .report-heading { border-bottom: 1.5px solid #111827; margin-bottom: 9px; padding-bottom: 5px; text-align: center; }
      h1 { font-size: 15px; margin: 0 0 3px; text-transform: uppercase; }
      h2 { font-size: 11px; margin: 11px 0 5px; }
      p { font-size: 11px; margin: 2px 0; }
      table { border-collapse: collapse; font-size: 11px; margin-bottom: 9px; width: 100%; page-break-inside: auto; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 1px solid #94a3b8; padding: 3px 5px; text-align: left; vertical-align: top; }
      th { background: #e2e8f0; font-weight: 700; }
      .center { text-align: center; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 26px; page-break-inside: avoid; }
      .signatures div { text-align: center; }
      .signatures strong { border-top: 1px solid #111827; display: block; font-size: 11px; padding-top: 5px; }
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
    ${pagesHtml}
    <script>window.onload = () => { window.focus(); setTimeout(() => window.print(), 250); };</script>
  </body>
</html>`);
  printWindow.document.close();
}

export function TosiaProPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [requests, setRequests] = useState<TosiaRequest[]>([]);
  const [assessments, setAssessments] = useState<TosiaAssessment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [form, setForm] = useState<FormState>(() => createBlankForm(defaultAcademicSettings));
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm);
  const [editingRequestId, setEditingRequestId] = useState("");
  const [isRequestDetailsOpen, setIsRequestDetailsOpen] = useState(false);
  const [selectedCardKey, setSelectedCardKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [levelItemDrafts, setLevelItemDrafts] = useState<Record<string, string>>({});

  const isTeacherSubmitter = profile?.role === "teacher" || profile?.role === "master_teacher";
  const scopedTeacherId = isTeacherSubmitter ? profile?.assignedTeacherId ?? profile?.userId : undefined;
  const isReviewer = profile?.role === "admin" || profile?.role === "principal" || profile?.role === "master_teacher" || profile?.role === "super_admin";
  const canDelete = profile?.role === "super_admin";

  useEffect(() => subscribeAcademicSettings(setSettings), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeCollection<Section>("sections", setSections), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeLoadAssignments(setAssignments), []);
  useEffect(() => subscribeTosiaRequests(setRequests), []);
  useEffect(
    () => subscribeTosiaAssessments(setAssessments),
    [],
  );

  useEffect(() => {
    if (form.assessmentId) return;
    setForm((current) => ({
      ...current,
      schoolYear: settings.currentSchoolYear,
      term: settings.currentTerm,
      teacherId: profile?.assignedTeacherId ?? current.teacherId,
      teacherName: profile?.fullName ?? current.teacherName,
      preparedBy: current.preparedBy || profile?.fullName || "",
    }));
  }, [form.assessmentId, profile?.assignedTeacherId, profile?.fullName, settings.currentSchoolYear, settings.currentTerm]);

  useEffect(() => {
    setRequestForm((current) => ({
      ...current,
      schoolYear: settings.currentSchoolYear,
      term: settings.currentTerm,
    }));
  }, [settings.currentSchoolYear, settings.currentTerm]);

  const teachersById = useMemo(() => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])), [teachers]);
  const subjectsById = useMemo(() => new Map(subjects.map((subject) => [subject.subjectId, subject])), [subjects]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]);

  const selectedRequests = useMemo(
    () => requests.filter((request) => request.schoolYear === form.schoolYear && request.term === form.term),
    [form.schoolYear, form.term, requests],
  );

  const activeRequests = useMemo(
    () => selectedRequests.filter((request) => request.status === "active"),
    [selectedRequests],
  );

  const selectedRequest = useMemo(
    () => requests.find((request) => request.requestId === form.requestId),
    [form.requestId, requests],
  );

  const assessmentsByCardKey = useMemo(
    () =>
      new Map(
        assessments.map((assessment) => [
          getTosiaClassKey(assessment.requestId, assessment.teacherId, assessment.subjectId ?? "", assessment.sectionId ?? ""),
          assessment,
        ]),
      ),
    [assessments],
  );

  const teacherCards = useMemo(() => {
    if (!isTeacherSubmitter || !scopedTeacherId) return [];

    return activeRequests.flatMap((request) => {
      const requestClasses = assignments
        .filter((assignment) => assignment.teacherId === scopedTeacherId && assignment.schoolYear === request.schoolYear && assignment.term === request.term)
        .map((assignment) => ({
          assignment,
          teacher: teachersById.get(assignment.teacherId),
          subject: subjectsById.get(assignment.subjectId),
          section: sectionsById.get(assignment.sectionId),
        }))
        .filter((row): row is { assignment: LoadAssignment; teacher: Teacher; subject: Subject; section: Section } => Boolean(row.teacher && row.subject && row.section));

      return requestClasses.map((classRow) => {
        const key = getTosiaClassKey(request.requestId, scopedTeacherId, classRow.subject.subjectId, classRow.section.sectionId);
        return {
          key,
          request,
          ...classRow,
          assessment: assessmentsByCardKey.get(key),
        };
      });
    });
  }, [activeRequests, assessmentsByCardKey, assignments, isTeacherSubmitter, scopedTeacherId, sectionsById, subjectsById, teachersById]);

  const selectedTeacherCard = useMemo(
    () => teacherCards.find((card) => card.key === selectedCardKey),
    [selectedCardKey, teacherCards],
  );

  const subjectAssignmentRows = useMemo(() => {
    if (!selectedTeacherCard) return [];

    return assignments
      .filter(
        (assignment) =>
          assignment.schoolYear === selectedTeacherCard.request.schoolYear
          && assignment.term === selectedTeacherCard.request.term
          && assignment.subjectId === selectedTeacherCard.subject.subjectId,
      )
      .map((assignment) => ({
        assignment,
        teacher: teachersById.get(assignment.teacherId),
        section: sectionsById.get(assignment.sectionId),
        assessment: assessmentsByCardKey.get(
          getTosiaClassKey(
            selectedTeacherCard.request.requestId,
            assignment.teacherId,
            assignment.subjectId,
            assignment.sectionId,
          ),
        ),
      }))
      .sort((first, second) => {
        const teacherComparison = (first.teacher?.fullName ?? "").localeCompare(second.teacher?.fullName ?? "");
        if (teacherComparison !== 0) return teacherComparison;
        return (first.section?.sectionName ?? "").localeCompare(second.section?.sectionName ?? "");
      });
  }, [assessmentsByCardKey, assignments, sectionsById, selectedTeacherCard, teachersById]);

  const submittedSubjectAssessments = useMemo(
    () => subjectAssignmentRows.flatMap((row) => (row.assessment ? [row.assessment] : [])),
    [subjectAssignmentRows],
  );

  const subjectSummary = useMemo(
    () => summarizeSubjectAssessments(submittedSubjectAssessments),
    [submittedSubjectAssessments],
  );

  const assignedSubjectTeacherCount = useMemo(
    () => new Set(subjectAssignmentRows.map((row) => row.assignment.teacherId)).size,
    [subjectAssignmentRows],
  );

  const submittedSubjectTeacherCount = useMemo(
    () => new Set(submittedSubjectAssessments.map((assessment) => assessment.teacherId)).size,
    [submittedSubjectAssessments],
  );

  const canUseWorkspace = !isTeacherSubmitter || Boolean(selectedCardKey);

  const sameSubjectTemplates = useMemo(
    () =>
      assessments
        .filter((assessment) => assessment.assessmentId !== form.assessmentId)
        .filter((assessment) => assessment.competencies.some((competency) => competency.content.trim()))
        .filter((assessment) => {
          if (form.subjectId) return assessment.subjectId === form.subjectId;
          return Boolean(form.subjectName.trim()) && assessment.subjectName.trim().toLowerCase() === form.subjectName.trim().toLowerCase();
        })
        .sort((first, second) => {
          const requestMatchScore = Number(second.requestId === form.requestId) - Number(first.requestId === form.requestId);
          if (requestMatchScore !== 0) return requestMatchScore;
          return getTimestampMillis(second.updatedAt ?? second.createdAt) - getTimestampMillis(first.updatedAt ?? first.createdAt);
        }),
    [assessments, form.assessmentId, form.requestId, form.subjectId, form.subjectName],
  );

  const totalHours = useMemo(() => form.competencies.reduce((sum, competency) => sum + Number(competency.hours || 0), 0), [form.competencies]);
  const plannedItemTotal = useMemo(() => form.competencies.reduce((sum, competency) => sum + Number(competency.plannedItems || 0), 0), [form.competencies]);
  const itemsByCompetency = useMemo(() => {
    const grouped = new Map<string, TosiaItemResponse[]>();
    form.itemResponses.forEach((item) => {
      if (!item.competencyId) return;
      grouped.set(item.competencyId, [...(grouped.get(item.competencyId) ?? []), item]);
    });
    return grouped;
  }, [form.itemResponses]);

  const competencyAnalysis = useMemo<CompetencyAnalysis[]>(
    () =>
      form.competencies.map((competency) => {
        const items = itemsByCompetency.get(competency.competencyId) ?? [];
        const levelCounts = {
          remembering: items.filter((item) => item.skillLevel === "remembering").length,
          understanding: items.filter((item) => item.skillLevel === "understanding").length,
          thinking: items.filter((item) => item.skillLevel === "thinking").length,
        };
        const levelItems = {
          remembering: items.filter((item) => item.skillLevel === "remembering").map((item) => item.itemNumber),
          understanding: items.filter((item) => item.skillLevel === "understanding").map((item) => item.itemNumber),
          thinking: items.filter((item) => item.skillLevel === "thinking").map((item) => item.itemNumber),
        };
        const averagePercent =
          form.totalStudents > 0 && items.length > 0
            ? items.reduce((sum, item) => sum + (Number(item.correctResponses || 0) / form.totalStudents) * 100, 0) / items.length
            : 0;

        return {
          ...competency,
          weight: totalHours > 0 ? Number(competency.hours || 0) / totalHours : 0,
          suggestedItems: totalHours > 0 ? (form.totalItems * Number(competency.hours || 0)) / totalHours : 0,
          levelCounts,
          levelItems,
          averagePercent,
        };
      }),
    [form.competencies, form.totalItems, form.totalStudents, itemsByCompetency, totalHours],
  );

  const itemAnalysis = useMemo<ItemAnalysis[]>(
    () =>
      form.itemResponses.map((item) => {
        const percent = form.totalStudents > 0 ? (Number(item.correctResponses || 0) / form.totalStudents) * 100 : 0;
        return {
          ...item,
          competencyName: form.competencies.find((competency) => competency.competencyId === item.competencyId)?.content ?? "",
          percent,
          remark: masteryRemark(percent),
        };
      }),
    [form.competencies, form.itemResponses, form.totalStudents],
  );

  const rankedCompetencies = useMemo(
    () =>
      competencyAnalysis
        .filter((competency) => competency.content.trim() && (itemsByCompetency.get(competency.competencyId)?.length ?? 0) > 0)
        .sort((first, second) => first.averagePercent - second.averagePercent),
    [competencyAnalysis, itemsByCompetency],
  );

  const summary = useMemo(() => {
    const assessmentSummary = summarizeAssessment(form);
    return {
      ...assessmentSummary,
      lmc: rankedCompetencies[0]?.content || assessmentSummary.lmc,
      mmc: rankedCompetencies[rankedCompetencies.length - 1]?.content || assessmentSummary.mmc,
    };
  }, [form, rankedCompetencies]);

  function updateForm(updates: Partial<FormState>) {
    setForm((current) => ({ ...current, ...updates }));
  }

  function getExistingTosLabel(source: TosiaAssessment) {
    const sourceDate = formatDate(source.analysisDate || source.examDate);
    return [
      source.subjectName,
      source.teacherName ? `by ${source.teacherName}` : "",
      source.sectionName ? `(${source.sectionName})` : "",
      sourceDate ? `- ${sourceDate}` : "",
    ].filter(Boolean).join(" ");
  }

  function copyExistingTos(source: TosiaAssessment) {
    const competencyIdMap = new Map<string, string>();
    const competencies = source.competencies
      .filter((competency) => competency.content.trim())
      .map((competency, index) => {
        const competencyId = makeId("comp");
        competencyIdMap.set(competency.competencyId, competencyId);
        return {
          ...competency,
          competencyId,
          order: index + 1,
          content: competency.content.trim(),
          hours: Number(competency.hours || 0),
          plannedItems: Number(competency.plannedItems || 0),
        };
      });

    const copiedResponses = normalizeTosiaItemResponses(source.itemResponses, source.totalItems, source.totalStudents).map((item) => ({
      itemNumber: item.itemNumber,
      competencyId: competencyIdMap.get(item.competencyId) ?? "",
      skillLevel: item.skillLevel,
      correctResponses: 0,
    }));

    return {
      totalItems: Number(source.totalItems || copiedResponses.length || form.totalItems),
      competencies: competencies.length ? competencies : [emptyCompetency(1)],
      itemResponses: copiedResponses.length ? copiedResponses : buildItemResponses(Number(source.totalItems || form.totalItems)),
    };
  }

  function useExistingTos(assessmentId: string) {
    if (!assessmentId) return;
    const source = assessments.find((assessment) => assessment.assessmentId === assessmentId);
    if (!source) {
      setError("That existing TOS is no longer available.");
      setMessage("");
      return;
    }

    const hasCurrentTos = form.competencies.some((competency) => competency.content.trim()) || form.itemResponses.some((item) => item.competencyId);
    if (hasCurrentTos) {
      const confirmed = window.confirm(`Use the existing TOS from "${getExistingTosLabel(source)}"? This will replace Learning Competencies/Content and Item Map only. Correct Responses will stay blank.`);
      if (!confirmed) return;
    }

    const copiedTos = copyExistingTos(source);
    setLevelItemDrafts({});
    updateForm(copiedTos);
    setError("");
    setMessage("Existing TOS applied. Correct Responses were not copied.");
  }

  function openTeacherCard(card: (typeof teacherCards)[number]) {
    setSelectedCardKey(card.key);
    setError("");
    setMessage("");

    if (card.assessment) {
      setForm({
        ...card.assessment,
        itemResponses: card.assessment.itemResponses.length
          ? normalizeTosiaItemResponses(card.assessment.itemResponses, card.assessment.totalItems, card.assessment.totalStudents)
          : buildItemResponses(card.assessment.totalItems),
      });
      return;
    }

    const blankForm = createBlankForm(
      {
        ...settings,
        currentSchoolYear: card.request.schoolYear,
        currentTerm: card.request.term,
      },
      card.teacher.fullName,
    );

    setForm({
      ...blankForm,
      requestId: card.request.requestId,
      title: card.request.title,
      schoolYear: card.request.schoolYear,
      term: card.request.term,
      quarter: card.request.testName,
      subjectId: card.subject.subjectId,
      subjectName: card.subject.subjectName,
      sectionId: card.section.sectionId,
      sectionName: card.section.sectionName,
      gradeLevel: card.section.gradeLevel,
      strand: card.section.strand,
      teacherId: card.teacher.teacherId,
      teacherName: card.teacher.fullName,
      preparedBy: card.teacher.fullName,
      preparedByPosition: card.teacher.position,
      examDate: card.request.dueDate || blankForm.examDate,
      analysisDate: card.request.dueDate || blankForm.analysisDate,
    });
  }

  function selectAssessment(assessmentId: string) {
    const selected = assessments.find((assessment) => assessment.assessmentId === assessmentId);
    setSelectedCardKey("");
    setError("");
    setMessage("");
    if (!selected) {
      setForm(createBlankForm(settings, profile?.fullName ?? ""));
      return;
    }
    setForm({
      ...selected,
      itemResponses: selected.itemResponses.length
        ? normalizeTosiaItemResponses(selected.itemResponses, selected.totalItems, selected.totalStudents)
        : buildItemResponses(selected.totalItems),
    });
  }

  function updateTotalItems(value: number) {
    const nextTotal = Math.max(1, Math.floor(value || 1));
    const currentByNumber = new Map(form.itemResponses.map((item) => [item.itemNumber, item]));
    const nextResponses = Array.from({ length: nextTotal }, (_, index) => {
      const itemNumber = index + 1;
      return currentByNumber.get(itemNumber) ?? {
        itemNumber,
        competencyId: "",
        skillLevel: "remembering" as TosiaSkillLevel,
        correctResponses: 0,
      };
    });

    updateForm({ totalItems: nextTotal, itemResponses: nextResponses });
  }

  function updateCompetency(competencyId: string, updates: Partial<TosiaCompetency>) {
    updateForm({
      competencies: form.competencies.map((competency) =>
        competency.competencyId === competencyId ? { ...competency, ...updates } : competency,
      ),
    });
  }

  function addCompetency() {
    updateForm({
      competencies: [...form.competencies, emptyCompetency(form.competencies.length + 1)],
    });
  }

  function removeCompetency(competencyId: string) {
    if (form.competencies.length <= 1) return;
    const remaining = form.competencies
      .filter((competency) => competency.competencyId !== competencyId)
      .map((competency, index) => ({ ...competency, order: index + 1 }));
    updateForm({
      competencies: remaining,
      itemResponses: form.itemResponses.map((item) => ({
        ...item,
        competencyId: item.competencyId === competencyId ? "" : item.competencyId,
      })),
    });
  }

  function updateItem(itemNumber: number, updates: Partial<TosiaItemResponse>) {
    updateForm({
      itemResponses: form.itemResponses.map((item) =>
        item.itemNumber === itemNumber ? { ...item, ...updates } : item,
      ),
    });
  }

  function updateCompetencyLevelItems(competencyId: string, skillLevel: TosiaSkillLevel, value: string) {
    const enteredItems = parseItemNumbers(value, form.totalItems);
    updateForm({
      itemResponses: form.itemResponses.map((item) => {
        const isCurrentCell = item.competencyId === competencyId && item.skillLevel === skillLevel;
        if (enteredItems.has(item.itemNumber)) {
          return { ...item, competencyId, skillLevel };
        }
        if (isCurrentCell) {
          return { ...item, competencyId: "" };
        }
        return item;
      }),
    });
  }

  function applyLevelDrafts(itemResponses: TosiaItemResponse[]) {
    return Object.entries(levelItemDrafts).reduce((responses, [key, value]) => {
      const [competencyId, skillLevel] = key.split(":") as [string, TosiaSkillLevel];
      if (!competencyId || !skillLevel) return responses;

      const enteredItems = parseItemNumbers(value, form.totalItems);
      return responses.map((item) => {
        const isCurrentCell = item.competencyId === competencyId && item.skillLevel === skillLevel;
        if (enteredItems.has(item.itemNumber)) {
          return { ...item, competencyId, skillLevel };
        }
        if (isCurrentCell) {
          return { ...item, competencyId: "" };
        }
        return item;
      });
    }, itemResponses);
  }

  function levelDraftKey(competencyId: string, skillLevel: TosiaSkillLevel) {
    return `${competencyId}:${skillLevel}`;
  }

  function saveCompetencyLevelDraft(competencyId: string, skillLevel: TosiaSkillLevel) {
    const key = levelDraftKey(competencyId, skillLevel);
    const draft = levelItemDrafts[key];
    if (draft === undefined) return;
    updateCompetencyLevelItems(competencyId, skillLevel, draft);
    setLevelItemDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function focusNextFillInput(currentInput: HTMLInputElement) {
    const fillInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-tosia-fill='true']"))
      .filter((input) => !input.disabled && input.offsetParent !== null);
    const currentIndex = fillInputs.indexOf(currentInput);
    const nextInput = fillInputs[currentIndex + 1];
    if (!nextInput) return;
    window.requestAnimationFrame(() => {
      nextInput.focus();
      nextInput.select();
    });
  }

  function handleFillInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    focusNextFillInput(event.currentTarget);
  }

  function applyRequest(value: string) {
    const request = requests.find((item) => item.requestId === value);
    updateForm({
      requestId: request?.requestId ?? "",
      title: request?.title ?? form.title,
      schoolYear: request?.schoolYear ?? form.schoolYear,
      term: request?.term ?? form.term,
      quarter: request?.testName ?? form.quarter,
      examDate: request?.dueDate || form.examDate,
      analysisDate: request?.dueDate || form.analysisDate,
    });
  }

  async function saveRequest() {
    if (!profile || !isReviewer) return;
    if (!requestForm.testName.trim()) {
      setError("Enter the test name for the TOSIA Pro request.");
      return;
    }

    setSaving("request");
    setMessage("");
    setError("");

    try {
      if (editingRequestId) {
        await updateTosiaRequest(editingRequestId, {
          title: requestForm.title,
          schoolYear: requestForm.schoolYear,
          term: requestForm.term,
          testName: requestForm.testName,
          dueDate: requestForm.dueDate,
          instructions: requestForm.instructions,
        });
        setMessage("TOSIA Pro request updated.");
      } else {
        await createTosiaRequest({
          ...requestForm,
          status: "active",
          createdBy: profile.userId,
          creatorName: profile.fullName,
        });
        setMessage("TOSIA Pro request created.");
      }
      setRequestForm({ ...emptyRequestForm, schoolYear: form.schoolYear, term: form.term });
      setEditingRequestId("");
      setIsRequestDetailsOpen(false);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : editingRequestId ? "Unable to update TOSIA Pro request." : "Unable to create TOSIA Pro request.");
    } finally {
      setSaving("");
    }
  }

  function editRequest(request: TosiaRequest) {
    setEditingRequestId(request.requestId);
    setRequestForm({
      title: request.title,
      schoolYear: request.schoolYear,
      term: request.term,
      testName: request.testName,
      dueDate: request.dueDate,
      instructions: request.instructions ?? "",
    });
    setIsRequestDetailsOpen(true);
    setMessage("");
    setError("");
  }

  function cancelEditRequest() {
    setEditingRequestId("");
    setRequestForm({ ...emptyRequestForm, schoolYear: form.schoolYear, term: form.term });
    setIsRequestDetailsOpen(false);
  }

  async function setRequestStatus(request: TosiaRequest, status: TosiaRequestStatus) {
    if (!isReviewer) return;
    setSaving(request.requestId);
    setMessage("");
    setError("");

    try {
      await updateTosiaRequest(request.requestId, { status });
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to update TOSIA Pro request.");
    } finally {
      setSaving("");
    }
  }

  async function deleteRequest(request: TosiaRequest) {
    if (!canDelete) return;
    const confirmed = window.confirm(`Delete "${request.testName}" and all TOSIA Pro assessments for this request? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(request.requestId);
    setMessage("");
    setError("");

    try {
      const deletedAssessmentCount = await deleteTosiaRequest(request.requestId);
      if (editingRequestId === request.requestId) cancelEditRequest();
      if (form.requestId === request.requestId) setForm(createBlankForm(settings, profile?.fullName ?? ""));
      setMessage(`Deleted TOSIA Pro request and ${deletedAssessmentCount} assessment${deletedAssessmentCount === 1 ? "" : "s"}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete TOSIA Pro request.");
    } finally {
      setSaving("");
    }
  }

  async function deleteAllRecords() {
    if (!canDelete) return;
    const password = window.prompt("Enter the Super Admin delete password to delete all TOSIA Pro records.");
    if (password === null) return;

    if (password !== deleteAllPassword) {
      setError("Incorrect password. TOSIA Pro records were not deleted.");
      setMessage("");
      return;
    }

    const confirmed = window.confirm("Delete all TOSIA Pro requests and assessments permanently? This cannot be undone.");
    if (!confirmed) return;

    setSaving("delete-all");
    setMessage("");
    setError("");

    try {
      const { requestCount, assessmentCount } = await deleteAllTosiaRecords();
      setEditingRequestId("");
      setSelectedCardKey("");
      setRequestForm({ ...emptyRequestForm, schoolYear: form.schoolYear, term: form.term });
      setForm(createBlankForm(settings, profile?.fullName ?? ""));
      setMessage(
        `Deleted ${requestCount} TOSIA Pro request${requestCount === 1 ? "" : "s"} and ${assessmentCount} assessment${assessmentCount === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete TOSIA Pro records.");
    } finally {
      setSaving("");
    }
  }

  async function handleSave() {
    const activeRequest = activeRequests.find((request) => request.requestId === form.requestId);
    if (!activeRequest) {
      setError("Select an active TOSIA Pro request before saving.");
      return;
    }

    setSaving("assessment");
    setError("");
    setMessage("");

    const competencies = form.competencies
      .map((competency, index) => ({
        ...competency,
        order: index + 1,
        content: competency.content.trim(),
        hours: Number(competency.hours || 0),
        plannedItems: Number(competency.plannedItems || 0),
      }))
      .filter((competency) => competency.content);

    if (!form.title.trim() || !form.subjectName.trim() || !form.sectionName.trim() || !form.teacherName.trim()) {
      setError("Complete the title, teacher, subject, and section before saving.");
      setSaving("");
      return;
    }

    if (competencies.length === 0) {
      setError("Add at least one learning competency/content row.");
      setSaving("");
      return;
    }

    const teacherId = form.teacherId || profile?.assignedTeacherId || profile?.userId || "";
    const totalStudents = Number(form.totalStudents || 0);
    const totalItems = Math.max(1, Math.floor(Number(form.totalItems || form.itemResponses.length || 1)));
    const itemResponses = normalizeTosiaItemResponses(applyLevelDrafts(form.itemResponses), totalItems, totalStudents);
    const assessmentPayload = {
      ...form,
      requestId: activeRequest.requestId,
      schoolYear: activeRequest.schoolYear,
      term: activeRequest.term,
      title: form.title.trim(),
      subjectName: form.subjectName.trim(),
      sectionName: form.sectionName.trim(),
      teacherId,
      teacherName: form.teacherName.trim(),
      totalStudents,
      totalItems,
      competencies,
      itemResponses,
      createdBy: form.createdBy || profile?.userId || "",
      updatedBy: profile?.userId || "",
    };

    try {
      const assessmentId = await saveTosiaAssessment(assessmentPayload);
      setSelectedCardKey(getTosiaClassKey(activeRequest.requestId, teacherId, form.subjectId ?? "", form.sectionId ?? ""));
      setLevelItemDrafts({});
      updateForm({ ...assessmentPayload, assessmentId });
      setMessage("TOSIA Pro assessment saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save the TOSIA Pro assessment.");
    } finally {
      setSaving("");
    }
  }

  function renderSectionSaveButton(label = "Save Assessment") {
    return (
      <div className="mt-4 flex justify-start border-t border-slate-100 pt-4">
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-wine disabled:cursor-not-allowed disabled:opacity-60" disabled={Boolean(saving)} onClick={handleSave} type="button">
          <Save size={16} /> {saving === "assessment" ? "Saving..." : label}
        </button>
      </div>
    );
  }

  async function handleDelete() {
    if (!form.assessmentId || !canDelete) return;
    const confirmed = window.confirm("Delete this TOSIA Pro assessment?");
    if (!confirmed) return;

    try {
      await deleteTosiaAssessment(form.assessmentId);
      setForm(createBlankForm(settings, profile?.fullName ?? ""));
      setSelectedCardKey("");
      setMessage("TOSIA Pro assessment deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete this assessment.");
    }
  }

  function renderHeader(reportTitle: string) {
    return `<header class="report-heading">
      <h1>${escapeHtml(reportTitle)}</h1>
      <p>${escapeHtml(form.subjectName)} | ${escapeHtml(form.sectionName)} | ${escapeHtml(form.quarter)}, ${escapeHtml(form.term)}, S.Y. ${escapeHtml(form.schoolYear)}</p>
      <p>${escapeHtml(formatDate(form.analysisDate || form.examDate))}</p>
    </header>`;
  }

  function renderSignatures(source: Pick<TosiaAssessment, "preparedBy" | "preparedByPosition" | "checkedBy" | "checkedByPosition" | "notedBy" | "notedByPosition"> = form) {
    return `<section class="signatures">
      <div><strong>${escapeHtml(source.preparedBy || "Prepared by")}</strong><p>${escapeHtml(source.preparedByPosition)}</p></div>
      <div><strong>${escapeHtml(source.checkedBy || "Checked by")}</strong><p>${escapeHtml(source.checkedByPosition)}</p></div>
      <div><strong>${escapeHtml(source.notedBy || "Noted by")}</strong><p>${escapeHtml(source.notedByPosition)}</p></div>
    </section>`;
  }

  function printTos() {
    const rows = competencyAnalysis.map((competency, index) => `<tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(competency.content)}</td>
      <td class="center">${competency.hours}</td>
      <td class="center">${round(competency.weight * 100, 2)}%</td>
      <td class="center">${round(competency.suggestedItems, 2)}</td>
      <td class="center">${competency.plannedItems}</td>
      ${skillLevels.map((level) => `<td class="center">${competency.levelCounts[level.value]}</td><td>${escapeHtml(competency.levelItems[level.value].join(", "))}</td>`).join("")}
    </tr>`).join("");
    printReport(
      "Table of Specifications",
      `${renderHeader("Table of Specifications")}
      <table>
        <thead><tr><th>No.</th><th>Learning Competencies/Content</th><th>Hours</th><th>%</th><th>Suggested Items</th><th>Final Items</th><th>R #</th><th>R Items</th><th>U #</th><th>U Items</th><th>T #</th><th>T Items</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>${renderSignatures()}`,
      "landscape",
    );
  }

  function printItemAnalysis() {
    const itemRows = itemAnalysis.map((item) => `<tr>
      <td class="center">${item.itemNumber}</td>
      <td class="center">${item.correctResponses}</td>
      <td class="center">${round(item.percent, 2)}%</td>
      <td>${escapeHtml(item.remark)}</td>
      <td>${escapeHtml(item.competencyName)}</td>
    </tr>`);
    const leastMasteredRows = rankedCompetencies.map((competency, index) => `<tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(competency.content)}</td>
      <td class="center">${round(competency.averagePercent, 2)}%</td>
      <td>${escapeHtml(masteryRemark(competency.averagePercent))}</td>
      <td>${escapeHtml((itemsByCompetency.get(competency.competencyId) ?? []).map((item) => item.itemNumber).join(", "))}</td>
    </tr>`).join("");
    const meanValue = round(summary.mean, 2);
    const mpsValue = round(summary.mps, 2);
    const mpsVerbal = mpsInterpretation(summary.mps);
    const itemRowChunks = chunkRows(itemRows, 23);
    const renderItemTable = (chunk: string[]) => `
      <h2>Item Analysis</h2>
      <table>
        <thead><tr><th>Item No.</th><th>No. Correct</th><th>% Correct</th><th>Remarks</th><th>Learning Competency/Content</th></tr></thead>
        <tbody>${chunk.join("")}</tbody>
      </table>`;
    const pages = itemRowChunks.map((chunk, index) => {
      const isFirstPage = index === 0;
      const isLastPage = index === itemRowChunks.length - 1;

      return `${renderHeader(isFirstPage ? "Item Analysis" : "Item Analysis Continued")}
      ${isFirstPage ? `<h2>Summary of Results</h2>
        <table>
          <tbody>
            <tr><th>Total No. of Items</th><td class="center">${form.totalItems}</td><th>Total No. of Students</th><td class="center">${form.totalStudents}</td></tr>
            <tr><th>Mean</th><td class="center">${meanValue}</td><th>Standard Deviation</th><td class="center">${round(summary.sd, 2)}</td></tr>
            <tr><th>MPS</th><td class="center">${mpsValue}%</td><th>Verbal Interpretation</th><td>${escapeHtml(mpsVerbal.label)} (${escapeHtml(mpsVerbal.code)})</td></tr>
            <tr><th>Least Mastered Competency</th><td colspan="3">${escapeHtml(summary.lmc)}</td></tr>
          </tbody>
        </table>` : ""}
      ${renderItemTable(chunk)}
      ${isLastPage ? `<h2>Least Mastered Report</h2>
        <table>
          <thead><tr><th>Rank</th><th>Learning Competencies/Content</th><th>Average Based on Item Analysis</th><th>Verbal Interpretation</th><th>Items</th></tr></thead>
          <tbody>${leastMasteredRows || `<tr><td colspan="5" class="center">No mapped competency</td></tr>`}</tbody>
        </table>
        <h2>Least Mastered Competency</h2><p>${escapeHtml(summary.lmc)}</p>
        <h2>Most Mastered Competency</h2><p>${escapeHtml(summary.mmc)}</p>
        ${renderSignatures()}` : ""}`;
    });

    printReport(
      "Item Analysis",
      pages,
      "portrait",
    );
  }

  return (
    <section>
      <PageHeader
        actions={canUseWorkspace ? (
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={printTos} type="button">
              <Printer size={16} /> Print TOS
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={printItemAnalysis} type="button">
              <Printer size={16} /> Print Analysis
            </button>
          </>
        ) : undefined}
        description="Prepare a dynamic Table of Specifications, map every item to competencies and thinking levels, then analyze mastery from correct responses."
        title="TOSIA Pro"
      />

      {(message || error) && (
        <div className={`mb-5 rounded-lg border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      {isReviewer && (
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap justify-start gap-2">
            {canDelete && (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                disabled={saving === "delete-all"}
                onClick={() => void deleteAllRecords()}
                type="button"
              >
                <Trash2 size={16} /> Delete All
              </button>
            )}
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90"
              onClick={() => {
                setEditingRequestId("");
                setRequestForm({ ...emptyRequestForm, schoolYear: form.schoolYear, term: form.term });
                setIsRequestDetailsOpen(true);
              }}
              type="button"
            >
              <Plus size={16} /> Create Request
            </button>
          </div>

          {isRequestDetailsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
              <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-950">{editingRequestId ? "Edit TOSIA Pro Request" : "Request Details"}</h2>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                    onClick={cancelEditRequest}
                    type="button"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Title</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, title: event.target.value })} value={requestForm.title} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Test Name</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, testName: event.target.value })} placeholder="1st Summative Test" value={requestForm.testName} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Due Date</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, dueDate: event.target.value })} type="date" value={requestForm.dueDate} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">School Year</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, schoolYear: event.target.value })} value={requestForm.schoolYear} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Term</span>
                    <select className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, term: event.target.value as AcademicTerm })} value={requestForm.term}>
                      {termOptions.map((term) => <option key={term}>{term}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-3">
                    <span className="font-medium text-slate-700">Instructions</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, instructions: event.target.value })} value={requestForm.instructions} />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  {editingRequestId && (
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={cancelEditRequest}
                      type="button"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
                    disabled={saving === "request"}
                    onClick={() => void saveRequest()}
                    type="button"
                  >
                    {editingRequestId ? <Save size={16} /> : <Plus size={16} />} {editingRequestId ? "Update Request" : "Confirm Request"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">TOSIA Pro Requests</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {selectedRequests.map((request) => (
                    <tr key={request.requestId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">{request.testName}</p>
                        <p className="mt-1 text-xs text-slate-500">{request.title}</p>
                      </td>
                      <td className="px-4 py-3">{formatDate(request.dueDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${request.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{request.status === "active" ? "Active" : "Closed"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            disabled={saving === request.requestId}
                            onClick={() => editRequest(request)}
                            type="button"
                          >
                            <Pencil size={16} /> Edit
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            disabled={saving === request.requestId}
                            onClick={() => void setRequestStatus(request, request.status === "active" ? "closed" : "active")}
                            type="button"
                          >
                            {request.status === "active" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                            {request.status === "active" ? "Close" : "Reopen"}
                          </button>
                          {canDelete && (
                            <button
                              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                              disabled={saving === request.requestId}
                              onClick={() => void deleteRequest(request)}
                              type="button"
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedRequests.length === 0 && <div className="p-5 text-sm text-slate-600">No TOSIA Pro requests yet.</div>}
          </div>
        </div>
      )}

      {isTeacherSubmitter && activeRequests.length === 0 && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          No active TOSIA Pro request is open for this term.
        </div>
      )}

      {isTeacherSubmitter && activeRequests.length > 0 && (
        <div className="mb-6 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teacherCards.map((card) => (
            <button
              className={`flex h-full w-full flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-civic hover:shadow-md ${selectedCardKey === card.key ? "border-civic ring-2 ring-civic/20" : "border-slate-200"}`}
              key={card.key}
              onClick={() => openTeacherCard(card)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-950">{card.request.testName}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">Due {formatDate(card.request.dueDate)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${card.assessment ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {card.assessment ? "Submitted" : "Pending"}
                </span>
              </div>
              <p className="mt-4 break-words font-semibold text-ink">{card.subject.subjectName}</p>
              <p className="mt-1 break-words text-sm text-slate-600">{card.section.sectionName} | {card.section.gradeLevel} {card.section.strand}</p>
              {card.request.instructions && <p className="mt-3 line-clamp-2 break-words text-xs text-slate-500">{card.request.instructions}</p>}
            </button>
          ))}
          {teacherCards.length === 0 && (
            <div className="w-full rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 md:col-span-2 xl:col-span-3">
              No subject-section assignments match the active TOSIA Pro requests for this term.
            </div>
          )}
        </div>
      )}

      {isTeacherSubmitter && selectedTeacherCard && (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Subject Summary — All Assigned Teachers</h2>
              <p className="mt-1 text-lg font-semibold text-slate-950">{selectedTeacherCard.subject.subjectName}</p>
              <p className="mt-1 text-sm text-slate-600">
                {selectedTeacherCard.request.testName} · {selectedTeacherCard.request.schoolYear} · {selectedTeacherCard.request.term}
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Read-only collective results
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              detail="submitted / assigned"
              icon={CheckCircle2}
              label="Teachers"
              value={`${submittedSubjectTeacherCount}/${assignedSubjectTeacherCount}`}
            />
            <SummaryCard
              detail="submitted / assigned"
              icon={ClipboardCheck}
              label="Sections"
              value={`${submittedSubjectAssessments.length}/${subjectAssignmentRows.length}`}
            />
            <SummaryCard
              detail={`${subjectSummary.mappedItems}/${subjectSummary.totalItems} item results mapped`}
              icon={FileText}
              label="Students"
              value={subjectSummary.totalStudents}
            />
            <SummaryCard
              detail={`${mpsInterpretation(subjectSummary.mps).code} · SD ${round(subjectSummary.sd, 2)}`}
              icon={BarChart3}
              label="Subject MPS"
              value={`${round(subjectSummary.mps, 2)}%`}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Least Mastered Competency</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{subjectSummary.lmc}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Most Mastered Competency</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{subjectSummary.mmc}</p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Teacher</th>
                  <th className="px-4 py-3 font-semibold">Section</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Students</th>
                  <th className="px-4 py-3 font-semibold">MPS</th>
                  <th className="px-4 py-3 font-semibold">VI</th>
                  <th className="px-4 py-3 font-semibold">Least Mastered</th>
                  <th className="px-4 py-3 font-semibold">Most Mastered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {subjectAssignmentRows.map((row) => {
                  const rowSummary = row.assessment ? summarizeAssessment(row.assessment) : undefined;
                  const interpretation = rowSummary ? mpsInterpretation(rowSummary.mps) : undefined;

                  return (
                    <tr key={row.assignment.assignmentId}>
                      <td className="px-4 py-3 font-medium text-slate-950">{row.teacher?.fullName ?? row.assessment?.teacherName ?? "Unknown teacher"}</td>
                      <td className="px-4 py-3">{row.section?.sectionName ?? row.assessment?.sectionName ?? "Unknown section"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.assessment ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {row.assessment ? "Submitted" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.assessment?.totalStudents ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">{rowSummary ? `${round(rowSummary.mps, 2)}%` : "—"}</td>
                      <td className="px-4 py-3" title={interpretation?.label}>{interpretation?.code ?? "—"}</td>
                      <td className="px-4 py-3">{rowSummary?.lmc ?? "—"}</td>
                      <td className="px-4 py-3">{rowSummary?.mmc ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {subjectAssignmentRows.length === 0 && (
              <div className="p-5 text-sm text-slate-600">No teacher assignments were found for this subject.</div>
            )}
          </div>
        </section>
      )}

      {canUseWorkspace && (
        <>
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard detail={`${summary.mappedItems}/${form.totalItems} items mapped`} icon={ClipboardCheck} label="TOS Coverage" value={`${round((summary.mappedItems / Math.max(1, form.totalItems)) * 100, 0)}%`} />
        <SummaryCard detail={masteryRemark(summary.mps)} icon={BarChart3} label="MPS" value={`${round(summary.mps, 2)}%`} />
        <SummaryCard detail={`Mean ${round(summary.mean, 2)} | SD ${round(summary.sd, 2)}`} icon={FileText} label="Least Mastered" value={summary.lmc} />
        <SummaryCard detail={`${plannedItemTotal}/${form.totalItems} planned items`} icon={ClipboardCheck} label="Competencies" value={form.competencies.length} />
      </div>

      <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-5">
          {!isTeacherSubmitter && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Records</h2>
                <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => selectAssessment("")} type="button">
                  <Plus size={14} /> New
                </button>
              </div>
              <select className="mt-3 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => selectAssessment(event.target.value)} value={form.assessmentId}>
                <option value="">New assessment</option>
                {assessments.map((assessment) => (
                  <option key={assessment.assessmentId} value={assessment.assessmentId}>
                    {assessment.title} - {assessment.subjectName}
                  </option>
                ))}
              </select>
              {canDelete && form.assessmentId && (
                <button className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100" onClick={handleDelete} type="button">
                  <Trash2 size={15} /> Delete Assessment
                </button>
              )}
            </section>
          )}

          {!isTeacherSubmitter && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Active Request</h2>
            <select className="mt-3 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => applyRequest(event.target.value)} value={form.requestId}>
              <option value="">Select TOSIA Pro request</option>
              {activeRequests.map((request) => (
                <option key={request.requestId} value={request.requestId}>
                  {request.testName} - Due {formatDate(request.dueDate)}
                </option>
              ))}
            </select>
            {selectedRequest?.instructions && <p className="mt-2 text-xs text-slate-500">{selectedRequest.instructions}</p>}
          </section>
          )}

        </aside>

        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Assessment Setup</h2>
              <label className="w-full text-sm font-semibold text-slate-700 lg:max-w-md">
                Use Existing TOS
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  disabled={sameSubjectTemplates.length === 0}
                  onChange={(event) => {
                    useExistingTos(event.target.value);
                  }}
                  value=""
                >
                  <option value="">{sameSubjectTemplates.length ? "Select existing TOS" : "No same-subject TOS available"}</option>
                  {sameSubjectTemplates.map((assessment) => (
                    <option key={assessment.assessmentId} value={assessment.assessmentId}>
                      {getExistingTosLabel(assessment)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700">Title<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.title} onChange={(event) => updateForm({ title: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">School Year<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.schoolYear} onChange={(event) => updateForm({ schoolYear: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Term<select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" value={form.term} onChange={(event) => updateForm({ term: event.target.value as AcademicTerm })}>{termOptions.map((term) => <option key={term}>{term}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">Quarter/Test<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.quarter} onChange={(event) => updateForm({ quarter: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Subject<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.subjectName} onChange={(event) => updateForm({ subjectName: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Section<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.sectionName} onChange={(event) => updateForm({ sectionName: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Grade Level<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.gradeLevel} onChange={(event) => updateForm({ gradeLevel: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Strand<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.strand} onChange={(event) => updateForm({ strand: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Teacher<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={form.teacherName} onChange={(event) => updateForm({ teacherName: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Exam Date<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} type="date" value={form.examDate} onChange={(event) => updateForm({ examDate: event.target.value })} /></label>
              <label className="text-sm font-semibold text-slate-700">Students<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" min={0} onKeyDown={handleFillInputKeyDown} type="number" value={numberInputValue(form.totalStudents)} onChange={(event) => updateForm({ totalStudents: Number(event.target.value) })} /></label>
              <label className="text-sm font-semibold text-slate-700">Items<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" min={1} onKeyDown={handleFillInputKeyDown} type="number" value={form.totalItems} onChange={(event) => updateTotalItems(Number(event.target.value))} /></label>
            </div>
            {renderSectionSaveButton()}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Learning Competencies/Content</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Add as many competencies as needed. Suggested items are computed from instructional hours.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-wine" onClick={addCompetency} type="button">
                  <Plus size={15} /> Add Competency
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-2 text-left">No.</th><th className="px-3 py-2 text-left">Competency/Content</th><th className="px-3 py-2 text-left">Hours</th><th className="px-3 py-2 text-left">%</th><th className="px-3 py-2 text-left">Suggested</th><th className="px-3 py-2 text-left">Final Items</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {competencyAnalysis.map((competency, index) => (
                    <tr className="border-b border-slate-100" key={competency.competencyId}>
                      <td className="px-3 py-2 font-semibold text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2"><input className="h-10 w-full rounded-md border border-slate-300 px-3" data-tosia-fill="true" onKeyDown={handleFillInputKeyDown} value={competency.content} onChange={(event) => updateCompetency(competency.competencyId, { content: event.target.value })} /></td>
                      <td className="px-3 py-2"><input className="h-10 w-24 rounded-md border border-slate-300 px-3" data-tosia-fill="true" min={0} onKeyDown={handleFillInputKeyDown} type="number" value={numberInputValue(competency.hours)} onChange={(event) => updateCompetency(competency.competencyId, { hours: Number(event.target.value) })} /></td>
                      <td className="px-3 py-2 font-semibold">{round(competency.weight * 100, 2)}%</td>
                      <td className="px-3 py-2">{round(competency.suggestedItems, 2)}</td>
                      <td className="px-3 py-2"><input className="h-10 w-24 rounded-md border border-slate-300 px-3" data-tosia-fill="true" min={0} onKeyDown={handleFillInputKeyDown} type="number" value={numberInputValue(competency.plannedItems)} onChange={(event) => updateCompetency(competency.competencyId, { plannedItems: Number(event.target.value) })} /></td>
                      <td className="px-3 py-2 text-right"><button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40" disabled={form.competencies.length <= 1} onClick={() => removeCompetency(competency.competencyId)} type="button"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {renderSectionSaveButton()}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Item Map</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[860px] w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">No.</th>
                    <th className="px-3 py-2 text-left">Competency</th>
                    <th className="px-3 py-2 text-left">Remembering (Knowledge)</th>
                    <th className="px-3 py-2 text-left">Understanding (Comprehension/Application)</th>
                    <th className="px-3 py-2 text-left">Thinking (Analysis/Synthesis/Evaluation)</th>
                  </tr>
                </thead>
                <tbody>
                  {competencyAnalysis.map((competency, index) => {
                    const mappedItems = [...(itemsByCompetency.get(competency.competencyId) ?? [])]
                      .sort((first, second) => first.itemNumber - second.itemNumber);
                    return (
                      <tr className="border-b border-slate-100 align-top" key={competency.competencyId}>
                        <td className="px-3 py-3 font-semibold text-slate-500">{index + 1}</td>
                        <td className="min-w-[260px] px-3 py-3">
                          <p className="font-semibold text-ink">{competency.content || "Untitled competency"}</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">{competency.hours} hour{Number(competency.hours) === 1 ? "" : "s"} | {mappedItems.length} item{mappedItems.length === 1 ? "" : "s"}</p>
                        </td>
                        {skillLevels.map((level) => (
                          <td className="min-w-[190px] px-3 py-3" key={level.value}>
                            {(() => {
                              const key = levelDraftKey(competency.competencyId, level.value);
                              return (
                                <input
                                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                                  data-tosia-fill="true"
                                  inputMode="text"
                                  onBlur={() => saveCompetencyLevelDraft(competency.competencyId, level.value)}
                                  onChange={(event) => setLevelItemDrafts((current) => ({ ...current, [key]: event.target.value }))}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      saveCompetencyLevelDraft(competency.competencyId, level.value);
                                      focusNextFillInput(event.currentTarget);
                                    }
                                  }}
                                  placeholder={level.value === "remembering" ? "1, 2, 3" : level.value === "understanding" ? "4, 5" : "6-8"}
                                  value={levelItemDrafts[key] ?? formatNumbers(competency.levelItems[level.value])}
                                />
                              );
                            })()}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {renderSectionSaveButton()}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Correct Responses</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {form.itemResponses.map((item) => (
                <label className="grid grid-cols-[72px_1fr] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700" key={item.itemNumber}>
                  <span>Item {item.itemNumber}</span>
                  <input
                    className="h-11 rounded-md border border-slate-300 bg-white px-3 text-base"
                    data-tosia-fill="true"
                    inputMode="numeric"
                    max={form.totalStudents > 0 ? form.totalStudents : undefined}
                    min={0}
                    onChange={(event) => updateItem(item.itemNumber, { correctResponses: Number(event.target.value) })}
                    onKeyDown={handleFillInputKeyDown}
                    type="number"
                    value={numberInputValue(item.correctResponses)}
                  />
                </label>
              ))}
            </div>
            {renderSectionSaveButton()}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Least to Most Mastered</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 text-left">Rank</th><th className="px-3 py-2 text-left">Competency/Content</th><th className="px-3 py-2 text-left">Average</th><th className="px-3 py-2 text-left">Items</th></tr></thead>
                <tbody>
                  {rankedCompetencies.map((competency, index) => (
                    <tr className="border-b border-slate-100" key={competency.competencyId}>
                      <td className="px-3 py-2 font-bold text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2 font-semibold text-ink">{competency.content}</td>
                      <td className="px-3 py-2">{round(competency.averagePercent, 2)}%</td>
                      <td className="px-3 py-2 text-slate-500">{(itemsByCompetency.get(competency.competencyId) ?? []).map((item) => item.itemNumber).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
        </>
      )}
    </section>
  );
}
