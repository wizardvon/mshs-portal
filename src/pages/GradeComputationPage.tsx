import { BookOpen, Calculator, CheckCircle2, Printer, Save, Users } from "lucide-react";
import { Fragment, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { SummaryCard } from "../components/common/SummaryCard";
import { useAuth } from "../providers/AuthProvider";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeClassEnrollments, subscribeEnrollmentStudents } from "../services/enrollmentService";
import {
  getGradeComputationId,
  getGradeComputationErrorMessage,
  saveGradeComputationSettings,
  subscribeGradeComputationsByTeacher,
  subscribeGradeComputationSettings,
  upsertGradeComputations,
} from "../services/gradeComputationService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import { subscribeTeachers } from "../services/teacherService";
import type {
  AcademicSettings,
  AcademicTerm,
  ClassEnrollment,
  EnrollmentStudent,
  GradeComputation,
  GradeComputationComponent,
  GradeComputationHighestScores,
  GradeComputationSettings,
  GradeComputationWeights,
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
  existingComputation?: GradeComputation;
};

type ComponentKey = "written" | "performance" | "exam";
type WrittenSlot = "ww1" | "ww2" | "ww3" | "ww4" | "ww5";
type PerformanceSlot = "pt1" | "pt2" | "pt3";
type ExamSlot = "s1" | "s2" | "tt";
type SlotId = WrittenSlot | PerformanceSlot | ExamSlot;

type StudentDraft = Record<SlotId, string>;
type HighestScoreDraft = Record<ComponentKey, Record<string, string>>;

const defaultWeights: GradeComputationWeights = {
  written: 20,
  performance: 50,
  exam: 30,
};

const componentLabels: Record<ComponentKey, string> = {
  written: "Written Works",
  performance: "Performance Task",
  exam: "Summative Test & Term Test Examination",
};

const componentSlots: Record<ComponentKey, Array<{ id: SlotId; label: string }>> = {
  written: [
    { id: "ww1", label: "WW1" },
    { id: "ww2", label: "WW2" },
    { id: "ww3", label: "WW3" },
    { id: "ww4", label: "WW4" },
    { id: "ww5", label: "WW5" },
  ],
  performance: [
    { id: "pt1", label: "PT1" },
    { id: "pt2", label: "PT2" },
    { id: "pt3", label: "PT3" },
  ],
  exam: [
    { id: "s1", label: "S1" },
    { id: "s2", label: "S2" },
    { id: "tt", label: "TT" },
  ],
};

const allSlots = Object.values(componentSlots).flat();

const transmutationTable = [
  [0, 60],
  [4.68, 61],
  [9.35, 62],
  [14.01, 63],
  [18.68, 64],
  [23.35, 65],
  [28.01, 66],
  [32.68, 67],
  [37.34, 68],
  [42.01, 69],
  [46.67, 70],
  [51.34, 71],
  [56.01, 72],
  [60.67, 73],
  [65.34, 74],
  [70, 75],
  [71.18, 76],
  [72.36, 77],
  [73.54, 78],
  [74.72, 79],
  [75.9, 80],
  [77.08, 81],
  [78.26, 82],
  [79.44, 83],
  [80.62, 84],
  [81.8, 85],
  [82.98, 86],
  [84.16, 87],
  [85.34, 88],
  [86.52, 89],
  [87.7, 90],
  [88.88, 91],
  [90.06, 92],
  [91.24, 93],
  [92.42, 94],
  [93.6, 95],
  [94.78, 96],
  [95.96, 97],
  [97.14, 98],
  [98.32, 99],
  [99.5, 100],
] as const;

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

function sanitizeNumberInput(value: string) {
  return value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 6);
}

function parseNonNegativeNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function transmuteInitialGrade(initialGrade: number) {
  const normalizedGrade = Math.min(100, Math.max(0, round2(initialGrade)));
  let finalGrade = 60;

  for (const [minimumInitialGrade, transmutedGrade] of transmutationTable) {
    if (normalizedGrade < minimumInitialGrade) break;
    finalGrade = transmutedGrade;
  }

  return finalGrade;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrintNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function blankDraft(): StudentDraft {
  return allSlots.reduce(
    (draft, slot) => ({ ...draft, [slot.id]: "" }),
    {} as StudentDraft,
  );
}

export function blankHighestScores(): HighestScoreDraft {
  return {
    written: { ww1: "", ww2: "", ww3: "", ww4: "", ww5: "" },
    performance: { pt1: "", pt2: "", pt3: "" },
    exam: { s1: "", s2: "", tt: "" },
  };
}

function getComponent(
  itemScores: Record<string, number>,
  highestScores: Record<string, number>,
  weight: number,
): GradeComputationComponent {
  const scoreKeys = Object.keys(itemScores);
  const score = round2(Object.values(itemScores).reduce((total, value) => total + value, 0));
  const maxScore = round2(scoreKeys.reduce((total, key) => total + (highestScores[key] ?? 0), 0));
  const percentageScore = maxScore > 0 ? round2((score / maxScore) * 100) : 0;

  return {
    score,
    maxScore,
    itemScores,
    percentageScore,
    weightedScore: round2(percentageScore * (weight / 100)),
  };
}

function parseHighestScores(draft: HighestScoreDraft): GradeComputationHighestScores | null {
  const written = {
    ww1: parseNonNegativeNumber(draft.written.ww1),
    ww2: parseNonNegativeNumber(draft.written.ww2),
    ww3: parseNonNegativeNumber(draft.written.ww3),
    ww4: parseNonNegativeNumber(draft.written.ww4),
    ww5: parseNonNegativeNumber(draft.written.ww5),
  };
  const performance = {
    pt1: parseNonNegativeNumber(draft.performance.pt1),
    pt2: parseNonNegativeNumber(draft.performance.pt2),
    pt3: parseNonNegativeNumber(draft.performance.pt3),
  };
  const exam = {
    s1: parseNonNegativeNumber(draft.exam.s1),
    s2: parseNonNegativeNumber(draft.exam.s2),
    tt: parseNonNegativeNumber(draft.exam.tt),
  };

  if (
    Object.values(written).some((value) => value === null || value <= 0) ||
    Object.values(performance).some((value) => value === null || value <= 0) ||
    Object.values(exam).some((value) => value === null || value <= 0)
  ) {
    return null;
  }

  return {
    written: written as GradeComputationHighestScores["written"],
    performance: performance as GradeComputationHighestScores["performance"],
    exam: exam as GradeComputationHighestScores["exam"],
  };
}

export function getComputedGrade(
  draft: StudentDraft,
  weights: GradeComputationWeights,
  highestScoreDraft: HighestScoreDraft,
) {
  const highestScores = parseHighestScores(highestScoreDraft);
  if (!highestScores) return null;

  const itemScores: Partial<Record<SlotId, number>> = {};
  for (const slot of allSlots) {
    const draftValue = draft[slot.id];
    if (draftValue.trim() === "") continue;

    const score = parseNonNegativeNumber(draftValue);
    if (score === null) return null;
    itemScores[slot.id] = score;
  }

  const hasComponentScore = (component: ComponentKey) =>
    componentSlots[component].some((slot) => itemScores[slot.id] !== undefined);

  if (!hasComponentScore("written") || !hasComponentScore("performance") || !hasComponentScore("exam")) {
    return null;
  }

  const hasScoreAboveHighest = (component: ComponentKey) =>
    componentSlots[component].some(
      (slot) =>
        itemScores[slot.id] !== undefined &&
        itemScores[slot.id]! > Number(highestScores[component][slot.id as keyof typeof highestScores[typeof component]]),
    );

  if (hasScoreAboveHighest("written") || hasScoreAboveHighest("performance") || hasScoreAboveHighest("exam")) {
    return null;
  }

  const written = getComponent(
    Object.fromEntries(
      componentSlots.written
        .filter((slot) => itemScores[slot.id] !== undefined)
        .map((slot) => [slot.id, itemScores[slot.id]!]),
    ),
    highestScores.written,
    weights.written,
  );
  const performance = getComponent(
    Object.fromEntries(
      componentSlots.performance
        .filter((slot) => itemScores[slot.id] !== undefined)
        .map((slot) => [slot.id, itemScores[slot.id]!]),
    ),
    highestScores.performance,
    weights.performance,
  );
  const exam = getComponent(
    Object.fromEntries(
      componentSlots.exam
        .filter((slot) => itemScores[slot.id] !== undefined)
        .map((slot) => [slot.id, itemScores[slot.id]!]),
    ),
    highestScores.exam,
    weights.exam,
  );
  const initialGrade = round2(written.weightedScore + performance.weightedScore + exam.weightedScore);

  return {
    highestScores,
    written,
    performance,
    exam,
    initialGrade,
    finalGrade: transmuteInitialGrade(initialGrade),
  };
}

function getExistingItemScore(
  existing: GradeComputation,
  component: ComponentKey,
  slotId: SlotId,
  firstSlotId: SlotId,
) {
  if (existing[component].itemScores) {
    const itemScore = existing[component].itemScores[slotId];
    return itemScore !== undefined ? String(itemScore) : "";
  }
  return slotId === firstSlotId ? String(existing[component].score) : "";
}

function highestScoresToDraft(highestScores: GradeComputationHighestScores): HighestScoreDraft {
  return {
    written: Object.fromEntries(
      componentSlots.written.map((slot) => [
        slot.id,
        String(highestScores.written[slot.id as WrittenSlot] ?? ""),
      ]),
    ),
    performance: Object.fromEntries(
      componentSlots.performance.map((slot) => [
        slot.id,
        String(highestScores.performance[slot.id as PerformanceSlot] ?? ""),
      ]),
    ),
    exam: Object.fromEntries(
      componentSlots.exam.map((slot) => [
        slot.id,
        String(highestScores.exam[slot.id as ExamSlot] ?? ""),
      ]),
    ),
  };
}

export function GradeComputationPage() {
  const { profile, user } = useAuth();
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
  const [computations, setComputations] = useState<GradeComputation[]>([]);
  const [computationsServerSynced, setComputationsServerSynced] = useState(false);
  const [selectedComputationSettings, setSelectedComputationSettings] = useState<GradeComputationSettings | null>(null);
  const [settingsServerSyncedAssignmentId, setSettingsServerSyncedAssignmentId] = useState("");
  const [hydratedAssignmentId, setHydratedAssignmentId] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [weights, setWeights] = useState<GradeComputationWeights>(defaultWeights);
  const [highestScores, setHighestScores] = useState<HighestScoreDraft>(blankHighestScores);
  const [drafts, setDrafts] = useState<Record<string, StudentDraft>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirtyDraftIds = useRef(new Set<string>());
  const weightsAreDirty = useRef(false);
  const highestScoresAreDirty = useRef(false);
  const scoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => subscribeAcademicSettings(setAcademicSettings), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeLoadAssignments(setAssignments), []);
  useEffect(() => subscribeClassEnrollments(setClassEnrollments), []);
  useEffect(() => subscribeEnrollmentStudents(setStudents), []);
  useEffect(
    () => {
      const assignmentId = selectedAssignmentId;
      setSelectedComputationSettings(null);
      setSettingsServerSyncedAssignmentId("");
      setHydratedAssignmentId("");
      setDrafts({});
      setWeights(defaultWeights);
      setHighestScores(blankHighestScores());
      dirtyDraftIds.current.clear();
      weightsAreDirty.current = false;
      highestScoresAreDirty.current = false;
      return subscribeGradeComputationSettings(
        assignmentId,
        (settings, serverSynced) => {
          setSelectedComputationSettings(settings);
          if (serverSynced) setSettingsServerSyncedAssignmentId(assignmentId);
        },
        (caught) => setError(caught.message),
      );
    },
    [selectedAssignmentId],
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

  const computationsById = useMemo(
    () => new Map(computations.map((computation) => [computation.computationId, computation])),
    [computations],
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

  const selectedClassEnrollments = useMemo(() => {
    if (!selectedClass) return [];

    return classEnrollments.filter(
      (enrollment) =>
        enrollment.status === "enrolled" &&
        enrollment.schoolYear === selectedClass.assignment.schoolYear &&
        enrollment.term === selectedClass.assignment.term &&
        enrollment.subjectId === selectedClass.assignment.subjectId &&
        enrollment.sectionId === selectedClass.assignment.sectionId,
    );
  }, [classEnrollments, selectedClass]);

  useEffect(() => {
    setComputations([]);
    setComputationsServerSynced(false);
    return subscribeGradeComputationsByTeacher(
        assignedTeacherId,
        (savedComputations, serverSynced) => {
          setComputations(savedComputations);
          if (serverSynced) setComputationsServerSynced(true);
        },
        (caught) => setError(caught.message),
      );
  }, [assignedTeacherId]);

  const rosterRows = useMemo<RosterRow[]>(() => {
    if (!selectedClass) return [];

    return selectedClassEnrollments
      .map((classEnrollment) => {
        const computationId = getGradeComputationId(
          selectedClass.assignment.assignmentId,
          classEnrollment.enrollmentId,
        );

        return {
          classEnrollment,
          student: studentsByEnrollmentId.get(classEnrollment.enrollmentId),
          existingComputation: computationsById.get(computationId),
        };
      })
      .sort((first, second) => {
        const sexSort =
          sexSortValue(first.student?.sex) - sexSortValue(second.student?.sex);
        if (sexSort !== 0) return sexSort;
        return getStudentSortName(first).localeCompare(getStudentSortName(second));
      });
  }, [
    computationsById,
    selectedClass,
    selectedClassEnrollments,
    studentsByEnrollmentId,
  ]);

  useEffect(() => {
    if (
      !selectedClass ||
      !computationsServerSynced ||
      settingsServerSyncedAssignmentId !== selectedClass.assignment.assignmentId
    ) {
      return;
    }

    const settingsForSelectedClass =
      selectedComputationSettings?.assignmentId === selectedClass.assignment.assignmentId
        ? selectedComputationSettings
        : null;
    let restoredWeights: GradeComputationWeights | null = settingsForSelectedClass?.weights ?? null;
    let restoredHighestScores: HighestScoreDraft | null = settingsForSelectedClass
      ? highestScoresToDraft(settingsForSelectedClass.highestScores)
      : null;

    rosterRows.forEach((row) => {
      const existing = row.existingComputation;
      if (existing && !restoredWeights) {
        restoredWeights = existing.weights;
      }

      if (existing && !restoredHighestScores) {
        restoredHighestScores = existing.highestScores
          ? highestScoresToDraft(existing.highestScores)
          : {
              written: { ww1: String(existing.written.maxScore), ww2: "", ww3: "", ww4: "", ww5: "" },
              performance: { pt1: String(existing.performance.maxScore), pt2: "", pt3: "" },
              exam: { s1: String(existing.exam.maxScore), s2: "", tt: "" },
            };
      }
    });

    setDrafts((current) => {
      const nextDrafts: Record<string, StudentDraft> = {};

      rosterRows.forEach((row) => {
        const existing = row.existingComputation;
        const classEnrollmentId = row.classEnrollment.classEnrollmentId;
        nextDrafts[classEnrollmentId] = existing && !dirtyDraftIds.current.has(classEnrollmentId)
          ? {
              ww1: getExistingItemScore(existing, "written", "ww1", "ww1"),
              ww2: getExistingItemScore(existing, "written", "ww2", "ww1"),
              ww3: getExistingItemScore(existing, "written", "ww3", "ww1"),
              ww4: getExistingItemScore(existing, "written", "ww4", "ww1"),
              ww5: getExistingItemScore(existing, "written", "ww5", "ww1"),
              pt1: getExistingItemScore(existing, "performance", "pt1", "pt1"),
              pt2: getExistingItemScore(existing, "performance", "pt2", "pt1"),
              pt3: getExistingItemScore(existing, "performance", "pt3", "pt1"),
              s1: getExistingItemScore(existing, "exam", "s1", "s1"),
              s2: getExistingItemScore(existing, "exam", "s2", "s1"),
              tt: getExistingItemScore(existing, "exam", "tt", "s1"),
            }
          : current[classEnrollmentId] ?? blankDraft();
      });

      return nextDrafts;
    });
    if (!weightsAreDirty.current) setWeights(restoredWeights ?? defaultWeights);
    if (!highestScoresAreDirty.current) {
      setHighestScores(restoredHighestScores ?? blankHighestScores());
    }
    setHydratedAssignmentId(selectedClass.assignment.assignmentId);
  }, [
    computationsServerSynced,
    rosterRows,
    selectedClass,
    selectedComputationSettings,
    settingsServerSyncedAssignmentId,
  ]);

  const parsedHighestScores = parseHighestScores(highestScores);
  const weightTotal = weights.written + weights.performance + weights.exam;
  const weightsAreValid = weightTotal === 100;
  const hasSavedScoreSettings = Boolean(
    selectedClass &&
    selectedComputationSettings?.assignmentId === selectedClass.assignment.assignmentId,
  );
  const hasUnsavedScoreSettings = weightsAreDirty.current || highestScoresAreDirty.current;
  const isRestoringSelectedClass = Boolean(
    selectedClass &&
    (
      !computationsServerSynced ||
      settingsServerSyncedAssignmentId !== selectedClass.assignment.assignmentId ||
      hydratedAssignmentId !== selectedClass.assignment.assignmentId
    )
  );
  const canSaveComputations =
    Boolean(
      profile &&
      assignedTeacherId &&
      selectedClass &&
      parsedHighestScores &&
      weightsAreValid &&
      hasSavedScoreSettings &&
      !hasUnsavedScoreSettings
    ) &&
    rosterRows.length > 0 &&
    !isRestoringSelectedClass &&
    !saving;
  const canSaveScoreSettings =
    Boolean(profile && assignedTeacherId && selectedClass && parsedHighestScores && weightsAreValid) &&
    !isRestoringSelectedClass &&
    !saving;

  const summary = useMemo(
    () => ({
      assignedClasses: assignedClasses.length,
      students: rosterRows.length,
      computed: rosterRows.filter((row) =>
        getComputedGrade(drafts[row.classEnrollment.classEnrollmentId] ?? blankDraft(), weights, highestScores),
      ).length,
    }),
    [assignedClasses.length, drafts, highestScores, rosterRows, weights],
  );

  function updateWeight(component: ComponentKey, value: string) {
    weightsAreDirty.current = true;
    const nextValue = Number(sanitizeNumberInput(value) || 0);
    setWeights((current) => ({ ...current, [component]: nextValue }));
    setMessage("");
    setError("");
  }

  function updateHighestScore(component: ComponentKey, slotId: SlotId, value: string) {
    highestScoresAreDirty.current = true;
    setHighestScores((current) => ({
      ...current,
      [component]: {
        ...current[component],
        [slotId]: sanitizeNumberInput(value),
      },
    }));
    setMessage("");
    setError("");
  }

  function updateDraft(classEnrollmentId: string, slotId: SlotId, value: string) {
    dirtyDraftIds.current.add(classEnrollmentId);
    setDrafts((current) => ({
      ...current,
      [classEnrollmentId]: {
        ...(current[classEnrollmentId] ?? blankDraft()),
        [slotId]: sanitizeNumberInput(value),
      },
    }));
    setMessage("");
    setError("");
  }

  function handleScoreKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    slotId: SlotId,
  ) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const nextRow = rosterRows[rowIndex + 1];
    if (!nextRow) return;

    const nextInput = scoreInputRefs.current[`${slotId}:${nextRow.classEnrollment.classEnrollmentId}`];
    nextInput?.focus();
    nextInput?.select();
  }

  function buildComputation(row: RosterRow, computed: NonNullable<ReturnType<typeof getComputedGrade>>): Omit<GradeComputation, "computationId" | "submittedAt" | "createdAt" | "updatedAt"> {
    if (!profile || !user || !assignedTeacherId || !selectedClass) {
      throw new Error("Your user account must be linked to a teacher record before computing grades.");
    }

    return {
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
      subjectCode: row.classEnrollment.subjectCode ?? selectedClass.subjectCode ?? "",
      subjectName: row.classEnrollment.subjectName ?? selectedClass.subjectName,
      sectionId: selectedClass.assignment.sectionId,
      sectionName: row.classEnrollment.sectionName ?? selectedClass.sectionName,
      gradeLevel: selectedClass.assignment.gradeLevel ?? row.classEnrollment.gradeLevel ?? "",
      strand: selectedClass.assignment.strand ?? row.classEnrollment.strand ?? "",
      weights,
      highestScores: computed.highestScores,
      written: computed.written,
      performance: computed.performance,
      exam: computed.exam,
      initialGrade: computed.initialGrade,
      finalGrade: computed.finalGrade,
      submittedBy: user.uid,
    };
  }

  async function saveComputations() {
    if (!profile || !user || !assignedTeacherId || !selectedClass) {
      setError("Your user account must be linked to a teacher record before computing grades.");
      return;
    }

    if (!weightsAreValid) {
      setError("Written Works, Performance Task, and Exam percentages must total 100.");
      return;
    }

    if (!parsedHighestScores) {
      setError("Set a highest possible score greater than 0 for every WW, PT, S, and TT slot.");
      return;
    }

    if (!hasSavedScoreSettings) {
      setError("Save the highest possible scores before saving computed grades.");
      return;
    }

    if (hasUnsavedScoreSettings) {
      setError("Save your changes to the percentages and highest possible scores before saving computed grades.");
      return;
    }

    const rowsToSave = rosterRows
      .map((row) => {
        const draft = drafts[row.classEnrollment.classEnrollmentId] ?? blankDraft();
        return {
          row,
          computed: getComputedGrade(draft, weights, highestScores),
        };
      })
      .filter((item): item is { row: RosterRow; computed: NonNullable<ReturnType<typeof getComputedGrade>> } => Boolean(item.computed));

    if (rowsToSave.length === 0) {
      setError("Enter at least one WW, one PT, and one Exam score for at least one learner before saving.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      await upsertGradeComputations(
        rowsToSave.map(({ row, computed }) => ({
          computation: buildComputation(row, computed),
          exists: Boolean(row.existingComputation),
        })),
      );

      setMessage(`Saved ${rowsToSave.length} computed grade${rowsToSave.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      console.error(caught);
      setError(getGradeComputationErrorMessage(caught, "save computed grades"));
    } finally {
      setSaving(false);
    }
  }

  function buildScoreSettings(): Omit<GradeComputationSettings, "settingsId" | "createdAt" | "updatedAt"> {
    if (!profile || !user || !assignedTeacherId || !selectedClass || !parsedHighestScores) {
      throw new Error("Your user account, assigned class, and highest possible scores are required before saving.");
    }

    return {
      assignmentId: selectedClass.assignment.assignmentId,
      schoolYear: selectedClass.assignment.schoolYear,
      term: selectedClass.assignment.term,
      teacherId: assignedTeacherId,
      subjectId: selectedClass.assignment.subjectId,
      sectionId: selectedClass.assignment.sectionId,
      weights,
      highestScores: parsedHighestScores,
      submittedBy: user.uid,
    };
  }

  async function saveCurrentScoreSettings(successMessage?: string) {
    if (!profile || !assignedTeacherId || !selectedClass) {
      throw new Error("Your user account must be linked to a teacher record before saving.");
    }
    if (!weightsAreValid) {
      throw new Error("Written Works, Performance Task, and Exam percentages must total 100.");
    }
    if (!parsedHighestScores) {
      throw new Error("Set a highest possible score greater than 0 for every WW, PT, S, and TT slot.");
    }

    await saveGradeComputationSettings(
      buildScoreSettings(),
      Boolean(selectedComputationSettings),
    );
    weightsAreDirty.current = false;
    highestScoresAreDirty.current = false;

    return successMessage ?? `Highest possible scores saved for ${selectedClass.subjectName} - ${selectedClass.sectionName}.`;
  }

  async function saveScoreSettings() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      setMessage(await saveCurrentScoreSettings());
    } catch (caught) {
      console.error(caught);
      setError(getGradeComputationErrorMessage(caught, "save highest possible scores"));
    } finally {
      setSaving(false);
    }
  }

  function printSelectedComputation() {
    if (!selectedClass) return;

    const printWindow = window.open("", "_blank", "width=1200,height=850");
    if (!printWindow) {
      window.print();
      return;
    }

    const componentKeys: ComponentKey[] = ["written", "performance", "exam"];
    const highestScoreCells = componentKeys
      .map((component) => {
        const slotCells = componentSlots[component]
          .map((slot) => `<td class="center">${escapeHtml(highestScores[component][slot.id] || "")}</td>`)
          .join("");
        const highestTotal = componentSlots[component].reduce(
          (total, slot) => total + (parseNonNegativeNumber(highestScores[component][slot.id]) ?? 0),
          0,
        );

        return `${slotCells}<td class="center strong">${escapeHtml(formatPrintNumber(round2(highestTotal)))}</td><td class="center">100% / ${escapeHtml(formatPrintNumber(weights[component]))}</td>`;
      })
      .join("");

    const rows = rosterRows.length
      ? rosterRows
          .map((row, index) => {
            const draft = drafts[row.classEnrollment.classEnrollmentId] ?? blankDraft();
            const computed = getComputedGrade(draft, weights, highestScores);
            const componentCells = componentKeys
              .map((component) => {
                const slotCells = componentSlots[component]
                  .map((slot) => `<td class="center">${escapeHtml(draft[slot.id])}</td>`)
                  .join("");
                const componentValue = computed?.[component];

                return `${slotCells}<td class="center strong">${componentValue ? `${escapeHtml(formatPrintNumber(componentValue.score))}/${escapeHtml(formatPrintNumber(componentValue.maxScore))}` : ""}</td><td class="center">${componentValue ? `${escapeHtml(formatPrintNumber(componentValue.percentageScore))}% / ${escapeHtml(formatPrintNumber(componentValue.weightedScore))}` : ""}</td>`;
              })
              .join("");

            return `<tr>
              <td class="center">${index + 1}</td>
              <td><strong>${escapeHtml(row.student?.displayName ?? row.classEnrollment.studentName)}</strong><br /><span class="muted">${escapeHtml(row.classEnrollment.lrn)}</span></td>
              <td class="center">${escapeHtml(formatSex(row.student?.sex))}</td>
              ${componentCells}
              <td class="center strong">${computed ? escapeHtml(computed.initialGrade.toFixed(2)) : ""}</td>
              <td class="center final-grade">${computed ? escapeHtml(computed.finalGrade) : ""}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td class="center muted" colspan="22">No enrolled students found.</td></tr>`;

    const componentHeadings = componentKeys
      .map(
        (component) =>
          `<th class="center" colspan="${componentSlots[component].length + 2}">${escapeHtml(componentLabels[component])} (${escapeHtml(formatPrintNumber(weights[component]))}%)</th>`,
      )
      .join("");
    const scoreHeadings = componentKeys
      .map((component) =>
        [
          ...componentSlots[component].map((slot) => `<th class="center">${escapeHtml(slot.label)}</th>`),
          `<th class="center">Total</th>`,
          `<th class="center">PS / WS</th>`,
        ].join(""),
      )
      .join("");

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(selectedClass.subjectName)} - ${escapeHtml(selectedClass.sectionName)} - Computation of Grades</title>
    <style>
      * { box-sizing: border-box; }
      body { color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 7px; margin: 0; }
      .page { padding: 8mm; }
      header { border-bottom: 1.5px solid #0f172a; margin-bottom: 8px; padding-bottom: 6px; }
      h1 { font-size: 16px; margin: 0 0 3px; }
      p { margin: 2px 0; }
      .muted { color: #475569; }
      .legend { margin: 5px 0; }
      table { border-collapse: collapse; table-layout: auto; width: 100%; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 1px solid #94a3b8; padding: 3px 2px; vertical-align: middle; }
      th { background: #e2e8f0; font-weight: 700; }
      .hps td { background: #f8fafc; }
      .center { text-align: center; }
      .strong, .final-grade { font-weight: 700; }
      .student-column { min-width: 34mm; }
      .signature-grid { display: grid; gap: 24px; grid-template-columns: repeat(2, 1fr); margin: 24px auto 0; max-width: 150mm; }
      .signature { border-top: 1px solid #0f172a; padding-top: 4px; text-align: center; }
      .no-print { margin: 10px; padding: 8px 12px; }
      @page { size: A4 landscape; margin: 0; }
      @media print { .no-print { display: none; } }
    </style>
  </head>
  <body>
    <button class="no-print" onclick="window.print()">Print / Save as PDF</button>
    <section class="page">
      <header>
        <h1>Computation of Grades</h1>
        <p>School Year: ${escapeHtml(selectedClass.assignment.schoolYear)} | Term: ${escapeHtml(selectedClass.assignment.term)}</p>
        <p>Teacher: ${escapeHtml(teacher?.fullName ?? profile?.fullName ?? "")}</p>
        <p>Subject: ${escapeHtml(selectedClass.subjectName)} ${selectedClass.subjectCode ? `(${escapeHtml(selectedClass.subjectCode)})` : ""}</p>
        <p>Section: ${escapeHtml(selectedClass.sectionName)} | Grade ${escapeHtml(selectedClass.assignment.gradeLevel)} | ${escapeHtml(selectedClass.assignment.strand)}</p>
        <p class="muted">Printed: ${escapeHtml(new Date().toLocaleString())}</p>
      </header>
      <p class="legend"><strong>PS</strong> = Percentage Score; <strong>WS</strong> = Weighted Score. Final grades use the configured transmutation table.</p>
      <table>
        <thead>
          <tr>
            <th rowspan="2">No.</th>
            <th class="student-column" rowspan="2">Student</th>
            <th rowspan="2">Sex</th>
            ${componentHeadings}
            <th rowspan="2">Initial</th>
            <th rowspan="2">Final</th>
          </tr>
          <tr>${scoreHeadings}</tr>
          <tr class="hps">
            <td class="center strong" colspan="3">Highest Possible Score</td>
            ${highestScoreCells}
            <td></td>
            <td></td>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="signature-grid">
        <div class="signature"><strong>${escapeHtml(teacher?.fullName ?? profile?.fullName ?? "")}</strong><br />Subject Teacher</div>
        <div class="signature">Checked by</div>
      </div>
    </section>
    <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
  </body>
</html>`);
    printWindow.document.close();
  }

  return (
    <section>
      <PageHeader
        description="Compute grades using WW1-WW5, PT1-PT3, and S1/S2/TT with class-level highest possible scores."
        title="Computation of Grades"
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

      {isRestoringSelectedClass && (
        <p className="mb-5 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Restoring saved computations and highest possible scores from Firestore...
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
            <SummaryCard detail="complete rows" icon={CheckCircle2} label="Computed" value={summary.computed} />
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
            <div className="space-y-5">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">
                      {selectedClass.subjectName} - {selectedClass.sectionName}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedClass.subjectCode || "No code"} / Grade {selectedClass.assignment.gradeLevel} / {selectedClass.assignment.strand} / {term}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  {(["written", "performance", "exam"] as ComponentKey[]).map((component) => (
                    <div className="rounded-md border border-slate-200 p-3" key={component}>
                      <div className="flex items-end justify-between gap-3">
                        <label className="text-sm font-semibold text-slate-700">
                          {componentLabels[component]} %
                          <input
                            className="mt-1 h-10 w-24 rounded-md border border-slate-300 px-3 text-center"
                            disabled={isRestoringSelectedClass || saving}
                            inputMode="decimal"
                            onChange={(event) => updateWeight(component, event.target.value)}
                            value={weights[component]}
                          />
                        </label>
                        <p className="text-xs font-semibold uppercase text-slate-400">Highest Possible Score</p>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-3">
                        {componentSlots[component].map((slot) => (
                          <label className="text-xs font-semibold text-slate-600" key={slot.id}>
                            {slot.label}
                            <input
                              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-center text-sm font-semibold text-slate-950"
                              disabled={isRestoringSelectedClass || saving}
                              inputMode="decimal"
                              onChange={(event) => updateHighestScore(component, slot.id, event.target.value)}
                              value={highestScores[component][slot.id]}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mt-3 inline-flex rounded-md px-3 py-2 text-sm font-semibold ${weightsAreValid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  Percentage Total: {weightTotal}%
                </div>
                {!parsedHighestScores && (
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    Complete all highest possible scores before saving computations.
                  </p>
                )}
                {parsedHighestScores && !hasSavedScoreSettings && (
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    Save the highest possible scores before saving computed grades.
                  </p>
                )}
                {hasSavedScoreSettings && hasUnsavedScoreSettings && (
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    The percentage or highest-score changes are not saved yet. Save them before saving computed grades.
                  </p>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                    disabled={!canSaveScoreSettings}
                    onClick={() => void saveScoreSettings()}
                    type="button"
                  >
                    <Save size={16} /> {saving ? "Saving..." : "Save Highest Scores"}
                  </button>
                </div>
              </div>

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
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isRestoringSelectedClass || rosterRows.length === 0}
                      onClick={printSelectedComputation}
                      type="button"
                    >
                      <Printer size={16} /> Print Computation
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
                      disabled={!canSaveComputations}
                      onClick={() => void saveComputations()}
                      type="button"
                    >
                      <Save size={16} /> {saving ? "Saving..." : "Save Computations"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1560px] text-left text-sm">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="w-14 px-3 py-3 font-semibold">No.</th>
                        <th className="min-w-64 px-3 py-3 font-semibold">Student</th>
                        <th className="w-20 px-3 py-3 font-semibold">Sex</th>
                        {(["written", "performance", "exam"] as ComponentKey[]).map((component) => (
                          <th className="px-3 py-3 text-center font-semibold" colSpan={componentSlots[component].length + 2} key={component}>
                            {componentLabels[component]}
                          </th>
                        ))}
                        <th className="w-28 px-3 py-3 font-semibold">Initial</th>
                        <th className="w-28 px-3 py-3 font-semibold">Final</th>
                        <th className="w-28 px-3 py-3 font-semibold">Status</th>
                      </tr>
                      <tr className="bg-slate-800 text-xs uppercase tracking-wide text-slate-200">
                        <th />
                        <th />
                        <th />
                        {(["written", "performance", "exam"] as ComponentKey[]).flatMap((component) => [
                          ...componentSlots[component].map((slot) => (
                            <th className="w-20 px-2 py-2 text-center font-semibold" key={`${component}-${slot.id}`}>{slot.label}</th>
                          )),
                          <th className="w-24 px-2 py-2 text-center font-semibold" key={`${component}-total`}>Total</th>,
                          <th className="w-28 px-2 py-2 text-center font-semibold" key={`${component}-weighted`}>PS / WS</th>,
                        ])}
                        <th />
                        <th />
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {rosterRows.map((row, index) => {
                        const draft = drafts[row.classEnrollment.classEnrollmentId] ?? blankDraft();
                        const computed = getComputedGrade(draft, weights, highestScores);

                        return (
                          <tr className="hover:bg-slate-50/70" key={row.classEnrollment.classEnrollmentId}>
                            <td className="px-3 py-3 align-middle text-slate-500">{index + 1}</td>
                            <td className="px-3 py-3 align-middle">
                              <p className="font-semibold text-slate-950">
                                {row.student?.displayName ?? row.classEnrollment.studentName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{row.classEnrollment.lrn}</p>
                            </td>
                            <td className="px-3 py-3 align-middle">{formatSex(row.student?.sex)}</td>
                            {(["written", "performance", "exam"] as ComponentKey[]).map((component) => {
                              const componentValue = computed?.[component];

                              return (
                                <Fragment key={`${row.classEnrollment.classEnrollmentId}-${component}`}>
                                  {componentSlots[component].map((slot) => (
                                    <td className="px-2 py-3 align-middle" key={`${row.classEnrollment.classEnrollmentId}-${slot.id}`}>
                                      <input
                                        aria-label={`${slot.label} score for ${row.student?.displayName ?? row.classEnrollment.studentName}`}
                                        className="h-10 w-16 rounded-md border border-slate-300 px-2 text-center font-semibold text-slate-950"
                                        disabled={
                                          isRestoringSelectedClass ||
                                          saving ||
                                          !drafts[row.classEnrollment.classEnrollmentId]
                                        }
                                        inputMode="decimal"
                                        onChange={(event) => updateDraft(row.classEnrollment.classEnrollmentId, slot.id, event.target.value)}
                                        onKeyDown={(event) => handleScoreKeyDown(event, index, slot.id)}
                                        ref={(element) => {
                                          scoreInputRefs.current[`${slot.id}:${row.classEnrollment.classEnrollmentId}`] = element;
                                        }}
                                        value={draft[slot.id]}
                                      />
                                    </td>
                                  ))}
                                  <td className="px-2 py-3 text-center align-middle font-bold text-slate-950">
                                    {componentValue ? `${componentValue.score}/${componentValue.maxScore}` : "-"}
                                  </td>
                                  <td className="px-2 py-3 text-center align-middle text-xs font-semibold text-slate-600">
                                    {componentValue ? `${componentValue.percentageScore}% / ${componentValue.weightedScore}` : "-"}
                                  </td>
                                </Fragment>
                              );
                            })}
                            <td className="px-3 py-3 align-middle font-bold text-slate-950">
                              {computed ? computed.initialGrade.toFixed(2) : "-"}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <span className="inline-flex h-9 min-w-14 items-center justify-center rounded-md bg-slate-100 px-3 font-bold text-slate-950">
                                {computed ? computed.finalGrade : "-"}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              {row.existingComputation ? (
                                <StatusBadge label="Saved" tone="green" />
                              ) : computed ? (
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}
