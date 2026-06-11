import { CalendarDays, GripVertical, Lock, Printer, RefreshCw, RotateCcw, Trash2, Unlock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import { subscribeLoadAssignmentsByPeriod } from "../services/assignmentService";
import {
  replaceSchedulesByPeriod,
  resetSchedulesByContextSafely,
  saveNamedSchedule,
  subscribeClassSchedulesByPeriod,
  subscribeSavedSchedulesByContext,
} from "../services/scheduleService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import { subscribeTeachers } from "../services/teacherService";
import type {
  AcademicTerm,
  ClassScheduleEntry,
  LoadAssignment,
  SavedSchedule,
  ScheduleDay,
  Section,
  Subject,
  Teacher,
} from "../types/loading";
import { defaultSchoolYear, defaultTerm, termOptions } from "../types/loading";

type ViewMode = "section" | "teacher";
type GenerationMode = "fast" | "best";
type AutoPlotMode = "empty" | "move";
type AutoPlotScope = "selected" | "all";
type Slot = {
  slotId: string;
  startTime: string;
  endTime: string;
  duration: number;
  label: string;
};
type BreakRow = { label: string; startTime: string; endTime: string };
type Conflict = {
  assignmentId: string;
  type: "unscheduled" | "conflict" | "special" | "score";
  subjectName: string;
  sectionName: string;
  teacherName: string;
  reason: string;
  sessions: number;
};
type JoinedAssignment = LoadAssignment & {
  subject: Subject;
  section: Section;
  teacher: Teacher;
};
type RequiredSession = {
  sessionId: string;
  assignment: JoinedAssignment;
  duration: number;
  sessionIndex: number;
  totalSessions: number;
  priority: number;
  units: number;
  preferElectiveSlot: boolean;
};
type CandidateSlot = {
  day: ScheduleDay;
  slot: Slot;
};
type GenerationResult = {
  entries: ClassScheduleEntry[];
  conflicts: Conflict[];
  score: number;
  scheduledSessions: number;
  requiredSessions: number;
  completionPercent: number;
  timedOut?: boolean;
  stopped?: boolean;
  combinationsTried?: number;
};
type GenerationProgress = {
  entries: ClassScheduleEntry[];
  changedScheduleIds: string[];
  completionPercent: number;
  scheduledSessions: number;
  requiredSessions: number;
  combinationsTried: number;
};
type FeasibilityResult = {
  canGenerate: boolean;
  errors: string[];
  warnings: string[];
  sectionSummaries: Array<{
    sectionId: string;
    sectionName: string;
    template: string;
    requiredHours: number;
    availableHours: number;
    remainingHours: number;
  }>;
};
type LocalScheduleDraft = {
  entries: ClassScheduleEntry[];
  conflicts: Conflict[];
  saveMessage: string;
  generationMessage: string;
  optimizationScore: number | null;
  completionPercent: number | null;
  generationProgress: GenerationProgress | null;
  updatedAt: number;
};

const days: ScheduleDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const bestFitSearchMs = 60000;
const bestFitMaxCombinations = 500000;
const bestFitProgressEvery = 250;

const fourSessionDayPattern: ScheduleDay[][] = [
  ["Monday", "Tuesday", "Wednesday", "Thursday"],
  ["Monday", "Tuesday", "Wednesday", "Friday"],
  ["Monday", "Tuesday", "Thursday", "Friday"],
  ["Monday", "Wednesday", "Thursday", "Friday"],
  ["Monday", "Tuesday", "Wednesday", "Thursday"],
];

const grade11AcademicSlots: Slot[] = [
  { slotId: "g11-0700-0830", startTime: "7:00", endTime: "8:30", duration: 1.5, label: "7:00-8:30" },
  { slotId: "g11-0830-1000", startTime: "8:30", endTime: "10:00", duration: 1.5, label: "8:30-10:00" },
  { slotId: "g11-1015-1145", startTime: "10:15", endTime: "11:45", duration: 1.5, label: "10:15-11:45" },
  { slotId: "g11-1230-1400", startTime: "12:30", endTime: "2:00", duration: 1.5, label: "12:30-2:00" },
  { slotId: "g11-1400-1600", startTime: "2:00", endTime: "4:00", duration: 2, label: "2:00-4:00" },
];

const grade11TechProSlots: Slot[] = [
  { slotId: "g11-techpro-0700-0830", startTime: "7:00", endTime: "8:30", duration: 1.5, label: "7:00-8:30" },
  { slotId: "g11-techpro-0830-1000", startTime: "8:30", endTime: "10:00", duration: 1.5, label: "8:30-10:00" },
  { slotId: "g11-techpro-1015-1145", startTime: "10:15", endTime: "11:45", duration: 1.5, label: "10:15-11:45" },
  { slotId: "g11-techpro-1230-1400", startTime: "12:30", endTime: "2:00", duration: 1.5, label: "12:30-2:00" },
  { slotId: "g11-techpro-1400-1630", startTime: "2:00", endTime: "4:30", duration: 2.5, label: "2:00-4:30" },
];

const grade12Slots: Slot[] = [
  { slotId: "g12-0700-0900", startTime: "7:00", endTime: "9:00", duration: 2, label: "7:00-9:00" },
  { slotId: "g12-0915-1115", startTime: "9:15", endTime: "11:15", duration: 2, label: "9:15-11:15" },
  { slotId: "g12-1200-1400", startTime: "12:00", endTime: "2:00", duration: 2, label: "12:00-2:00" },
  { slotId: "g12-1400-1600", startTime: "2:00", endTime: "4:00", duration: 2, label: "2:00-4:00" },
];

const allDisplaySlots = [
  ...grade11AcademicSlots,
  ...grade11TechProSlots,
  ...grade12Slots,
]
  .filter(
    (slot, index, array) =>
      array.findIndex(
        (item) => item.startTime === slot.startTime && item.endTime === slot.endTime,
      ) === index,
  )
  .sort(
  (first, second) =>
    timeToMinutes(first.startTime) - timeToMinutes(second.startTime) ||
    timeToMinutes(first.endTime) - timeToMinutes(second.endTime),
  );

const gradeBreaks: Record<string, BreakRow[]> = {
  "11": [
    { label: "Health Break", startTime: "10:00", endTime: "10:15" },
    { label: "Lunch Break", startTime: "11:45", endTime: "12:30" },
  ],
  "12": [
    { label: "Health Break", startTime: "9:00", endTime: "9:15" },
    { label: "Lunch Break", startTime: "11:15", endTime: "12:00" },
  ],
};

function normalizeGrade(value: string) {
  return value.replace(/grade/i, "").trim();
}

function isTechProSection(section?: Section) {
  if (!section) return false;

  const values = [section.sectionName, section.track, section.strand]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return values.includes("tech pro") || values.includes("techpro");
}

function getTemplateType(
  section?: Section,
  gradeLevel?: string,
): "grade11_academic" | "grade11_techpro" | "grade12" {
  const grade = normalizeGrade(gradeLevel || section?.gradeLevel || "");
  if (grade === "12") return "grade12";
  if (grade === "11" && isTechProSection(section)) return "grade11_techpro";
  return "grade11_academic";
}

function getTemplateLabel(section?: Section, gradeLevel?: string) {
  const templateType = getTemplateType(section, gradeLevel);
  if (templateType === "grade12") return "Grade 12 Template";
  if (templateType === "grade11_techpro") return "Grade 11 Tech Pro Template";
  return "Grade 11 Academic Template";
}

function getSlotsForSection(section?: Section, gradeLevel?: string) {
  const templateType = getTemplateType(section, gradeLevel);
  if (templateType === "grade12") return grade12Slots;
  if (templateType === "grade11_techpro") return grade11TechProSlots;
  return grade11AcademicSlots;
}

function getSlots(gradeLevel: string) {
  return normalizeGrade(gradeLevel) === "12" ? grade12Slots : grade11AcademicSlots;
}

function getBreaks(gradeLevel: string) {
  return gradeBreaks[normalizeGrade(gradeLevel)] ?? gradeBreaks["11"];
}

function timeToMinutes(value: string) {
  const [rawHour, rawMinute = "0"] = value.split(":");
  let hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (hour < 7) hour += 12;
  return hour * 60 + minute;
}

function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

function entriesOverlap(first: ClassScheduleEntry, second: ClassScheduleEntry) {
  if (first.day !== second.day) return false;

  return timeRangesOverlap(first.startTime, first.endTime, second.startTime, second.endTime);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getScheduleId(
  assignment: LoadAssignment,
  day: ScheduleDay,
  slot: Slot,
  sessionIndex: number,
) {
  return [
    assignment.schoolYear,
    assignment.term,
    assignment.gradeLevel,
    assignment.sectionId,
    assignment.subjectId,
    assignment.teacherId,
    day,
    slot.slotId,
    sessionIndex,
  ]
    .map((value) => String(value).replace(/[^a-zA-Z0-9]/g, "_"))
    .join("__");
}

function sessionsForAssignment(assignment: JoinedAssignment) {
  const grade = normalizeGrade(assignment.gradeLevel || assignment.section.gradeLevel);
  const units = Number(assignment.units || assignment.subject.units || 0);

  if (units === 3) return { sessions: 2, duration: 1.5, priority: 4, special: false };
  if (units === 6) return { sessions: 4, duration: 1.5, priority: 3, special: false };
  if (units === 8) return { sessions: 4, duration: 2, priority: 2, special: false };
  if (units === 16) return { sessions: 8, duration: 2, priority: 1, special: false };
  if (units === 12.5) {
    const slots = getSlotsForSection(assignment.section, grade);
    const hasTwoPointFiveSlot = slots.some((slot) => slot.duration === 2.5);
    return {
      sessions: 5,
      duration: 2.5,
      priority: 1,
      special: !hasTwoPointFiveSlot,
    };
  }
  if (grade === "12" && units === 2) return { sessions: 1, duration: 2, priority: 5, special: false };

  return { sessions: 1, duration: units > 0 ? units : 1, priority: 6, special: true };
}

function isFixedTechProAssignment(assignment: JoinedAssignment) {
  const units = Number(assignment.units || assignment.subject.units || 0);
  return (
    units === 12.5 &&
    getTemplateType(assignment.section, assignment.gradeLevel) === "grade11_techpro"
  );
}

function createScheduleEntry(session: RequiredSession, day: ScheduleDay, slot: Slot): ClassScheduleEntry {
  const room = session.assignment.section.room?.trim();

  return {
    scheduleId: getScheduleId(session.assignment, day, slot, session.sessionIndex),
    schoolYear: session.assignment.schoolYear,
    term: session.assignment.term,
    gradeLevel: session.assignment.gradeLevel,
    strand: session.assignment.strand,
    sectionId: session.assignment.sectionId,
    subjectId: session.assignment.subjectId,
    teacherId: session.assignment.teacherId,
    room: room || undefined,
    day,
    startTime: slot.startTime,
    endTime: slot.endTime,
    duration: slot.duration,
    slotId: slot.slotId,
    sourceAssignmentId: session.assignment.assignmentId,
    templateType: getTemplateType(session.assignment.section, session.assignment.gradeLevel),
  };
}

function moveEntryToSlot(entry: ClassScheduleEntry, day: ScheduleDay, slot: Slot): ClassScheduleEntry {
  return {
    ...entry,
    day,
    startTime: slot.startTime,
    endTime: slot.endTime,
    duration: slot.duration,
    slotId: slot.slotId,
  };
}

function hasTeacherConflict(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  return currentSchedule.some(
    (item) =>
      item.teacherId === entry.teacherId &&
      entriesOverlap(item, entry),
  );
}

function hasSectionConflict(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  return currentSchedule.some(
    (item) =>
      item.sectionId === entry.sectionId &&
      entriesOverlap(item, entry),
  );
}

function hasRoomConflict(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  if (!entry.room) return false;

  return currentSchedule.some(
    (item) =>
      item.room === entry.room &&
      entriesOverlap(item, entry),
  );
}

function hasHardConflict(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  return (
    currentSchedule.some((item) => item.scheduleId === entry.scheduleId) ||
    hasTeacherConflict(entry, currentSchedule) ||
    hasSectionConflict(entry, currentSchedule) ||
    hasRoomConflict(entry, currentSchedule)
  );
}

function getHardConflictReason(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  const duplicate = currentSchedule.find((item) => item.scheduleId === entry.scheduleId);
  if (duplicate) return "Cannot place here. Duplicate schedule entry.";

  const teacherConflict = currentSchedule.find(
    (item) => item.teacherId === entry.teacherId && entriesOverlap(item, entry),
  );
  if (teacherConflict) {
    return `Cannot place here. Teacher has an overlapping class (${teacherConflict.startTime}-${teacherConflict.endTime}).`;
  }

  const sectionConflict = currentSchedule.find(
    (item) => item.sectionId === entry.sectionId && entriesOverlap(item, entry),
  );
  if (sectionConflict) return "Cannot place here. Section already has a class.";

  const roomConflict = entry.room
    ? currentSchedule.find((item) => item.room === entry.room && entriesOverlap(item, entry))
    : undefined;
  if (roomConflict) return "Cannot place here. Room is already in use.";

  return "";
}

function getOverlapWarnings(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[], entityField: "sectionId" | "teacherId") {
  return currentSchedule
    .filter((item) => item.scheduleId !== entry.scheduleId && entriesOverlap(item, entry))
    .flatMap((item) => {
      if (entityField === "teacherId" && item.teacherId === entry.teacherId) {
        return [`Teacher time conflict: overlaps with ${item.startTime}-${item.endTime}`];
      }
      if (entityField === "sectionId" && item.sectionId === entry.sectionId) {
        return [`Section time conflict: overlaps with ${item.startTime}-${item.endTime}`];
      }
      if (entry.room && item.room === entry.room) {
        return [`Room time conflict: overlaps with ${item.startTime}-${item.endTime}`];
      }
      return [];
    });
}

function dedupeScheduleEntries(entries: ClassScheduleEntry[]) {
  const seenIds = new Set<string>();
  const seenSlots = new Set<string>();

  return entries.filter((entry) => {
    const slotKey = [
      entry.schoolYear,
      entry.term,
      entry.sectionId,
      entry.subjectId,
      entry.teacherId,
      entry.day,
      entry.startTime,
      entry.endTime,
      entry.sourceAssignmentId,
    ].join("|");

    if (seenIds.has(entry.scheduleId) || seenSlots.has(slotKey)) return false;
    seenIds.add(entry.scheduleId);
    seenSlots.add(slotKey);
    return true;
  });
}

function validateScheduleEntries(entries: ClassScheduleEntry[]) {
  const conflicts: Conflict[] = [];
  const seenIds = new Set<string>();
  const seenEntryKeys = new Set<string>();

  entries.forEach((entry, index) => {
    const duplicateKey = [
      entry.sectionId,
      entry.subjectId,
      entry.teacherId,
      entry.day,
      entry.startTime,
      entry.endTime,
      entry.sourceAssignmentId,
    ].join("|");

    if (seenIds.has(entry.scheduleId)) {
      conflicts.push({
        assignmentId: `${entry.sourceAssignmentId}-duplicate-id-${index}`,
        type: "conflict",
        subjectName: entry.subjectId,
        sectionName: entry.sectionId,
        teacherName: entry.teacherId,
        reason: `Duplicate schedule ID detected: ${entry.scheduleId}.`,
        sessions: 1,
      });
    }
    if (seenEntryKeys.has(duplicateKey)) {
      conflicts.push({
        assignmentId: `${entry.sourceAssignmentId}-duplicate-entry-${index}`,
        type: "conflict",
        subjectName: entry.subjectId,
        sectionName: entry.sectionId,
        teacherName: entry.teacherId,
        reason: "Duplicate schedule entry detected.",
        sessions: 1,
      });
    }

    seenIds.add(entry.scheduleId);
    seenEntryKeys.add(duplicateKey);

    entries.slice(index + 1).forEach((other) => {
      if (!entriesOverlap(entry, other)) return;
      if (entry.teacherId === other.teacherId) {
        conflicts.push({
          assignmentId: `${entry.sourceAssignmentId}-teacher-overlap-${index}`,
          type: "conflict",
          subjectName: entry.subjectId,
          sectionName: entry.sectionId,
          teacherName: entry.teacherId,
          reason: "Teacher is scheduled in overlapping classes.",
          sessions: 1,
        });
      }
      if (entry.sectionId === other.sectionId) {
        conflicts.push({
          assignmentId: `${entry.sourceAssignmentId}-section-overlap-${index}`,
          type: "conflict",
          subjectName: entry.subjectId,
          sectionName: entry.sectionId,
          teacherName: entry.teacherId,
          reason: "Section is scheduled in overlapping classes.",
          sessions: 1,
        });
      }
      if (entry.room && entry.room === other.room) {
        conflicts.push({
          assignmentId: `${entry.sourceAssignmentId}-room-overlap-${index}`,
          type: "conflict",
          subjectName: entry.subjectId,
          sectionName: entry.sectionId,
          teacherName: entry.teacherId,
          reason: `Room ${entry.room} is scheduled in overlapping classes.`,
          sessions: 1,
        });
      }
    });
  });

  return conflicts;
}

function buildRequiredSessions(assignments: JoinedAssignment[], lockedEntries: ClassScheduleEntry[] = []) {
  const sessions: RequiredSession[] = [];
  const conflicts: Conflict[] = [];
  const lockedCounts = new Map<string, number>();

  lockedEntries.forEach((entry) => {
    lockedCounts.set(entry.sourceAssignmentId, (lockedCounts.get(entry.sourceAssignmentId) ?? 0) + 1);
  });

  assignments.forEach((assignment) => {
    const rule = sessionsForAssignment(assignment);
    const units = Number(assignment.units || assignment.subject.units || 0);
    const lockedCount = lockedCounts.get(assignment.assignmentId) ?? 0;

    if (rule.special) {
      if (lockedCount < rule.sessions) {
        conflicts.push({
          assignmentId: assignment.assignmentId,
          type: "special",
          subjectName: assignment.subject.subjectName,
          sectionName: assignment.section.sectionName,
          teacherName: assignment.teacher.fullName,
          reason: "No compatible time slot exists for this subject's required duration. Check the section template or subject units.",
          sessions: rule.sessions - lockedCount,
        });
      }
      return;
    }

    Array.from({ length: Math.max(0, rule.sessions - lockedCount) }, (_, index) => {
      const sessionIndex = lockedCount + index + 1;

      sessions.push({
        sessionId: `${assignment.assignmentId}:${sessionIndex}`,
        assignment,
        duration: rule.duration,
        sessionIndex,
        totalSessions: rule.sessions,
        priority: rule.priority,
        units,
        preferElectiveSlot: normalizeGrade(assignment.gradeLevel) === "11" && (units === 8 || units === 12.5),
      });
    });
  });

  return { sessions, conflicts };
}

function buildRemainingSessions(assignments: JoinedAssignment[], existingEntries: ClassScheduleEntry[] = []) {
  const sessions: RequiredSession[] = [];
  const conflicts: Conflict[] = [];
  const existingCounts = new Map<string, number>();

  existingEntries.forEach((entry) => {
    existingCounts.set(entry.sourceAssignmentId, (existingCounts.get(entry.sourceAssignmentId) ?? 0) + 1);
  });

  assignments.forEach((assignment) => {
    const rule = sessionsForAssignment(assignment);
    const units = Number(assignment.units || assignment.subject.units || 0);
    const existingCount = existingCounts.get(assignment.assignmentId) ?? 0;

    if (rule.special) {
      if (existingCount < rule.sessions) {
        conflicts.push({
          assignmentId: assignment.assignmentId,
          type: "special",
          subjectName: assignment.subject.subjectName,
          sectionName: assignment.section.sectionName,
          teacherName: assignment.teacher.fullName,
          reason: "No compatible time slot exists for this subject's required duration. Check the section template or subject units.",
          sessions: rule.sessions - existingCount,
        });
      }
      return;
    }

    Array.from({ length: Math.max(0, rule.sessions - existingCount) }, (_, index) => {
      const sessionIndex = existingCount + index + 1;

      sessions.push({
        sessionId: `${assignment.assignmentId}:${sessionIndex}`,
        assignment,
        duration: rule.duration,
        sessionIndex,
        totalSessions: rule.sessions,
        priority: rule.priority,
        units,
        preferElectiveSlot: normalizeGrade(assignment.gradeLevel) === "11" && (units === 8 || units === 12.5),
      });
    });
  });

  return { sessions, conflicts };
}

function preferredDaysForSlot(session: RequiredSession, slot: Slot, slots: Slot[]) {
  if (session.totalSessions !== 4) return days;

  const slotIndex = slots.findIndex((item) => item.slotId === slot.slotId);
  return fourSessionDayPattern[slotIndex] ?? days;
}

function candidatePreferenceScore(
  session: RequiredSession,
  candidate: CandidateSlot,
  slots: Slot[],
  currentSchedule: ClassScheduleEntry[],
) {
  let score = 0;
  const preferredDays = preferredDaysForSlot(session, candidate.slot, slots);
  const isAfternoonElectiveBlock = candidate.slot.startTime === "2:00";

  if (preferredDays.includes(candidate.day)) score += 100;
  if (!candidate.slot.slotId.includes("1400")) score += 20;
  if (session.preferElectiveSlot && isAfternoonElectiveBlock) score += 500;
  if (
    currentSchedule.some(
      (entry) =>
        entry.teacherId === session.assignment.teacherId &&
        entry.day === candidate.day,
    )
  ) {
    score -= 10;
  }

  return score;
}

function getCandidateSlots(session: RequiredSession, currentSchedule: ClassScheduleEntry[]) {
  const slots = getSlotsForSection(session.assignment.section, session.assignment.gradeLevel);
  const slotCandidates = slots
    .filter((slot) => slot.duration === session.duration)
    .sort((first, second) => {
      if (!session.preferElectiveSlot) return 0;
      return Number(second.slotId.includes("1400")) - Number(first.slotId.includes("1400"));
    });
  const sameSubjectDays = new Set(
    currentSchedule
      .filter(
        (entry) =>
          entry.sectionId === session.assignment.sectionId &&
          entry.subjectId === session.assignment.subjectId,
      )
      .map((entry) => entry.day),
  );
  return slotCandidates
    .flatMap((slot) => {
      const preferredDays = preferredDaysForSlot(session, slot, slots);
      const candidateDays = [
        ...preferredDays.filter((day) => !sameSubjectDays.has(day)),
        ...days.filter((day) => !preferredDays.includes(day) && !sameSubjectDays.has(day)),
      ];

      return candidateDays.map((day) => ({ day, slot }));
    })
    .filter((candidate) => {
        const entry = createScheduleEntry(session, candidate.day, candidate.slot);
        return !hasHardConflict(entry, currentSchedule);
    })
    .sort(
      (first, second) =>
        candidatePreferenceScore(session, second, slots, currentSchedule) -
        candidatePreferenceScore(session, first, slots, currentSchedule),
    );
}

function conflictForSession(session: RequiredSession, reason: string): Conflict {
  return {
    assignmentId: session.assignment.assignmentId,
    type: "unscheduled",
    subjectName: session.assignment.subject.subjectName,
    sectionName: session.assignment.section.sectionName,
    teacherName: session.assignment.teacher.fullName,
    reason,
    sessions: 1,
  };
}

function conflictForAssignment(assignment: JoinedAssignment, reason: string, sessions = 1): Conflict {
  return {
    assignmentId: assignment.assignmentId,
    type: "unscheduled",
    subjectName: assignment.subject.subjectName,
    sectionName: assignment.section.sectionName,
    teacherName: assignment.teacher.fullName,
    reason,
    sessions,
  };
}

function getCompletionStats(
  entries: ClassScheduleEntry[],
  remainingSessions: number,
  specialConflicts: Conflict[],
) {
  const requiredCount =
    entries.length +
    remainingSessions +
    specialConflicts.reduce((sum, conflict) => sum + conflict.sessions, 0);
  const completionPercent =
    requiredCount === 0 ? 100 : Math.round((entries.length / requiredCount) * 100);

  return {
    scheduledSessions: entries.length,
    requiredSessions: requiredCount,
    completionPercent,
  };
}

function yieldToBrowser() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function formatCountdown(totalSeconds: number | null) {
  if (totalSeconds === null) return "--:--";

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function changedEntryIds(previousEntries: ClassScheduleEntry[], nextEntries: ClassScheduleEntry[]) {
  const previousById = new Map(previousEntries.map((entry) => [entry.scheduleId, entry]));

  return nextEntries
    .filter((entry) => {
      const previous = previousById.get(entry.scheduleId);
      return (
        !previous ||
        previous.day !== entry.day ||
        previous.slotId !== entry.slotId ||
        previous.teacherId !== entry.teacherId ||
        previous.sectionId !== entry.sectionId ||
        previous.subjectId !== entry.subjectId
      );
    })
    .map((entry) => entry.scheduleId);
}

function getDraftStorageKey(
  schoolYear: string,
  term: AcademicTerm,
  gradeLevel: string,
  strandFilter: string,
) {
  return ["scheduler-draft", schoolYear, term, gradeLevel, strandFilter]
    .map((value) => encodeURIComponent(value))
    .join(":");
}

function cleanEntryForLocalDraft(entry: ClassScheduleEntry): ClassScheduleEntry {
  const { createdAt, updatedAt, ...draftEntry } = entry;
  return draftEntry;
}

function loadLocalScheduleDraft(storageKey: string): LocalScheduleDraft | null {
  try {
    const rawDraft = window.localStorage.getItem(storageKey);
    if (!rawDraft) return null;
    const parsed = JSON.parse(rawDraft) as LocalScheduleDraft;
    if (!Array.isArray(parsed.entries) || typeof parsed.updatedAt !== "number") return null;
    return parsed;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function removeLocalScheduleDraft(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch (error) {
    console.error(error);
  }
}

function getEntryUpdatedAtMs(entry: ClassScheduleEntry) {
  const updatedAt = entry.updatedAt;
  if (!updatedAt) return 0;
  if (typeof updatedAt.toMillis === "function") return updatedAt.toMillis();
  return updatedAt.seconds ? updatedAt.seconds * 1000 : 0;
}

function getNewestCloudScheduleMs(entries: ClassScheduleEntry[]) {
  return entries.reduce((newest, entry) => Math.max(newest, getEntryUpdatedAtMs(entry)), 0);
}

function getAvailableHoursForSlots(slots: Slot[]) {
  return slots.reduce((sum, slot) => sum + slot.duration, 0) * days.length;
}

function getUnionHoursForSlots(slots: Slot[]) {
  const intervals = slots
    .map((slot) => [timeToMinutes(slot.startTime), timeToMinutes(slot.endTime)] as const)
    .sort((first, second) => first[0] - second[0]);
  const merged: Array<[number, number]> = [];

  intervals.forEach(([start, end]) => {
    const previous = merged[merged.length - 1];
    if (!previous || start > previous[1]) {
      merged.push([start, end]);
      return;
    }
    previous[1] = Math.max(previous[1], end);
  });

  return merged.reduce((sum, [start, end]) => sum + (end - start) / 60, 0) * days.length;
}

function scoreSchedule(
  scheduledEntries: ClassScheduleEntry[],
  requiredSessions: RequiredSession[],
  specialConflicts: Conflict[],
) {
  const slots = allDisplaySlots;
  const scheduledSourceCounts = new Map<string, number>();
  const requiredByAssignmentId = new Map(
    requiredSessions.map((session) => [session.assignment.assignmentId, session.assignment]),
  );
  scheduledEntries.forEach((entry) => {
    scheduledSourceCounts.set(
      entry.sourceAssignmentId,
      (scheduledSourceCounts.get(entry.sourceAssignmentId) ?? 0) + 1,
    );
  });

  const unscheduledCount = Math.max(0, requiredSessions.length - scheduledEntries.length);
  let score = scheduledEntries.length * (100 + 50 + 50 + 30);
  const subjectDayCounts = new Map<string, Set<ScheduleDay>>();
  const subjectTotalCounts = new Map<string, number>();

  scheduledEntries.forEach((entry) => {
    const key = `${entry.sectionId}:${entry.subjectId}`;
    const daysUsed = subjectDayCounts.get(key) ?? new Set<ScheduleDay>();
    daysUsed.add(entry.day);
    subjectDayCounts.set(key, daysUsed);
    subjectTotalCounts.set(key, (subjectTotalCounts.get(key) ?? 0) + 1);

    if (!entry.slotId.includes("1400")) score += 20;
    if (normalizeGrade(entry.gradeLevel) === "11" && entry.duration === 2 && entry.slotId.includes("1400")) {
      score += 120;
    }
    const assignment = requiredByAssignmentId.get(entry.sourceAssignmentId);
    const units = Number(assignment?.units || assignment?.subject.units || 0);
    if (
      units === 12.5 &&
      getTemplateType(assignment?.section, entry.gradeLevel) === "grade11_techpro"
    ) {
      score += entry.slotId === "g11-techpro-1400-1630" && entry.duration === 2.5 ? 400 : -2000;
    }
  });

  subjectTotalCounts.forEach((count, key) => {
    const uniqueDays = subjectDayCounts.get(key)?.size ?? 0;
    score += uniqueDays * 15;
    score -= Math.max(0, count - uniqueDays) * 100;
  });

  if (scheduledEntries.some((entry) => normalizeGrade(entry.gradeLevel) === "11")) {
    const sectionIds = new Set(scheduledEntries.map((entry) => entry.sectionId));
    sectionIds.forEach((sectionId) => {
      const electiveCount = scheduledEntries.filter(
        (entry) => entry.sectionId === sectionId && entry.slotId.includes("1400"),
      ).length;
      if (days.length - electiveCount === 1) score += 10;
    });
  }

  const sectionDayCounts = new Map<string, number[]>();
  const sectionDaySlotIndexes = new Map<string, number[]>();

  scheduledEntries.forEach((entry) => {
    const dayIndex = days.indexOf(entry.day);
    if (dayIndex < 0) return;

    const counts = sectionDayCounts.get(entry.sectionId) ?? Array.from({ length: days.length }, () => 0);
    counts[dayIndex] += 1;
    sectionDayCounts.set(entry.sectionId, counts);

    const sectionSlots = getSlotsForSection(
      requiredByAssignmentId.get(entry.sourceAssignmentId)?.section,
      entry.gradeLevel,
    );
    const slotIndex = sectionSlots.findIndex((slot) => slot.slotId === entry.slotId);
    if (slotIndex >= 0) {
      const key = `${entry.sectionId}:${entry.day}`;
      const indexes = sectionDaySlotIndexes.get(key) ?? [];
      indexes.push(slotIndex);
      sectionDaySlotIndexes.set(key, indexes);
    }
  });

  sectionDayCounts.forEach((counts) => {
    const usedCounts = counts.filter((count) => count > 0);
    if (usedCounts.length === 0) return;
    score -= (Math.max(...usedCounts) - Math.min(...usedCounts)) * 25;
  });

  sectionDaySlotIndexes.forEach((indexes) => {
    const sorted = [...new Set(indexes)].sort((first, second) => first - second);
    for (let index = 1; index < sorted.length; index += 1) {
      score -= Math.max(0, sorted[index] - sorted[index - 1] - 1) * 15;
    }
  });

  if (unscheduledCount > 0) {
    score -= unscheduledCount * 500;
    const sectionsWithEntries = new Set([
      ...requiredSessions.map((session) => session.assignment.sectionId),
      ...scheduledEntries.map((entry) => entry.sectionId),
    ]);
    let unusedValidSlots = 0;

    sectionsWithEntries.forEach((sectionId) => {
      days.forEach((day) => {
        slots.forEach((slot) => {
          const isBlank = !scheduledEntries.some(
            (entry) => entry.sectionId === sectionId && entry.day === day && entry.slotId === slot.slotId,
          );
          const canUse = requiredSessions
            .filter((session) => !scheduledSourceCounts.has(session.assignment.assignmentId) || (scheduledSourceCounts.get(session.assignment.assignmentId) ?? 0) < session.totalSessions)
            .some(
              (session) => {
                const sessionSlots = getSlotsForSection(session.assignment.section, session.assignment.gradeLevel);
                return (
                  session.assignment.sectionId === sectionId &&
                  sessionSlots.some((sessionSlot) => sessionSlot.slotId === slot.slotId) &&
                  session.duration === slot.duration
                );
              },
            );

          if (isBlank && canUse) unusedValidSlots += 1;
        });
      });
    });

    score -= unusedValidSlots * 300;
  }

  score -= specialConflicts.reduce((sum, conflict) => sum + conflict.sessions * 500, 0);

  return score;
}

function sortSessionsByDifficulty(sessions: RequiredSession[], currentSchedule: ClassScheduleEntry[]) {
  return [...sessions].sort((first, second) => {
    const firstCandidates = getCandidateSlots(first, currentSchedule).length;
    const secondCandidates = getCandidateSlots(second, currentSchedule).length;

    if (firstCandidates !== secondCandidates) return firstCandidates - secondCandidates;
    if (first.priority !== second.priority) return first.priority - second.priority;
    return first.assignment.section.sectionName.localeCompare(second.assignment.section.sectionName);
  });
}

function generateScheduleFastDraft(
  assignments: JoinedAssignment[],
  lockedEntries: ClassScheduleEntry[] = [],
): GenerationResult {
  const entries: ClassScheduleEntry[] = [...lockedEntries];
  const { sessions: requiredSessions, conflicts } = buildRequiredSessions(assignments, lockedEntries);

  requiredSessions.sort((first, second) => {
    if (first.priority !== second.priority) return first.priority - second.priority;
    return first.assignment.section.sectionName.localeCompare(second.assignment.section.sectionName);
  });

  requiredSessions.forEach((session) => {
    const candidates = getCandidateSlots(session, entries);
    const candidate = candidates[0];

    if (candidate) {
      entries.push(createScheduleEntry(session, candidate.day, candidate.slot));
      return;
    }

    conflicts.push(conflictForSession(session, "No valid conflict-free slot was available in the current draft order."));
  });

  const validatedEntries = dedupeScheduleEntries(entries);
  const validationConflicts = validateScheduleEntries(validatedEntries);

  return {
    entries: validatedEntries,
    conflicts: [...conflicts, ...validationConflicts],
    score: scoreSchedule(validatedEntries, requiredSessions, conflicts.filter((conflict) => conflict.type === "special")),
    ...getCompletionStats(
      validatedEntries,
      conflicts.filter((conflict) => conflict.type === "unscheduled").length,
      conflicts.filter((conflict) => conflict.type === "special"),
    ),
    combinationsTried: requiredSessions.length,
  };
}

function getGapPenaltyForEntry(entry: ClassScheduleEntry, entries: ClassScheduleEntry[]) {
  const sameDayEntries = entries
    .filter(
      (item) =>
        item.day === entry.day &&
        (item.teacherId === entry.teacherId || item.sectionId === entry.sectionId),
    )
    .sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime));
  let penalty = 0;

  for (let index = 1; index < sameDayEntries.length; index += 1) {
    const previous = sameDayEntries[index - 1];
    const current = sameDayEntries[index];
    const gap = timeToMinutes(current.startTime) - timeToMinutes(previous.endTime);
    if (gap > 0) penalty += gap / 15;
  }

  return penalty;
}

function findSafeMoveForEntry(
  entry: ClassScheduleEntry,
  entries: ClassScheduleEntry[],
  assignments: JoinedAssignment[],
) {
  const assignment = assignments.find((item) => item.assignmentId === entry.sourceAssignmentId);
  const sectionSlots = getSlotsForSection(assignment?.section, entry.gradeLevel).filter(
    (slot) => slot.duration === entry.duration,
  );
  const otherEntries = entries.filter((item) => item.scheduleId !== entry.scheduleId);
  const options = sectionSlots
    .flatMap((slot) => days.map((day) => moveEntryToSlot(entry, day, slot)))
    .filter((moved) => !getHardConflictReason(moved, otherEntries))
    .sort(
      (first, second) =>
        getGapPenaltyForEntry(first, [...otherEntries, first]) -
        getGapPenaltyForEntry(second, [...otherEntries, second]),
    );

  return options[0];
}

function autoPlotTeacherEntries(
  teacherId: string,
  assignments: JoinedAssignment[],
  currentEntries: ClassScheduleEntry[],
  allowMovingUnlockedEntries: boolean,
) {
  let entries = [...currentEntries];
  const teacherAssignments = assignments.filter((assignment) => assignment.teacherId === teacherId);
  const { sessions, conflicts } = buildRemainingSessions(teacherAssignments, entries);
  const placedIds: string[] = [];
  const movedIds: string[] = [];
  const unplacedConflicts: Conflict[] = [...conflicts];

  sortSessionsByDifficulty(sessions, entries).forEach((session) => {
    const candidate = getCandidateSlots(session, entries)[0];

    if (candidate) {
      const entry = createScheduleEntry(session, candidate.day, candidate.slot);
      entries = [...entries, entry];
      placedIds.push(entry.scheduleId);
      return;
    }

    if (allowMovingUnlockedEntries) {
      const slots = getSlotsForSection(session.assignment.section, session.assignment.gradeLevel)
        .filter((slot) => slot.duration === session.duration);
      const moveResult = slots
        .flatMap((slot) => days.map((day) => ({ day, slot })))
        .map((target) => {
          const entry = createScheduleEntry(session, target.day, target.slot);
          const blockers = entries.filter(
            (item) =>
              item.scheduleId !== entry.scheduleId &&
              entriesOverlap(item, entry) &&
              (item.teacherId === entry.teacherId ||
                item.sectionId === entry.sectionId ||
                Boolean(entry.room && item.room === entry.room)),
          );

          if (blockers.length === 0 || blockers.some((blocker) => blocker.locked)) return undefined;

          let trialEntries = entries.filter(
            (item) => !blockers.some((blocker) => blocker.scheduleId === item.scheduleId),
          );
          const movedEntries: ClassScheduleEntry[] = [];

          for (const blocker of blockers) {
            const moved = findSafeMoveForEntry(blocker, [...trialEntries, entry, ...movedEntries], assignments);
            if (!moved) return undefined;
            trialEntries = trialEntries.filter((item) => item.scheduleId !== blocker.scheduleId);
            movedEntries.push(moved);
          }

          const nextEntries = [...trialEntries, ...movedEntries, entry];
          if (getHardConflictReason(entry, [...trialEntries, ...movedEntries])) return undefined;
          if (
            movedEntries.some((moved) =>
              getHardConflictReason(
                moved,
                nextEntries.filter((item) => item.scheduleId !== moved.scheduleId),
              ),
            )
          ) {
            return undefined;
          }

          return {
            entry,
            movedEntries,
            nextEntries,
            score: movedEntries.length * 100 + getGapPenaltyForEntry(entry, nextEntries),
          };
        })
        .filter(
          (
            item,
          ): item is {
            entry: ClassScheduleEntry;
            movedEntries: ClassScheduleEntry[];
            nextEntries: ClassScheduleEntry[];
            score: number;
          } => Boolean(item),
        )
        .sort((first, second) => first.score - second.score)[0];

      if (moveResult) {
        entries = moveResult.nextEntries;
        placedIds.push(moveResult.entry.scheduleId);
        movedIds.push(...moveResult.movedEntries.map((entry) => entry.scheduleId));
        return;
      }
    }

    unplacedConflicts.push(
      conflictForSession(
        session,
        allowMovingUnlockedEntries
          ? "Auto Plot could not find a safe slot or safe unlocked move for this session."
          : "Auto Plot could not find an empty compatible slot for this session.",
      ),
    );
  });

  const validatedEntries = dedupeScheduleEntries(entries);

  return {
    entries: validatedEntries,
    conflicts: [...unplacedConflicts, ...validateScheduleEntries(validatedEntries)],
    placedIds,
    movedIds,
  };
}

function runFeasibilityCheck(assignments: JoinedAssignment[], lockedEntries: ClassScheduleEntry[] = []): FeasibilityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sectionSummaries: FeasibilityResult["sectionSummaries"] = [];
  const assignmentsBySection = new Map<string, JoinedAssignment[]>();
  const assignmentsByTeacher = new Map<string, JoinedAssignment[]>();

  assignments.forEach((assignment) => {
    const sectionAssignments = assignmentsBySection.get(assignment.sectionId) ?? [];
    sectionAssignments.push(assignment);
    assignmentsBySection.set(assignment.sectionId, sectionAssignments);

    const teacherAssignments = assignmentsByTeacher.get(assignment.teacherId) ?? [];
    teacherAssignments.push(assignment);
    assignmentsByTeacher.set(assignment.teacherId, teacherAssignments);
  });

  assignmentsBySection.forEach((sectionAssignments) => {
    const section = sectionAssignments[0]?.section;
    if (!section) return;

    const slots = getSlotsForSection(section, section.gradeLevel);
    const requiredHours = sectionAssignments.reduce(
      (sum, assignment) => sum + Number(assignment.units || assignment.subject.units || 0),
      0,
    );
    const availableHours = getAvailableHoursForSlots(slots);
    const remainingHours = availableHours - requiredHours;
    const template = getTemplateLabel(section);

    sectionSummaries.push({
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      template,
      requiredHours,
      availableHours,
      remainingHours,
    });

    if (requiredHours > availableHours) {
      errors.push(
        `${section.sectionName} requires ${requiredHours} hours but ${template} only has ${availableHours} available hours.`,
      );
    }
    if (Math.abs(remainingHours) < 0.01) {
      warnings.push(
        `${section.sectionName} is fully occupied after required subjects. This is valid, but manual changes may be limited.`,
      );
    } else if (remainingHours > 0 && remainingHours <= 1.5) {
      warnings.push(
        `${section.sectionName} has only ${remainingHours} open hours after required subjects.`,
      );
    }
    sectionAssignments.forEach((assignment) => {
      const rule = sessionsForAssignment(assignment);
      const hasCompatibleSlot = slots.some((slot) => slot.duration === rule.duration);

      if (!hasCompatibleSlot) {
        errors.push(
          `${assignment.subject.subjectName} for ${section.sectionName} requires a ${rule.duration}-hour slot, but ${template} has no matching slot.`,
        );
      }
    });
  });

  assignmentsByTeacher.forEach((teacherAssignments) => {
    const teacher = teacherAssignments[0]?.teacher;
    if (!teacher) return;

    const assignedHours = teacherAssignments.reduce(
      (sum, assignment) => sum + Number(assignment.units || assignment.subject.units || 0),
      0,
    );
    const uniqueSlots = [
      ...new Map(
        teacherAssignments
          .flatMap((assignment) => getSlotsForSection(assignment.section, assignment.gradeLevel))
          .map((slot) => [slot.slotId, slot]),
      ).values(),
    ];
    const availableTeachingHours = getUnionHoursForSlots(uniqueSlots);

    if (assignedHours > availableTeachingHours) {
      errors.push(
        `${teacher.fullName} has ${assignedHours} assigned hours but only ${availableTeachingHours} available teaching hours in the selected templates.`,
      );
    }
  });

  const fixedTechProAssignments = assignments.filter(isFixedTechProAssignment);
  const fixedTechProGroups = [
    {
      label: "teacher",
      getKey: (assignment: JoinedAssignment) => assignment.teacherId,
      getName: (assignment: JoinedAssignment) => assignment.teacher.fullName,
    },
    {
      label: "section",
      getKey: (assignment: JoinedAssignment) => assignment.sectionId,
      getName: (assignment: JoinedAssignment) => assignment.section.sectionName,
    },
    {
      label: "room",
      getKey: (assignment: JoinedAssignment) => assignment.section.room?.trim() || "",
      getName: (assignment: JoinedAssignment) => assignment.section.room?.trim() || "",
    },
  ];

  fixedTechProGroups.forEach((group) => {
    const grouped = new Map<string, JoinedAssignment[]>();
    fixedTechProAssignments.forEach((assignment) => {
      const key = group.getKey(assignment);
      if (!key) return;
      const matches = grouped.get(key) ?? [];
      matches.push(assignment);
      grouped.set(key, matches);
    });

    grouped.forEach((matches) => {
      if (matches.length < 2) return;
      errors.push(
        `Grade 11 Tech Pro 12.5-unit subjects share the fixed 2:00-4:30 slot for the same ${group.label} (${group.getName(matches[0])}): ${matches.map((assignment) => `${assignment.subject.subjectName} - ${assignment.section.sectionName}`).join(", ")}.`,
      );
    });
  });

  lockedEntries.forEach((entry) => {
    const assignment = assignments.find((item) => item.assignmentId === entry.sourceAssignmentId);
    if (!assignment) return;

    const allowedSlots = getSlotsForSection(assignment.section, assignment.gradeLevel);
    const fitsAllowedSlot = allowedSlots.some(
      (slot) =>
        slot.startTime === entry.startTime &&
        slot.endTime === entry.endTime &&
        slot.duration === entry.duration,
    );

    if (!fitsAllowedSlot) {
      errors.push(
        `Locked ${assignment.subject.subjectName} for ${assignment.section.sectionName} cannot fit any allowed ${getTemplateLabel(assignment.section, assignment.gradeLevel)} slot.`,
      );
    }
  });

  lockedEntries.forEach((entry, index) => {
    lockedEntries.slice(index + 1).forEach((other) => {
      if (!entriesOverlap(entry, other)) return;
      const firstAssignment = assignments.find((item) => item.assignmentId === entry.sourceAssignmentId);
      const secondAssignment = assignments.find((item) => item.assignmentId === other.sourceAssignmentId);
      const firstLabel = firstAssignment
        ? `${firstAssignment.subject.subjectName} (${firstAssignment.section.sectionName})`
        : entry.scheduleId;
      const secondLabel = secondAssignment
        ? `${secondAssignment.subject.subjectName} (${secondAssignment.section.sectionName})`
        : other.scheduleId;

      if (entry.teacherId === other.teacherId) {
        errors.push(`Locked blocks overlap for the same teacher: ${firstLabel} and ${secondLabel}.`);
      }
      if (entry.sectionId === other.sectionId) {
        errors.push(`Locked blocks overlap for the same section: ${firstLabel} and ${secondLabel}.`);
      }
      if (entry.room && entry.room === other.room) {
        errors.push(`Locked blocks overlap in room ${entry.room}: ${firstLabel} and ${secondLabel}.`);
      }
    });
  });

  return {
    canGenerate: errors.length === 0,
    errors,
    warnings,
    sectionSummaries: sectionSummaries.sort((first, second) =>
      first.sectionName.localeCompare(second.sectionName),
    ),
  };
}

async function generateScheduleBestFit(
  assignments: JoinedAssignment[],
  lockedEntries: ClassScheduleEntry[] = [],
  maxSearchMs = bestFitSearchMs,
  maxCombinations = bestFitMaxCombinations,
  onProgress?: (progress: GenerationProgress) => void,
  shouldStop?: () => boolean,
): Promise<GenerationResult> {
  const startedAt = performance.now();
  const { sessions: requiredSessions, conflicts: specialConflicts } = buildRequiredSessions(assignments, lockedEntries);
  let bestEntries: ClassScheduleEntry[] = [...lockedEntries];
  let bestRemaining = requiredSessions;
  let bestScore = scoreSchedule(lockedEntries, requiredSessions, specialConflicts);
  let lastReportedEntries: ClassScheduleEntry[] = [...lockedEntries];
  let timedOut = false;
  let stopped = false;
  let combinationsTried = 0;

  function reportProgress() {
    const changedScheduleIds = changedEntryIds(lastReportedEntries, bestEntries);
    lastReportedEntries = [...bestEntries];

    onProgress?.({
      entries: [...bestEntries],
      changedScheduleIds,
      ...getCompletionStats(bestEntries, bestRemaining.length, specialConflicts),
      combinationsTried,
    });
  }

  function rememberBest(entries: ClassScheduleEntry[], remaining: RequiredSession[]) {
    const score = scoreSchedule(entries, requiredSessions, specialConflicts);

    if (
      score > bestScore ||
      (score === bestScore && remaining.length < bestRemaining.length)
    ) {
      bestScore = score;
      bestEntries = [...entries];
      bestRemaining = [...remaining];
      reportProgress();
    }
  }

  async function search(entries: ClassScheduleEntry[], remaining: RequiredSession[]): Promise<void> {
    if (shouldStop?.()) {
      stopped = true;
      rememberBest(entries, remaining);
      reportProgress();
      return;
    }

    if (performance.now() - startedAt >= maxSearchMs || combinationsTried >= maxCombinations) {
      timedOut = true;
      rememberBest(entries, remaining);
      reportProgress();
      return;
    }

    combinationsTried += 1;
    if (combinationsTried % bestFitProgressEvery === 0) {
      reportProgress();
      await yieldToBrowser();
    }
    rememberBest(entries, remaining);

    if (remaining.length === 0) return;

    const ordered = sortSessionsByDifficulty(remaining, entries);
    const session = ordered[0];
    const rest = remaining.filter((item) => item.sessionId !== session.sessionId);
    const candidates = getCandidateSlots(session, entries)
      .sort((first, second) => {
        const firstEntry = createScheduleEntry(session, first.day, first.slot);
        const secondEntry = createScheduleEntry(session, second.day, second.slot);
        return (
          scoreSchedule([...entries, secondEntry], requiredSessions, specialConflicts) -
          scoreSchedule([...entries, firstEntry], requiredSessions, specialConflicts)
        );
      });

    for (const candidate of candidates) {
      const entry = createScheduleEntry(session, candidate.day, candidate.slot);
      await search([...entries, entry], rest);
      if (timedOut || stopped) return;
    }

    await search(entries, rest);
  }

  reportProgress();
  await search([...lockedEntries], requiredSessions);

  const scheduledIds = new Set(bestEntries.map((entry) => entry.scheduleId));
  const unscheduledConflicts = bestRemaining.map((session) =>
    conflictForSession(
      session,
      "Best Fit could not place this session without creating a teacher, section, or room conflict.",
    ),
  );
  const scoreConflict: Conflict = {
    assignmentId: "optimization-score",
    type: "score",
    subjectName: "Optimization Score",
    sectionName: "",
    teacherName: "",
    reason: `Score ${bestScore}. Tried ${combinationsTried.toLocaleString()} combinations${timedOut ? " before the 1-minute limit" : ""}${stopped ? " before stopping" : ""}.`,
    sessions: 0,
  };
  const validatedEntries = dedupeScheduleEntries(bestEntries);
  const validationConflicts = validateScheduleEntries(validatedEntries);

  return {
    entries: validatedEntries.filter((entry) => scheduledIds.has(entry.scheduleId)),
    conflicts: [...specialConflicts, ...unscheduledConflicts, ...validationConflicts, scoreConflict],
    score: bestScore,
    ...getCompletionStats(validatedEntries, bestRemaining.length, specialConflicts),
    timedOut,
    stopped,
    combinationsTried,
  };
}

function SummaryCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function SchedulerPage() {
  const { profile, user } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [term, setTerm] = useState<AcademicTerm>(defaultTerm);
  const [gradeLevel, setGradeLevel] = useState("all");
  const [strandFilter, setStrandFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("section");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fast");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [savedEntries, setSavedEntries] = useState<ClassScheduleEntry[]>([]);
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [selectedSavedScheduleId, setSelectedSavedScheduleId] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [draftEntries, setDraftEntries] = useState<ClassScheduleEntry[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [generationMessage, setGenerationMessage] = useState("");
  const [optimizationScore, setOptimizationScore] = useState<number | null>(null);
  const [completionPercent, setCompletionPercent] = useState<number | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [recentlyChangedScheduleIds, setRecentlyChangedScheduleIds] = useState<Set<string>>(new Set());
  const [placementLog, setPlacementLog] = useState<ClassScheduleEntry[]>([]);
  const [feasibilityResult, setFeasibilityResult] = useState<FeasibilityResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationEndsAt, setGenerationEndsAt] = useState<number | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [draggedConflictAssignmentId, setDraggedConflictAssignmentId] = useState<string | null>(null);
  const [lockMessage, setLockMessage] = useState("");
  const [pendingLocalDraft, setPendingLocalDraft] = useState<LocalScheduleDraft | null>(null);
  const [cloudScheduleLoadedAt, setCloudScheduleLoadedAt] = useState(0);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [autoPlotMode, setAutoPlotMode] = useState<AutoPlotMode>("empty");
  const [autoPlotScope, setAutoPlotScope] = useState<AutoPlotScope>("selected");
  const [preserveExistingSchedule, setPreserveExistingSchedule] = useState(true);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSaveRunRef = useRef(0);
  const hasAutoRestoredDraftRef = useRef("");
  const stopGenerationRef = useRef(false);
  const scheduleContextKey = `${schoolYear}|${term}|${gradeLevel}|${strandFilter}`;
  const draftStorageKey = getDraftStorageKey(schoolYear, term, gradeLevel, strandFilter);
  const scheduleContextKeyRef = useRef(scheduleContextKey);

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(
    () => subscribeLoadAssignmentsByPeriod(schoolYear, term, setAssignments),
    [schoolYear, term],
  );
  useEffect(
    () =>
      subscribeClassSchedulesByPeriod(schoolYear, term, gradeLevel, (entries) => {
        setSavedEntries(entries);
        setCloudScheduleLoadedAt(Date.now());
      }),
    [gradeLevel, schoolYear, term],
  );
  useEffect(
    () =>
      subscribeSavedSchedulesByContext(
        schoolYear,
        term,
        gradeLevel,
        strandFilter,
        setSavedSchedules,
      ),
    [gradeLevel, schoolYear, strandFilter, term],
  );
  useEffect(() => {
    scheduleContextKeyRef.current = scheduleContextKey;
    latestSaveRunRef.current += 1;
    hasAutoRestoredDraftRef.current = "";
    setDraftEntries([]);
    setConflicts([]);
    setSaveMessage("");
    setIsSaving(false);
    setGenerationMessage("");
    setLockMessage("");
    setOptimizationScore(null);
    setCompletionPercent(null);
    setGenerationProgress(null);
    setRecentlyChangedScheduleIds(new Set());
    setPlacementLog([]);
    setFeasibilityResult(null);
    setGenerationEndsAt(null);
    setSelectedTeacherId("");
    setSelectedSavedScheduleId("");
    setScheduleName("");
    setShowResetConfirmation(false);
    setResetConfirmation("");
    setPendingLocalDraft(loadLocalScheduleDraft(draftStorageKey));
  }, [draftStorageKey, gradeLevel, schoolYear, scheduleContextKey, strandFilter, term]);

  useEffect(() => {
    if (!cloudScheduleLoadedAt || !pendingLocalDraft) return;

    const newestCloudScheduleMs = getNewestCloudScheduleMs(savedEntries);
    if (
      pendingLocalDraft.updatedAt > newestCloudScheduleMs &&
      hasAutoRestoredDraftRef.current !== draftStorageKey
    ) {
      restoreLocalDraft(pendingLocalDraft, true);
    }
  }, [cloudScheduleLoadedAt, draftStorageKey, pendingLocalDraft, savedEntries]);

  const remainingGenerationSeconds = useMemo(() => {
    if (!generationEndsAt || !isGenerating) return null;
    return Math.max(0, Math.ceil((generationEndsAt - Date.now()) / 1000));
  }, [countdownTick, generationEndsAt, isGenerating]);

  useEffect(() => {
    if (!isGenerating || !generationEndsAt) return;

    const timer = window.setInterval(() => {
      setCountdownTick((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [generationEndsAt, isGenerating]);

  useEffect(() => {
    if (recentlyChangedScheduleIds.size === 0) return;

    const timer = window.setTimeout(() => {
      setRecentlyChangedScheduleIds(new Set());
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [recentlyChangedScheduleIds]);

  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.subjectId, subject])),
    [subjects],
  );
  const sectionsById = useMemo(
    () => new Map(sections.map((section) => [section.sectionId, section])),
    [sections],
  );
  const teachersById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])),
    [teachers],
  );

  const gradeOptions = useMemo(() => {
    const options = new Set(["all", "11", "12"]);
    sections.forEach((section) => options.add(normalizeGrade(section.gradeLevel)));
    assignments.forEach((assignment) => options.add(normalizeGrade(assignment.gradeLevel)));
    return [...options].filter(Boolean).sort();
  }, [assignments, sections]);

  const joinedAssignments = useMemo<JoinedAssignment[]>(
    () =>
      assignments
        .filter(
          (assignment) =>
            gradeLevel === "all" ||
            normalizeGrade(assignment.gradeLevel) === normalizeGrade(gradeLevel),
        )
        .map((assignment) => {
          const subject = subjectsById.get(assignment.subjectId);
          const section = sectionsById.get(assignment.sectionId);
          const teacher = teachersById.get(assignment.teacherId);
          if (!subject || !section || !teacher) return undefined;
          if (section.schoolYear !== schoolYear) return undefined;
          if (subject.term !== term) return undefined;
          if (strandFilter !== "all" && section.strand !== strandFilter) return undefined;
          return { ...assignment, subject, section, teacher };
        })
        .filter((assignment): assignment is JoinedAssignment => Boolean(assignment)),
    [assignments, gradeLevel, schoolYear, sectionsById, strandFilter, subjectsById, teachersById, term],
  );

  const visibleEntries = draftEntries.length > 0 ? draftEntries : savedEntries;
  const selectedSavedSchedule = useMemo(
    () =>
      savedSchedules.find(
        (savedSchedule) => savedSchedule.savedScheduleId === selectedSavedScheduleId,
      ),
    [savedSchedules, selectedSavedScheduleId],
  );
  const actionableConflicts = useMemo(
    () => conflicts.filter((conflict) => conflict.type !== "score"),
    [conflicts],
  );
  const visibleSections = useMemo(
    () =>
      [...new Map(joinedAssignments.map((assignment) => [assignment.sectionId, assignment.section])).values()]
        .sort((first, second) => first.sectionName.localeCompare(second.sectionName)),
    [joinedAssignments],
  );
  const visibleTeachers = useMemo(
    () => {
      const teacherMap = new Map(
        joinedAssignments.map((assignment) => [assignment.teacherId, assignment.teacher]),
      );

      visibleEntries.forEach((entry) => {
        const teacher = teachersById.get(entry.teacherId);
        if (teacher) teacherMap.set(teacher.teacherId, teacher);
      });

      return [...teacherMap.values()].sort((first, second) =>
        first.fullName.localeCompare(second.fullName),
      );
    },
    [joinedAssignments, teachersById, visibleEntries],
  );
  const teacherPlotSummaries = useMemo(
    () =>
      visibleTeachers.map((teacher) => {
        const teacherAssignments = joinedAssignments.filter((assignment) => assignment.teacherId === teacher.teacherId);
        const requiredSessions = teacherAssignments.reduce((sum, assignment) => sum + sessionsForAssignment(assignment).sessions, 0);
        const plottedEntries = visibleEntries.filter((entry) => entry.teacherId === teacher.teacherId);
        const conflictCount = plottedEntries.reduce(
          (sum, entry) => sum + getOverlapWarnings(entry, visibleEntries, "teacherId").length,
          0,
        );

        return {
          teacher,
          assignmentCount: teacherAssignments.length,
          unplottedCount: Math.max(0, requiredSessions - plottedEntries.length),
          plottedCount: plottedEntries.length,
          conflictCount,
        };
      }),
    [joinedAssignments, visibleEntries, visibleTeachers],
  );
  const selectedTeacher = useMemo(
    () => visibleTeachers.find((teacher) => teacher.teacherId === selectedTeacherId) ?? teacherPlotSummaries[0]?.teacher,
    [selectedTeacherId, teacherPlotSummaries, visibleTeachers],
  );
  const selectedTeacherAssignments = useMemo(
    () =>
      selectedTeacher
        ? joinedAssignments.filter((assignment) => assignment.teacherId === selectedTeacher.teacherId)
        : [],
    [joinedAssignments, selectedTeacher],
  );
  const selectedTeacherEntries = useMemo(
    () =>
      selectedTeacher
        ? visibleEntries.filter((entry) => entry.teacherId === selectedTeacher.teacherId)
        : [],
    [selectedTeacher, visibleEntries],
  );
  const strandOptions = useMemo(
    () =>
      [
        ...new Set(
          sections
            .filter(
              (section) =>
                gradeLevel === "all" ||
                normalizeGrade(section.gradeLevel) === normalizeGrade(gradeLevel),
            )
            .map((section) => section.strand),
        ),
      ].sort(),
    [gradeLevel, sections],
  );

  function feasibilityErrorsToConflicts(errors: string[]): Conflict[] {
    return errors.map((error, index) => ({
      assignmentId: `feasibility-${index}`,
      type: "special",
      subjectName: "Feasibility Error",
      sectionName: "",
      teacherName: "",
      reason: error,
      sessions: 0,
    }));
  }

  function handleCheckFeasibility() {
    const result = runFeasibilityCheck(joinedAssignments, visibleEntries.filter((entry) => entry.locked));
    setFeasibilityResult(result);
    setGenerationMessage(
      result.canGenerate
        ? "Feasibility check passed. You can generate the schedule."
        : "Feasibility check found hard errors. Please review before generating.",
    );
    setConflicts(result.canGenerate ? [] : feasibilityErrorsToConflicts(result.errors));
  }

  function getReadableScheduleConflict(conflict: Conflict): Conflict {
    const assignment = joinedAssignments.find((item) => item.assignmentId === conflict.assignmentId);
    const subject = assignment?.subject ?? subjectsById.get(conflict.subjectName);
    const section = assignment?.section ?? sectionsById.get(conflict.sectionName);
    const teacher = assignment?.teacher ?? teachersById.get(conflict.teacherName);

    return {
      ...conflict,
      subjectName: subject?.subjectName ?? conflict.subjectName,
      sectionName: section?.sectionName ?? conflict.sectionName,
      teacherName: teacher?.fullName ?? conflict.teacherName,
    };
  }

  function getScheduleAuditConflicts(entries: ClassScheduleEntry[]) {
    const assignmentsById = new Map(joinedAssignments.map((assignment) => [assignment.assignmentId, assignment]));
    const staleEntryConflicts = entries
      .filter((entry) => !assignmentsById.has(entry.sourceAssignmentId))
      .map((entry, index): Conflict => ({
        assignmentId: `${entry.sourceAssignmentId || entry.scheduleId}-stale-${index}`,
        type: "conflict",
        subjectName: subjectsById.get(entry.subjectId)?.subjectName ?? entry.subjectId,
        sectionName: sectionsById.get(entry.sectionId)?.sectionName ?? entry.sectionId,
        teacherName: teachersById.get(entry.teacherId)?.fullName ?? entry.teacherId,
        reason: "This schedule entry no longer matches an active load assignment for the selected section schedule.",
        sessions: 1,
      }));
    const validEntries = entries.filter((entry) => assignmentsById.has(entry.sourceAssignmentId));
    const { sessions: remainingSessions, conflicts: specialConflicts } = buildRemainingSessions(
      joinedAssignments,
      validEntries,
    );
    const missingSessionsByAssignmentId = new Map<string, number>();

    remainingSessions.forEach((session) => {
      missingSessionsByAssignmentId.set(
        session.assignment.assignmentId,
        (missingSessionsByAssignmentId.get(session.assignment.assignmentId) ?? 0) + 1,
      );
    });

    const unassignedConflicts = [...missingSessionsByAssignmentId.entries()].flatMap(
      ([assignmentId, missingSessions]) => {
        const assignment = assignmentsById.get(assignmentId);
        if (!assignment) return [];

        return [
          conflictForAssignment(
            assignment,
            "Missing from the section schedule. Drag this item to a compatible open slot or use Auto Plot to place it.",
            missingSessions,
          ),
        ];
      },
    );

    return [
      ...validateScheduleEntries(entries).map(getReadableScheduleConflict),
      ...staleEntryConflicts,
      ...specialConflicts,
      ...unassignedConflicts,
    ];
  }

  function handleRefreshScheduleConflicts() {
    if (isGenerating) return;

    const nextConflicts = getScheduleAuditConflicts(visibleEntries);
    const actionableCount = nextConflicts.filter((conflict) => conflict.type !== "score").length;
    const missingSessionCount = nextConflicts
      .filter((conflict) => conflict.type === "unscheduled" || conflict.type === "special")
      .reduce((sum, conflict) => sum + conflict.sessions, 0);
    const completion = getCompletionStats(
      visibleEntries.filter((entry) =>
        joinedAssignments.some((assignment) => assignment.assignmentId === entry.sourceAssignmentId),
      ),
      missingSessionCount,
      [],
    );

    setConflicts(nextConflicts);
    setGenerationProgress(null);
    setOptimizationScore(null);
    setCompletionPercent(completion.completionPercent);
    setGenerationMessage(
      actionableCount > 0
        ? `Schedule audit refreshed. Found ${actionableCount} item${actionableCount === 1 ? "" : "s"} needing review.`
        : "Schedule audit refreshed. No conflicts or unassigned subjects found.",
    );
    setLockMessage("");
  }

  async function handleGenerate() {
    if (isGenerating) return;

    const lockedEntries = visibleEntries.filter((entry) => entry.locked);
    const feasibility = runFeasibilityCheck(joinedAssignments, lockedEntries);
    setFeasibilityResult(feasibility);

    if (!feasibility.canGenerate) {
      setGenerationMessage("Cannot generate schedule because feasibility check found hard errors.");
      setConflicts(feasibilityErrorsToConflicts(feasibility.errors));
      setIsGenerating(false);
      setGenerationEndsAt(null);
      return;
    }

    setIsGenerating(true);
    stopGenerationRef.current = false;
    setGenerationEndsAt(Date.now() + bestFitSearchMs);
    setCountdownTick(0);
    setGenerationProgress(null);
    setRecentlyChangedScheduleIds(new Set());
    setPlacementLog([]);
    setGenerationMessage(generationMode === "best" ? "Trying best fit combinations..." : "Generating schedule...");
    setSaveMessage("");
    setLockMessage("");
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    try {
      const result =
        generationMode === "best"
          ? await generateScheduleBestFit(
              joinedAssignments,
              lockedEntries,
              bestFitSearchMs,
              bestFitMaxCombinations,
              (progress) => {
                setDraftEntries(progress.entries);
                saveLocalDraft({
                  entries: progress.entries,
                  nextGenerationMessage: "Trying best fit combinations...",
                  nextGenerationProgress: progress,
                  nextCompletionPercent: progress.completionPercent,
                });
                if (progress.changedScheduleIds.length > 0) {
                  setRecentlyChangedScheduleIds(new Set(progress.changedScheduleIds));
                  const changedEntries = progress.entries.filter((entry) =>
                    progress.changedScheduleIds.includes(entry.scheduleId),
                  );
                  setPlacementLog((current) => [...changedEntries, ...current].slice(0, 12));
                }
                setGenerationProgress(progress);
                setCompletionPercent(progress.completionPercent);
                setGenerationMessage("Trying best fit combinations...");
              },
              () => stopGenerationRef.current,
            )
          : generateScheduleFastDraft(joinedAssignments, lockedEntries);

      setDraftEntries(result.entries);
      setRecentlyChangedScheduleIds(new Set(result.entries.map((entry) => entry.scheduleId)));
      setPlacementLog(result.entries.slice(-12).reverse());
      setConflicts(result.conflicts);
      setOptimizationScore(result.score);
      setCompletionPercent(result.completionPercent);
      setGenerationProgress(null);
      const hasUnscheduled = result.conflicts.some((conflict) => conflict.type === "unscheduled" || conflict.type === "special");
      const finalGenerationMessage = result.stopped
        ? "Generation stopped. Best result kept."
        : hasUnscheduled
          ? "Some subjects could not be scheduled. Review conflicts."
          : result.timedOut
            ? "Best partial schedule found"
            : "Schedule generated successfully.";
      setGenerationMessage(finalGenerationMessage);
      void autoSaveSchedule(result.entries, "Saved to cloud", {
        nextConflicts: result.conflicts,
        nextGenerationMessage: finalGenerationMessage,
        nextOptimizationScore: result.score,
        nextCompletionPercent: result.completionPercent,
        nextGenerationProgress: null,
      });
    } finally {
      setIsGenerating(false);
      setGenerationEndsAt(null);
      stopGenerationRef.current = false;
    }
  }

  function handleStopGeneration() {
    stopGenerationRef.current = true;
    setGenerationMessage("Generation stopped. Best result kept.");
  }

  function saveLocalDraft({
    entries = draftEntries,
    nextConflicts = conflicts,
    saveStatus = "Local draft saved",
    nextGenerationMessage = generationMessage,
    nextOptimizationScore = optimizationScore,
    nextCompletionPercent = completionPercent,
    nextGenerationProgress = generationProgress,
  }: {
    entries?: ClassScheduleEntry[];
    nextConflicts?: Conflict[];
    saveStatus?: string;
    nextGenerationMessage?: string;
    nextOptimizationScore?: number | null;
    nextCompletionPercent?: number | null;
    nextGenerationProgress?: GenerationProgress | null;
  }) {
    if (entries.length === 0 && nextConflicts.length === 0) return;

    const draft: LocalScheduleDraft = {
      entries: entries.map(cleanEntryForLocalDraft),
      conflicts: nextConflicts,
      saveMessage: saveStatus,
      generationMessage: nextGenerationMessage,
      optimizationScore: nextOptimizationScore,
      completionPercent: nextCompletionPercent,
      generationProgress: nextGenerationProgress,
      updatedAt: Date.now(),
    };

    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setPendingLocalDraft(draft);
      setSaveMessage(saveStatus);
    } catch (error) {
      console.error(error);
      setSaveMessage("Local draft save failed");
    }
  }

  function restoreLocalDraft(draft: LocalScheduleDraft, recovered: boolean) {
    hasAutoRestoredDraftRef.current = draftStorageKey;
    setDraftEntries(draft.entries);
    setConflicts(draft.conflicts);
    setGenerationMessage(draft.generationMessage);
    setOptimizationScore(draft.optimizationScore);
    setCompletionPercent(draft.completionPercent);
    setGenerationProgress(draft.generationProgress);
    setRecentlyChangedScheduleIds(new Set(draft.entries.map((entry) => entry.scheduleId)));
    setPlacementLog(draft.entries.slice(-12).reverse());
    setPendingLocalDraft(null);
    setSaveMessage(recovered ? "Recovered local draft from previous session" : draft.saveMessage || "Local draft saved");
  }

  function autoSaveSchedule(
    entries: ClassScheduleEntry[],
    successMessage = "Schedule auto-saved. You can continue fixing it later.",
    draftOptions: Omit<Parameters<typeof saveLocalDraft>[0], "entries" | "saveStatus"> = {},
  ) {
    const entriesSnapshot = entries.map((entry) => ({ ...entry }));
    saveLocalDraft({ entries: entriesSnapshot, ...draftOptions });

    if (!canEdit || entries.length === 0) return Promise.resolve();

    const contextKey = scheduleContextKey;
    const saveRun = latestSaveRunRef.current + 1;
    latestSaveRunRef.current = saveRun;
    setIsSaving(true);
    setSaveMessage("Saving to cloud...");

    const saveJob = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await replaceSchedulesByPeriod(schoolYear, term, gradeLevel, strandFilter, entriesSnapshot);

        if (latestSaveRunRef.current === saveRun && scheduleContextKeyRef.current === contextKey) {
          setSavedEntries(entriesSnapshot);
          setDraftEntries([]);
          removeLocalScheduleDraft(draftStorageKey);
          setPendingLocalDraft(null);
          setSaveMessage(successMessage === "Saved to cloud" ? successMessage : "Saved to cloud");
        }
      })
      .catch((error) => {
        console.error(error);
        if (latestSaveRunRef.current === saveRun && scheduleContextKeyRef.current === contextKey) {
          saveLocalDraft({
            entries: entriesSnapshot,
            saveStatus: "Cloud save failed, local draft preserved",
            ...draftOptions,
          });
          setSaveMessage("Cloud save failed, local draft preserved");
        }
      })
      .finally(() => {
        if (latestSaveRunRef.current === saveRun && scheduleContextKeyRef.current === contextKey) {
          setIsSaving(false);
        }
      });

    saveQueueRef.current = saveJob;
    return saveJob;
  }

  async function handleSaveNamedSchedule() {
    const trimmedName = scheduleName.trim();
    if (!canEdit || isGenerating || isSaving) return;
    if (!trimmedName) {
      setSaveMessage("Enter a schedule name before saving.");
      return;
    }
    if (visibleEntries.length === 0) {
      setSaveMessage("Generate or load a schedule before saving a named copy.");
      return;
    }

    setIsSaving(true);
    setSaveMessage("Saving named schedule...");

    try {
      await saveNamedSchedule(
        trimmedName,
        schoolYear,
        term,
        gradeLevel,
        strandFilter,
        visibleEntries.map(cleanEntryForLocalDraft),
        user?.uid,
      );
      setScheduleName("");
      setSaveMessage(`Saved schedule "${trimmedName}".`);
    } catch (error) {
      console.error(error);
      setSaveMessage("Named schedule save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLoadNamedSchedule() {
    if (!canEdit || isGenerating || isSaving || !selectedSavedSchedule) return;

    setIsSaving(true);
    setSaveMessage(`Loading "${selectedSavedSchedule.name}"...`);

    try {
      await replaceSchedulesByPeriod(
        schoolYear,
        term,
        gradeLevel,
        strandFilter,
        selectedSavedSchedule.entries.map(cleanEntryForLocalDraft),
        { includeLocked: true },
      );
      setDraftEntries([]);
      setSavedEntries(selectedSavedSchedule.entries.map(cleanEntryForLocalDraft));
      setConflicts([]);
      setGenerationMessage("");
      setOptimizationScore(null);
      setCompletionPercent(null);
      setGenerationProgress(null);
      setRecentlyChangedScheduleIds(
        new Set(selectedSavedSchedule.entries.map((entry) => entry.scheduleId)),
      );
      setPlacementLog([]);
      removeLocalScheduleDraft(draftStorageKey);
      setPendingLocalDraft(null);
      setSaveMessage(`Loaded schedule "${selectedSavedSchedule.name}".`);
    } catch (error) {
      console.error(error);
      setSaveMessage("Saved schedule load failed.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleClearDraft() {
    setDraftEntries([]);
    setConflicts([]);
    setSaveMessage("");
    setGenerationMessage("");
    setLockMessage("");
    setOptimizationScore(null);
    setCompletionPercent(null);
    setGenerationProgress(null);
    setRecentlyChangedScheduleIds(new Set());
    setPlacementLog([]);
    setGenerationEndsAt(null);
    setPendingLocalDraft(null);
    removeLocalScheduleDraft(draftStorageKey);
  }

  async function handleAbsoluteResetSchedule() {
    if (!canEdit || isGenerating) return;
    if (resetConfirmation !== "RESET SCHEDULE") {
      setSaveMessage("Type RESET SCHEDULE to confirm absolute reset.");
      return;
    }

    setIsSaving(true);
    setSaveMessage("Resetting schedule...");

    try {
      latestSaveRunRef.current += 1;
      await saveQueueRef.current.catch(() => undefined);
      await resetSchedulesByContextSafely(schoolYear, term, gradeLevel, strandFilter);
      setDraftEntries([]);
      setSavedEntries([]);
      setConflicts([]);
      setGenerationMessage("");
      setOptimizationScore(null);
      setCompletionPercent(null);
      setGenerationProgress(null);
      setRecentlyChangedScheduleIds(new Set());
      setPlacementLog([]);
      setGenerationEndsAt(null);
      setPendingLocalDraft(null);
      setShowResetConfirmation(false);
      setResetConfirmation("");
      removeLocalScheduleDraft(draftStorageKey);
      setSaveMessage("Schedule reset successfully.");
    } catch (error) {
      console.error(error);
      setSaveMessage("Schedule reset failed. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleAutoPlotTeachers() {
    if (!canEdit || isGenerating) return;

    const teacherIds =
      autoPlotScope === "all"
        ? teacherPlotSummaries.map((summary) => summary.teacher.teacherId)
        : selectedTeacher
          ? [selectedTeacher.teacherId]
          : [];

    if (teacherIds.length === 0) {
      setLockMessage("Select a teacher before auto plotting.");
      return;
    }

    let nextEntries = preserveExistingSchedule ? [...visibleEntries] : visibleEntries.filter((entry) => entry.locked);
    let nextConflicts: Conflict[] = conflicts.filter((conflict) => conflict.type === "score");
    const changedIds = new Set<string>();
    let totalPlaced = 0;
    let totalMoved = 0;

    teacherIds.forEach((teacherId) => {
      const result = autoPlotTeacherEntries(
        teacherId,
        joinedAssignments,
        nextEntries,
        autoPlotMode === "move",
      );
      nextEntries = result.entries;
      nextConflicts = [...nextConflicts, ...result.conflicts];
      result.placedIds.forEach((id) => changedIds.add(id));
      result.movedIds.forEach((id) => changedIds.add(id));
      totalPlaced += result.placedIds.length;
      totalMoved += result.movedIds.length;
    });

    setDraftEntries(nextEntries);
    setConflicts(nextConflicts);
    setRecentlyChangedScheduleIds(changedIds);
    setPlacementLog(nextEntries.filter((entry) => changedIds.has(entry.scheduleId)).slice(-12).reverse());
    setCompletionPercent(null);
    setOptimizationScore(null);
    setLockMessage(
      `Auto Plot completed. Placed ${totalPlaced} session${totalPlaced === 1 ? "" : "s"}${totalMoved > 0 ? ` and moved ${totalMoved} unlocked session${totalMoved === 1 ? "" : "s"}` : ""}.`,
    );
    void autoSaveSchedule(nextEntries, "Auto Plot schedule change auto-saved. You can continue fixing it later.", {
      nextConflicts,
      nextGenerationMessage:
        nextConflicts.some((conflict) => conflict.type !== "score")
          ? "Some subjects could not be scheduled. Review conflicts."
          : "Schedule generated successfully.",
      nextOptimizationScore: null,
      nextCompletionPercent: null,
      nextGenerationProgress: null,
    });
  }

  function handleToggleLock(entry: ClassScheduleEntry) {
    if (!canEdit) return;

    const nextLocked = !entry.locked;
    const nextEntry = { ...entry, locked: nextLocked };
    const updatedEntries = visibleEntries.map((item) =>
      item.scheduleId === entry.scheduleId ? nextEntry : item,
    );

    if (draftEntries.length > 0) {
      setDraftEntries(updatedEntries);
    } else {
      setSavedEntries(updatedEntries);
    }
    setLockMessage(nextLocked ? "Entry locked. Future generation will keep it fixed." : "Entry unlocked. Future generation can move it.");
    void autoSaveSchedule(
      updatedEntries,
      nextLocked
        ? "Lock auto-saved. Future generation will keep this entry fixed."
        : "Unlock auto-saved. Future generation can move this entry.",
    );
  }

  function handleRemoveEntry(entry: ClassScheduleEntry) {
    if (!canEdit || isGenerating) return;

    const assignment = joinedAssignments.find((item) => item.assignmentId === entry.sourceAssignmentId);
    const updatedEntries = visibleEntries.filter((item) => item.scheduleId !== entry.scheduleId);
    const nextConflicts = assignment
      ? (() => {
          let restoredRemovedConflict = false;
          const updatedConflicts = conflicts.map((conflict) => {
            if (
              restoredRemovedConflict ||
              conflict.assignmentId !== assignment.assignmentId ||
              conflict.type === "score"
            ) {
              return conflict;
            }

            restoredRemovedConflict = true;
            return {
              ...conflict,
              type: "unscheduled" as const,
              reason: "Removed from the schedule. Drag this item to a compatible open slot or use Auto Plot to place it again.",
              sessions: conflict.sessions + 1,
            };
          });

          if (restoredRemovedConflict) return updatedConflicts;

          return [
            ...updatedConflicts,
            conflictForAssignment(
              assignment,
              "Removed from the schedule. Drag this item to a compatible open slot or use Auto Plot to place it again.",
            ),
          ];
        })()
      : conflicts;

    setDraftEntries(updatedEntries);
    setSavedEntries((current) => current.filter((item) => item.scheduleId !== entry.scheduleId));
    setConflicts(nextConflicts);
    setRecentlyChangedScheduleIds(new Set());
    setPlacementLog((current) => current.filter((item) => item.scheduleId !== entry.scheduleId));
    setCompletionPercent(null);
    setOptimizationScore(null);
    setLockMessage("Schedule entry removed. It is now listed as unplaced.");
    void autoSaveSchedule(updatedEntries, "Schedule removal auto-saved. You can continue fixing it later.", {
      nextConflicts,
      nextGenerationMessage: "Some subjects could not be scheduled. Review conflicts.",
      nextOptimizationScore: null,
      nextCompletionPercent: null,
      nextGenerationProgress: null,
    });
  }

  function entryFor(entityField: "sectionId" | "teacherId", entityId: string, day: ScheduleDay, slot: Slot) {
    return visibleEntries.find(
      (entry) =>
        entry[entityField] === entityId &&
        entry.day === day &&
        (entityField === "teacherId"
          ? entry.startTime === slot.startTime && entry.endTime === slot.endTime
          : entry.slotId === slot.slotId),
    );
  }

  function entriesForCell(entityField: "sectionId" | "teacherId", entityId: string, day: ScheduleDay, slot: Slot) {
    return visibleEntries.filter(
      (entry) =>
        entry[entityField] === entityId &&
        entry.day === day &&
        (entityField === "teacherId"
          ? entry.startTime === slot.startTime && entry.endTime === slot.endTime
          : entry.slotId === slot.slotId),
    );
  }

  function moveEntryToSlot(entry: ClassScheduleEntry, day: ScheduleDay, slot: Slot): ClassScheduleEntry {
    return {
      ...entry,
      day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: slot.duration,
      slotId: slot.slotId,
    };
  }

  function canEntryUseSlot(entry: ClassScheduleEntry, slot: Slot) {
    const section = sectionsById.get(entry.sectionId);
    return getSlotsForSection(section, entry.gradeLevel).some(
      (gradeSlot) => gradeSlot.slotId === slot.slotId && gradeSlot.duration === entry.duration,
    );
  }

  function getNextSessionIndex(assignmentId: string) {
    return visibleEntries.filter((entry) => entry.sourceAssignmentId === assignmentId).length + 1;
  }

  function buildManualEntry(assignment: JoinedAssignment, day: ScheduleDay, slot: Slot): ClassScheduleEntry | null {
    const rule = sessionsForAssignment(assignment);
    if (slot.duration !== rule.duration) return null;

    return {
      ...createScheduleEntry(
        {
          sessionId: `${assignment.assignmentId}:manual:${Date.now()}`,
          assignment,
          duration: rule.duration,
          sessionIndex: getNextSessionIndex(assignment.assignmentId),
          totalSessions: rule.sessions,
          priority: rule.priority,
          units: Number(assignment.units || assignment.subject.units || 0),
          preferElectiveSlot:
            normalizeGrade(assignment.gradeLevel) === "11" &&
            (Number(assignment.units || assignment.subject.units || 0) === 8 ||
              Number(assignment.units || assignment.subject.units || 0) === 12.5),
        },
        day,
        slot,
      ),
      locked: true,
    };
  }

  function clearDragState() {
    setDraggedScheduleId(null);
    setDraggedConflictAssignmentId(null);
  }

  function getConflictsAfterPlaced(currentConflicts: Conflict[], assignmentId: string) {
      let removed = false;

      return currentConflicts.flatMap((conflict) => {
        if (removed || conflict.assignmentId !== assignmentId || conflict.type === "score") return [conflict];
        removed = true;

        if (conflict.sessions > 1) return [{ ...conflict, sessions: conflict.sessions - 1 }];
        return [];
      });
  }

  function handleDropOnCell(targetEntry: ClassScheduleEntry | undefined, day: ScheduleDay, slot: Slot) {
    if ((!draggedScheduleId && !draggedConflictAssignmentId) || isGenerating) return;

    if (draggedConflictAssignmentId) {
      const assignment = joinedAssignments.find((item) => item.assignmentId === draggedConflictAssignmentId);
      if (!assignment) {
        clearDragState();
        return;
      }

      if (targetEntry) {
        setLockMessage("Drop conflict items into an empty slot, or move the existing entry first.");
        clearDragState();
        return;
      }

      const manualEntry = buildManualEntry(assignment, day, slot);
      if (!manualEntry || !canEntryUseSlot(manualEntry, slot)) {
        setLockMessage("Manual placement blocked because the target time slot does not match the subject duration or grade template.");
        clearDragState();
        return;
      }

      const manualConflictReason = getHardConflictReason(manualEntry, visibleEntries);
      if (manualConflictReason) {
        setLockMessage(manualConflictReason);
        clearDragState();
        return;
      }

      const updatedEntries = [...visibleEntries, manualEntry];
      const updatedConflicts = getConflictsAfterPlaced(conflicts, assignment.assignmentId);

      setDraftEntries(updatedEntries);
      setRecentlyChangedScheduleIds(new Set([manualEntry.scheduleId]));
      setConflicts(updatedConflicts);
      setLockMessage("");
      void autoSaveSchedule(updatedEntries, "Saved to cloud", { nextConflicts: updatedConflicts });
      clearDragState();
      return;
    }

    const sourceEntry = visibleEntries.find((entry) => entry.scheduleId === draggedScheduleId);
    if (!sourceEntry) return;
    if (sourceEntry.locked || targetEntry?.locked) {
      setLockMessage("Locked schedule entries cannot be moved or swapped.");
      clearDragState();
      return;
    }
    if (targetEntry?.scheduleId === sourceEntry.scheduleId) {
      clearDragState();
      return;
    }

    const sourceSlot = {
      slotId: sourceEntry.slotId,
      startTime: sourceEntry.startTime,
      endTime: sourceEntry.endTime,
      duration: sourceEntry.duration,
      label: `${sourceEntry.startTime}-${sourceEntry.endTime}`,
    };
    const movedSource = moveEntryToSlot(sourceEntry, day, slot);
    const movedTarget = targetEntry ? moveEntryToSlot(targetEntry, sourceEntry.day, sourceSlot) : undefined;
    const otherEntries = visibleEntries.filter(
      (entry) =>
        entry.scheduleId !== sourceEntry.scheduleId &&
        entry.scheduleId !== targetEntry?.scheduleId,
    );

    if (!canEntryUseSlot(sourceEntry, slot) || (targetEntry && !canEntryUseSlot(targetEntry, sourceSlot))) {
      setLockMessage("Move blocked because the target time slot does not match the subject duration or grade template.");
      clearDragState();
      return;
    }

    const moveConflictReason =
      getHardConflictReason(movedSource, [...otherEntries, ...(movedTarget ? [movedTarget] : [])]) ||
      (movedTarget ? getHardConflictReason(movedTarget, [...otherEntries, movedSource]) : "");

    if (moveConflictReason) {
      setLockMessage(moveConflictReason);
      clearDragState();
      return;
    }

    const updatedEntries = visibleEntries.map((entry) => {
      if (entry.scheduleId === sourceEntry.scheduleId) return movedSource;
      if (movedTarget && entry.scheduleId === movedTarget.scheduleId) return movedTarget;
      return entry;
    });

    setDraftEntries(updatedEntries);
    setSavedEntries((current) =>
      current.map((entry) => {
        const updated = updatedEntries.find((item) => item.scheduleId === entry.scheduleId);
        return updated ?? entry;
      }),
    );
    setRecentlyChangedScheduleIds(
      new Set([sourceEntry.scheduleId, ...(movedTarget ? [movedTarget.scheduleId] : [])]),
    );
    setLockMessage("");
    void autoSaveSchedule(updatedEntries, "Manual schedule change auto-saved. You can continue fixing it later.");
    clearDragState();
  }

  function openPrintableSchedule() {
    const title = viewMode === "section" ? "Section Schedule" : "Teacher Schedule";
    const entities = viewMode === "section" ? visibleSections : visibleTeachers;
    const field = viewMode === "section" ? "sectionId" : "teacherId";
    const pages = entities.map((entity) => {
      const entityId = viewMode === "section" ? (entity as Section).sectionId : (entity as Teacher).teacherId;
      const entityName = viewMode === "section" ? (entity as Section).sectionName : (entity as Teacher).fullName;
      const entitySlots =
        viewMode === "section"
          ? getSlotsForSection(entity as Section, (entity as Section).gradeLevel)
          : allDisplaySlots;
      const rows = entitySlots
        .map((slot) => {
          const cells = days
            .map((day) => {
              const entry = entryFor(field, entityId, day, slot);
              const subject = entry ? subjectsById.get(entry.subjectId) : undefined;
              const section = entry ? sectionsById.get(entry.sectionId) : undefined;
              const teacher = entry ? teachersById.get(entry.teacherId) : undefined;
              return `<td>${entry ? `<strong>${escapeHtml(subject?.subjectName ?? entry.subjectId)}</strong><br />${escapeHtml(viewMode === "section" ? teacher?.fullName : section?.sectionName)}<br />${escapeHtml(entry.room ? `Room ${entry.room}` : "")}` : ""}</td>`;
            })
            .join("");
          return `<tr><th>${escapeHtml(slot.label)}</th>${cells}</tr>`;
        })
        .join("");

      return `<section class="page"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(entityName)} - ${escapeHtml(schoolYear)} - ${escapeHtml(term)}</p><table><thead><tr><th>Time</th>${days.map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:11px}.page{page-break-after:always}.page:last-child{page-break-after:auto}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #cbd5e1;padding:6px;vertical-align:top}th{background:#e2e8f0;text-align:left}.no-print{margin:12px;padding:8px 12px}@media print{.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button>${pages}<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script></body></html>`);
    printWindow.document.close();
  }

  function openPrintableSubjectLoads() {
    const title = "Subject Teachers and Sections";
    const subjectGroups = [...joinedAssignments]
      .sort(
        (first, second) =>
          first.subject.subjectName.localeCompare(second.subject.subjectName) ||
          first.section.sectionName.localeCompare(second.section.sectionName) ||
          first.teacher.fullName.localeCompare(second.teacher.fullName),
      )
      .reduce((groups, assignment) => {
        const group = groups.get(assignment.subjectId) ?? {
          subject: assignment.subject,
          assignments: [] as JoinedAssignment[],
        };
        group.assignments.push(assignment);
        groups.set(assignment.subjectId, group);
        return groups;
      }, new Map<string, { subject: Subject; assignments: JoinedAssignment[] }>());

    const pages = [...subjectGroups.values()]
      .map(({ subject, assignments }) => {
        const rows = assignments
          .map((assignment) => {
            const scheduledSessions = visibleEntries
              .filter((entry) => entry.sourceAssignmentId === assignment.assignmentId)
              .sort(
                (first, second) =>
                  days.indexOf(first.day) - days.indexOf(second.day) ||
                  timeToMinutes(first.startTime) - timeToMinutes(second.startTime),
              );
            const requiredSessions = sessionsForAssignment(assignment).sessions;
            const meetingTimes =
              scheduledSessions.length === 0
                ? "Not yet scheduled"
                : scheduledSessions
                    .map(
                      (entry) =>
                        `${entry.day}, ${entry.startTime}-${entry.endTime}${entry.room ? `, Room ${entry.room}` : ""}`,
                    )
                    .join("<br />");

            return `<tr><td>${escapeHtml(assignment.teacher.fullName)}</td><td>${escapeHtml(assignment.section.sectionName)}</td><td>${escapeHtml(assignment.gradeLevel)}</td><td>${escapeHtml(assignment.strand)}</td><td>${scheduledSessions.length}/${requiredSessions}</td><td>${meetingTimes}</td></tr>`;
          })
          .join("");

        return `<section class="subject"><h2>${escapeHtml(subject.subjectName)}</h2><p>${escapeHtml(subject.subjectCode)} - Grade ${escapeHtml(subject.gradeLevel)} - ${escapeHtml(subject.strand)} - ${escapeHtml(subject.term)}</p><table><thead><tr><th>Teacher</th><th>Section</th><th>Grade</th><th>Strand</th><th>Sessions</th><th>Schedule</th></tr></thead><tbody>${rows}</tbody></table></section>`;
      })
      .join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:11px}h1{margin:0 0 4px;font-size:20px}h2{margin:0 0 3px;font-size:15px}.meta{margin:0 0 14px;color:#475569}.subject{break-inside:avoid;margin-bottom:18px}.subject p{margin:0 0 8px;color:#475569}table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #cbd5e1;padding:6px;vertical-align:top}th{background:#e2e8f0;text-align:left}.no-print{margin:12px;padding:8px 12px}@media print{.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button><h1>${escapeHtml(title)}</h1><p class="meta">${escapeHtml(schoolYear)} - ${escapeHtml(term)} - ${escapeHtml(gradeLevel === "all" ? "All Grades" : `Grade ${gradeLevel}`)} - ${escapeHtml(strandFilter === "all" ? "All Strands" : strandFilter)}</p>${pages || "<p>No subject assignments found for this filter.</p>"}<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script></body></html>`);
    printWindow.document.close();
  }

  function renderScheduleTable(entity: Section | Teacher, entityField: "sectionId" | "teacherId") {
    const entityId = entityField === "sectionId" ? (entity as Section).sectionId : (entity as Teacher).teacherId;
    const entityTitle = entityField === "sectionId" ? (entity as Section).sectionName : (entity as Teacher).fullName;
    const entitySlots =
      entityField === "sectionId"
        ? getSlotsForSection(entity as Section, (entity as Section).gradeLevel)
        : allDisplaySlots;
    const entityBreaks = entityField === "sectionId" ? getBreaks((entity as Section).gradeLevel) : [];

    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" key={entityId}>
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-950">
            {entityTitle}
            {entityField === "sectionId" && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                {getTemplateLabel(entity as Section)}
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {entityField === "sectionId"
              ? `Grade ${(entity as Section).gradeLevel} - ${(entity as Section).strand}${(entity as Section).room ? ` - Room ${(entity as Section).room}` : ""}`
              : (entity as Teacher).specialization}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed text-left text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="w-28 px-3 py-3 font-semibold">Time</th>
                {days.map((day) => (
                  <th className="px-3 py-3 font-semibold" key={day}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {entitySlots.flatMap((slot) => {
                const slotRow = (
                  <tr key={slot.slotId}>
                    <td className="px-3 py-3 align-top font-semibold text-slate-950">{slot.label}</td>
                    {days.map((day) => {
                      const cellEntries = entriesForCell(entityField, entityId, day, slot);
                      const exactEntry = cellEntries.find((entry) => entry.slotId === slot.slotId);
                      const dropTargetEntry = exactEntry ?? cellEntries[0];

                      return (
                        <td
                          className={[
                            "h-24 px-3 py-3 align-top",
                            canEdit && !isGenerating ? "transition-colors hover:bg-blue-50/50" : "",
                          ].join(" ")}
                          key={`${slot.slotId}-${day}`}
                          onDragOver={(event) => {
                            if (canEdit && !isGenerating) event.preventDefault();
                          }}
                          onDrop={() => handleDropOnCell(dropTargetEntry, day, slot)}
                        >
                          {cellEntries.length > 0 ? (
                            <div className="space-y-2">
                              {cellEntries.map((entry) => {
                                const subject = subjectsById.get(entry.subjectId);
                                const section = sectionsById.get(entry.sectionId);
                                const teacher = teachersById.get(entry.teacherId);
                                const isRecentlyChanged = recentlyChangedScheduleIds.has(entry.scheduleId);
                                const overlapWarnings = getOverlapWarnings(entry, visibleEntries, entityField);

                                return (
                                  <div
                                    className={[
                                      "rounded-md border p-2 transition-all",
                                      overlapWarnings.length > 0
                                        ? "border-red-300 bg-red-50"
                                        : entry.locked
                                          ? "border-amber-200 bg-amber-50"
                                          : "border-blue-100 bg-blue-50",
                                      canEdit && !entry.locked && !isGenerating ? "cursor-grab active:cursor-grabbing" : "",
                                      draggedScheduleId === entry.scheduleId ? "opacity-50" : "",
                                      isRecentlyChanged ? "animate-pulse ring-2 ring-blue-400 ring-offset-1" : "",
                                    ].join(" ")}
                                    draggable={canEdit && !entry.locked && !isGenerating}
                                    key={entry.scheduleId}
                                    onDragEnd={clearDragState}
                                    onDragStart={(event) => {
                                      setDraggedScheduleId(entry.scheduleId);
                                      setDraggedConflictAssignmentId(null);
                                      event.dataTransfer.effectAllowed = "move";
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="font-semibold text-slate-950">{subject?.subjectName ?? entry.subjectId}</p>
                                      {canEdit && (
                                        <div className="flex shrink-0 gap-1">
                                          <button
                                            aria-label={entry.locked ? "Unlock schedule entry" : "Lock schedule entry"}
                                            className={entry.locked ? "inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-white text-amber-700 hover:bg-amber-100" : "inline-flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 hover:bg-blue-100"}
                                            onClick={() => void handleToggleLock(entry)}
                                            title={entry.locked ? "Unlock entry" : "Lock entry"}
                                            type="button"
                                          >
                                            {entry.locked ? <Lock size={14} /> : <Unlock size={14} />}
                                          </button>
                                          <button
                                            aria-label="Remove schedule entry"
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                            disabled={isGenerating}
                                            onClick={() => handleRemoveEntry(entry)}
                                            title="Remove from schedule"
                                            type="button"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <p className="mt-1 text-slate-600">
                                      {entityField === "sectionId" ? teacher?.fullName : section?.sectionName}
                                    </p>
                                    <p className="mt-1 text-slate-500">{entry.startTime}-{entry.endTime}</p>
                                    {entry.room && <p className="mt-1 text-slate-500">Room {entry.room}</p>}
                                    {entry.locked && <p className="mt-1 text-[11px] font-semibold uppercase text-amber-700">Locked</p>}
                                    {overlapWarnings.map((warning) => (
                                      <p className="mt-1 text-[11px] font-semibold text-red-700" key={warning}>{warning}</p>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
                const breakAfter = entityBreaks.find((item) => item.startTime === slot.endTime);
                if (!breakAfter) return [slotRow];
                return [
                  slotRow,
                  <tr className="bg-slate-50 text-center text-slate-500" key={`${slot.slotId}-break`}>
                    <td className="px-3 py-2 font-semibold">{breakAfter.startTime}-{breakAfter.endTime}</td>
                    <td className="px-3 py-2 font-medium" colSpan={5}>{breakAfter.label}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <section>
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              onChange={(event) => setGenerationMode(event.target.value as GenerationMode)}
              value={generationMode}
            >
              <option value="fast">Fast Draft</option>
              <option value="best">Best Fit</option>
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400"
              disabled={isGenerating}
              onClick={() => void handleGenerate()}
              type="button"
            >
              {isGenerating ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <CalendarDays size={16} />
              )}
              {isGenerating ? "Generating..." : visibleEntries.length > 0 ? "Regenerate Schedule" : "Generate Schedule"}
            </button>
            {isGenerating && generationMode === "best" && (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                onClick={handleStopGeneration}
                type="button"
              >
                Stop and Keep Best Result
              </button>
            )}
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isGenerating}
              onClick={handleCheckFeasibility}
              type="button"
            >
              Check Feasibility
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isGenerating}
              onClick={handleRefreshScheduleConflicts}
              type="button"
            >
              <RefreshCw size={16} /> Refresh Conflicts
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100" disabled={isGenerating} onClick={handleClearDraft} type="button">
              <RotateCcw size={16} /> Clear Draft
            </button>
            {canEdit && (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isGenerating || isSaving}
                onClick={() => {
                  setShowResetConfirmation(true);
                  setResetConfirmation("");
                }}
                type="button"
              >
                Absolute Reset Schedule
              </button>
            )}
            {pendingLocalDraft && (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={isGenerating}
                onClick={() => restoreLocalDraft(pendingLocalDraft, false)}
                type="button"
              >
                Restore Local Draft
              </button>
            )}
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={openPrintableSchedule} type="button">
              <Printer size={16} /> Print
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={openPrintableSubjectLoads} type="button">
              <Printer size={16} /> Print Subjects
            </button>
          </div>
        }
        description="Generate, review, and save conflict-free class schedules from existing load assignments."
        title="Scheduler"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <SummaryCard detail={gradeLevel === "all" ? "All grades selected" : `Grade ${gradeLevel} selected`} label="Sections" value={visibleSections.length} />
        <SummaryCard detail={draftEntries.length > 0 ? "draft generated" : "saved schedule"} label="Scheduled Sessions" value={visibleEntries.length} />
        <SummaryCard detail="needs review" label="Conflicts" value={actionableConflicts.length} />
        <SummaryCard detail={optimizationScore === null ? "generate to calculate" : `score ${optimizationScore.toLocaleString()}`} label="Done" value={completionPercent === null ? "-" : `${completionPercent}%`} />
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold uppercase text-slate-500">
            School Year
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900" onChange={(event) => setSchoolYear(event.target.value)} value={schoolYear} />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Term
            <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900" onChange={(event) => setTerm(event.target.value as AcademicTerm)} value={term}>
              {termOptions.map((termOption) => <option key={termOption} value={termOption}>{termOption}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Grade Level
            <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900" onChange={(event) => setGradeLevel(event.target.value)} value={gradeLevel}>
              {gradeOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All Grades" : `Grade ${option}`}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Strand
            <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900" onChange={(event) => setStrandFilter(event.target.value)} value={strandFilter}>
              <option value="all">All strands</option>
              {strandOptions.map((strand) => <option key={strand} value={strand}>{strand}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            View
            <div className="mt-1 grid h-10 grid-cols-2 overflow-hidden rounded-md border border-slate-300">
              <button className={viewMode === "section" ? "bg-blue-600 text-white" : "bg-white text-slate-700"} onClick={() => setViewMode("section")} type="button">By Section</button>
              <button className={viewMode === "teacher" ? "bg-blue-600 text-white" : "bg-white text-slate-700"} onClick={() => setViewMode("teacher")} type="button">By Teacher</button>
            </div>
          </label>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)_auto]">
          <label className="text-xs font-semibold uppercase text-slate-500">
            Schedule Name
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              disabled={!canEdit || isGenerating || isSaving}
              onChange={(event) => setScheduleName(event.target.value)}
              placeholder="e.g. First draft"
              value={scheduleName}
            />
          </label>
          <button
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!canEdit || isGenerating || isSaving || visibleEntries.length === 0}
            onClick={() => void handleSaveNamedSchedule()}
            type="button"
          >
            Save Schedule
          </button>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Saved Schedules
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              disabled={savedSchedules.length === 0 || isGenerating || isSaving}
              onChange={(event) => setSelectedSavedScheduleId(event.target.value)}
              value={selectedSavedScheduleId}
            >
              <option value="">Choose saved schedule</option>
              {savedSchedules.map((savedSchedule) => (
                <option key={savedSchedule.savedScheduleId} value={savedSchedule.savedScheduleId}>
                  {savedSchedule.name} ({savedSchedule.entryCount} sessions)
                </option>
              ))}
            </select>
          </label>
          <button
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            disabled={!canEdit || isGenerating || isSaving || !selectedSavedSchedule}
            onClick={() => void handleLoadNamedSchedule()}
            type="button"
          >
            Load Selected
          </button>
        </div>
        {(generationMessage || saveMessage || lockMessage) && (
          <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
            {isGenerating && (
              <div className="mb-2">
                <p className="mb-2 inline-flex items-center gap-2 font-semibold text-blue-700">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                  {generationMode === "best" ? "Trying best fit combinations..." : "Generating schedule..."} {generationProgress ? `${generationProgress.completionPercent}% done.` : "Preparing search."}
                  <span className="rounded-md bg-blue-100 px-2 py-0.5 text-blue-800">
                    {formatCountdown(remainingGenerationSeconds)} left
                  </span>
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${generationProgress?.completionPercent ?? 0}%` }}
                  />
                </div>
                {generationProgress && (
                  <p className="mt-1 text-xs text-slate-500">
                    {generationProgress.scheduledSessions}/{generationProgress.requiredSessions} sessions placed. {generationProgress.combinationsTried.toLocaleString()} combinations tried.
                  </p>
                )}
                {placementLog.length > 0 && (
                  <div className="mt-3 rounded-md border border-blue-100 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-blue-700">Placement Process</p>
                      <p className="text-xs font-semibold text-slate-500">Latest {placementLog.length}</p>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {placementLog.map((entry, index) => {
                        const subject = subjectsById.get(entry.subjectId);
                        const section = sectionsById.get(entry.sectionId);
                        const teacher = teachersById.get(entry.teacherId);

                        return (
                          <div
                            className={index === 0 ? "rounded-md border border-blue-200 bg-blue-50 p-2 animate-pulse" : "rounded-md border border-slate-200 bg-slate-50 p-2"}
                            key={`${entry.scheduleId}-${index}`}
                          >
                            <p className="text-sm font-semibold text-slate-950">
                              {subject?.subjectName ?? entry.subjectId}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {teacher?.fullName ?? entry.teacherId} - {section?.sectionName ?? entry.sectionId}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-blue-700">
                              {entry.day}, {entry.startTime}-{entry.endTime}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {generationMessage && <p>{generationMessage}</p>}
            {saveMessage && <p>{saveMessage}</p>}
            {lockMessage && <p>{lockMessage}</p>}
          </div>
        )}
        {showResetConfirmation && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-900">Confirm Absolute Reset Schedule</p>
                <p className="mt-1 text-xs text-red-700">
                  This deletes schedule entries only for the selected school year, term, grade, and strand context. Type RESET SCHEDULE below to continue.
                </p>
                <input
                  autoFocus
                  className="mt-3 h-10 w-full max-w-sm rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-950 placeholder:text-red-300"
                  disabled={isGenerating || isSaving}
                  onChange={(event) => setResetConfirmation(event.target.value)}
                  placeholder="Type RESET SCHEDULE"
                  value={resetConfirmation}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={isSaving}
                  onClick={() => {
                    setShowResetConfirmation(false);
                    setResetConfirmation("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                  disabled={isGenerating || isSaving || resetConfirmation !== "RESET SCHEDULE"}
                  onClick={() => void handleAbsoluteResetSchedule()}
                  type="button"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-2">
          {isGenerating && draftEntries.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 shadow-sm">
              Live draft is updating as the scheduler finds better placements.
            </div>
          )}
          {visibleEntries.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
              Generate a schedule for {gradeLevel === "all" ? "all grades" : `Grade ${gradeLevel}`} to populate the timetable.
            </div>
          ) : viewMode === "section" ? (
            visibleSections.map((section) => renderScheduleTable(section, "sectionId"))
          ) : (
            visibleTeachers.map((teacher) => renderScheduleTable(teacher, "teacherId"))
          )}
        </div>

        <aside className="max-h-[72vh] space-y-5 overflow-y-auto pr-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">Teacher Auto Plot</h2>
              <StatusBadge label={selectedTeacher ? "Ready" : "No teacher"} tone={selectedTeacher ? "blue" : "amber"} />
            </div>
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase text-slate-500">
                Teacher
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-900"
                  onChange={(event) => setSelectedTeacherId(event.target.value)}
                  value={selectedTeacher?.teacherId ?? ""}
                >
                  {teacherPlotSummaries.map((summary) => (
                    <option key={summary.teacher.teacherId} value={summary.teacher.teacherId}>
                      {summary.teacher.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {teacherPlotSummaries.map((summary) => (
                  <button
                    className={[
                      "w-full rounded-md border p-2 text-left text-xs transition-colors",
                      selectedTeacher?.teacherId === summary.teacher.teacherId
                        ? "border-blue-300 bg-blue-50"
                        : summary.conflictCount > 0
                          ? "border-red-200 bg-red-50"
                          : "border-slate-200 bg-slate-50 hover:bg-blue-50",
                    ].join(" ")}
                    key={summary.teacher.teacherId}
                    onClick={() => setSelectedTeacherId(summary.teacher.teacherId)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-950">{summary.teacher.fullName}</p>
                      <StatusBadge label={summary.conflictCount > 0 ? "Conflict" : "OK"} tone={summary.conflictCount > 0 ? "red" : "green"} />
                    </div>
                    <p className="mt-1 text-slate-600">
                      {summary.unplottedCount} unplotted / {summary.plottedCount} plotted / {summary.assignmentCount} loads
                    </p>
                  </button>
                ))}
              </div>
              {selectedTeacher && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Selected Loads</p>
                  <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                    {selectedTeacherAssignments.map((assignment) => {
                      const rule = sessionsForAssignment(assignment);
                      const plottedCount = visibleEntries.filter((entry) => entry.sourceAssignmentId === assignment.assignmentId).length;
                      const warnings = selectedTeacherEntries
                        .filter((entry) => entry.sourceAssignmentId === assignment.assignmentId)
                        .flatMap((entry) => getOverlapWarnings(entry, visibleEntries, "teacherId"));

                      return (
                        <div className="rounded-md border border-white bg-white p-2 text-xs" key={assignment.assignmentId}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-950">{assignment.subject.subjectName}</p>
                            <StatusBadge
                              label={plottedCount >= rule.sessions ? "Plotted" : "Unplotted"}
                              tone={plottedCount >= rule.sessions ? "green" : "amber"}
                            />
                          </div>
                          <p className="mt-1 text-slate-600">{assignment.section.sectionName} - {plottedCount}/{rule.sessions} sessions</p>
                          {warnings.map((warning) => (
                            <p className="mt-1 font-semibold text-red-700" key={warning}>{warning}</p>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Auto Plot Mode
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-900"
                    onChange={(event) => setAutoPlotMode(event.target.value as AutoPlotMode)}
                    value={autoPlotMode}
                  >
                    <option value="empty">Fill Empty Slots Only</option>
                    <option value="move">Allow Moving Unlocked Entries</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Scope
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-900"
                    onChange={(event) => setAutoPlotScope(event.target.value as AutoPlotScope)}
                    value={autoPlotScope}
                  >
                    <option value="selected">Selected Teacher Only</option>
                    <option value="all">All Teachers, One by One</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    checked={preserveExistingSchedule}
                    className="h-4 w-4 rounded border-slate-300"
                    onChange={(event) => setPreserveExistingSchedule(event.target.checked)}
                    type="checkbox"
                  />
                  Preserve existing schedule
                </label>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canEdit || isGenerating || !selectedTeacher}
                  onClick={handleAutoPlotTeachers}
                  type="button"
                >
                  Auto Plot Selected Teacher
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">Feasibility Check</h2>
              {feasibilityResult && (
                <StatusBadge
                  label={feasibilityResult.canGenerate ? "Can Generate" : "Cannot Generate"}
                  tone={feasibilityResult.canGenerate ? "green" : "red"}
                />
              )}
            </div>
            {!feasibilityResult ? (
              <p className="text-sm text-slate-600">Run feasibility check before generating.</p>
            ) : (
              <div className="space-y-3">
                {feasibilityResult.errors.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-red-700">Errors</p>
                    <div className="space-y-2">
                      {feasibilityResult.errors.map((error, index) => (
                        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800" key={index}>
                          {error}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {feasibilityResult.warnings.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-amber-700">Warnings</p>
                    <div className="space-y-2">
                      {feasibilityResult.warnings.map((warning, index) => (
                        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800" key={index}>
                          {warning}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {feasibilityResult.errors.length === 0 && feasibilityResult.warnings.length === 0 && (
                  <p className="rounded-md border border-green-200 bg-green-50 p-2 text-xs font-medium text-green-800">
                    No feasibility issues found.
                  </p>
                )}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Sections</p>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {feasibilityResult.sectionSummaries.map((summary) => (
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2" key={summary.sectionId}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-950">{summary.sectionName}</p>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            {summary.template}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          Required {summary.requiredHours}h / Available {summary.availableHours}h / Open {summary.remainingHours}h
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">Conflict Panel</h2>
              <StatusBadge label={`${actionableConflicts.length} open`} tone={actionableConflicts.length ? "amber" : "green"} />
            </div>
            {optimizationScore !== null && (
              <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase text-blue-700">Optimization Score</p>
                <p className="mt-1 text-xl font-bold text-blue-900">{optimizationScore.toLocaleString()}</p>
              </div>
            )}
            {conflicts.length === 0 ? (
              <p className="text-sm text-slate-600">No draft conflicts. Special blocks and placement failures will appear here after generation.</p>
            ) : (
              <div className="space-y-3">
                {conflicts.map((conflict, index) => (
                  <div
                    className={[
                      "rounded-md border p-3 transition-all",
                      conflict.type === "score"
                        ? "border-blue-200 bg-blue-50"
                        : conflict.type === "special"
                          ? "border-amber-200 bg-amber-50"
                          : "border-red-200 bg-red-50",
                      canEdit && conflict.type !== "score" && !isGenerating ? "cursor-grab active:cursor-grabbing" : "",
                      draggedConflictAssignmentId === conflict.assignmentId ? "opacity-50" : "",
                    ].join(" ")}
                    draggable={canEdit && conflict.type !== "score" && !isGenerating}
                    key={`${conflict.assignmentId}-${index}`}
                    onDragEnd={clearDragState}
                    onDragStart={(event) => {
                      if (conflict.type === "score") return;
                      setDraggedConflictAssignmentId(conflict.assignmentId);
                      setDraggedScheduleId(null);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    title={canEdit && conflict.type !== "score" ? "Drag to an empty schedule slot" : undefined}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge
                          label={
                            conflict.type === "score"
                              ? "Optimization Score"
                              : conflict.type === "special"
                                ? "Special Block Needed"
                                : conflict.type === "conflict"
                                  ? "Conflict"
                                  : "Unscheduled"
                          }
                          tone={conflict.type === "score" ? "blue" : conflict.type === "special" ? "amber" : "red"}
                        />
                        {conflict.sessions > 1 && conflict.type !== "score" && (
                          <StatusBadge label={`${conflict.sessions} sessions`} tone="amber" />
                        )}
                      </div>
                      {canEdit && conflict.type !== "score" && !isGenerating && (
                        <GripVertical aria-hidden="true" className="shrink-0 text-slate-500" size={16} />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-950">{conflict.subjectName}</p>
                    {(conflict.sectionName || conflict.teacherName) && (
                      <p className="mt-1 text-xs text-slate-600">{conflict.sectionName} - {conflict.teacherName}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-700">{conflict.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
