import { Check, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Lock, Pencil, Plus, Printer, RefreshCw, Save, Trash2, Unlock, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import { subscribeAncillaryLoads } from "../services/ancillaryLoadService";
import { subscribeLoadAssignmentsByPeriod, syncLoadAssignmentsForPeriod } from "../services/assignmentService";
import { subscribeCurriculumMappings } from "../services/curriculumService";
import {
  replaceSchedulesByPeriod,
  resetSchedulesByContextSafely,
  subscribeClassSchedulesByPeriod,
} from "../services/scheduleService";
import {
  defaultSchedulePrintSettings,
  subscribeSchedulePrintSettings,
} from "../services/settingsService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import { subscribeTeachers } from "../services/teacherService";
import bagongPilipinasLogoUrl from "../assets/print/bagong-pilipinas-logo.png";
import depedLogoUrl from "../assets/print/deped-logo.png";
import mshsLogoUrl from "../assets/print/mshs-logo.png";
import type {
  AcademicTerm,
  AncillaryLoad,
  ClassScheduleEntry,
  CurriculumMapping,
  LoadAssignment,
  SchedulePrintSettings,
  ScheduleTemplateKey,
  ScheduleTimeSlot,
  ScheduleDay,
  Section,
  Subject,
  Teacher,
} from "../types/loading";
import { defaultSchoolYear, defaultTerm, termOptions } from "../types/loading";
import { getLoadHours } from "../utils/loadHours";

type ViewMode = "section" | "teacher";
type GenerationMode = "fast" | "best";
type AutoPlotMode = "empty" | "move";
type AutoPlotScope = "selected" | "all";
type DraggedCustomLoad =
  | { type: "existing"; scheduleId: string }
  | { type: "activity" };
type Slot = ScheduleTimeSlot;
type BreakRow = { label: string; startTime: string; endTime: string };
type CustomScheduleForm = {
  sectionId: string;
  teacherId: string;
  title: string;
  hours: string;
  room: string;
};
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
const days: ScheduleDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const bestFitSearchMs = 60000;
const bestFitMaxCombinations = 500000;
const bestFitProgressEvery = 250;
const noSectionLabel = "No section";
const noSectionFormValue = "__no_section__";
const unlimitedActivityTitle = "Remediation, ARAL, Turorial and Extra curricular Activities";

const fourSessionDayPattern: ScheduleDay[][] = [
  ["Monday", "Tuesday", "Wednesday", "Thursday"],
  ["Monday", "Tuesday", "Wednesday", "Friday"],
  ["Monday", "Tuesday", "Thursday", "Friday"],
  ["Monday", "Wednesday", "Thursday", "Friday"],
  ["Monday", "Tuesday", "Wednesday", "Thursday"],
];

let activeScheduleTimeSlots = defaultSchedulePrintSettings.scheduleTimeSlots;
let activeScheduleBreaks = defaultSchedulePrintSettings.scheduleBreaks;

function setActiveScheduleTimeSlots(settings: SchedulePrintSettings) {
  activeScheduleTimeSlots = settings.scheduleTimeSlots;
  activeScheduleBreaks = settings.scheduleBreaks;
}

function getTemplateSlots(templateKey: ScheduleTemplateKey) {
  return activeScheduleTimeSlots[templateKey]?.length
    ? activeScheduleTimeSlots[templateKey]
    : defaultSchedulePrintSettings.scheduleTimeSlots[templateKey];
}

function getAllDisplaySlots() {
  return [
    ...getTemplateSlots("grade11Academic"),
    ...getTemplateSlots("grade11TechPro"),
    ...getTemplateSlots("grade12"),
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
}

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
  if (templateType === "grade12") return getTemplateSlots("grade12");
  if (templateType === "grade11_techpro") return getTemplateSlots("grade11TechPro");
  return getTemplateSlots("grade11Academic");
}

function getSlots(gradeLevel: string) {
  return normalizeGrade(gradeLevel) === "12" ? getTemplateSlots("grade12") : getTemplateSlots("grade11Academic");
}

function getSlotsForEntryTemplate(entry: ClassScheduleEntry) {
  if (entry.templateType === "grade12") return getTemplateSlots("grade12");
  if (entry.templateType === "grade11_techpro") return getTemplateSlots("grade11TechPro");
  if (entry.templateType === "grade11_academic") return getTemplateSlots("grade11Academic");
  return getSlots(entry.gradeLevel);
}

function getBreaksForSection(section?: Section, gradeLevel?: string) {
  const templateType = getTemplateType(section, gradeLevel);
  const templateKey =
    templateType === "grade12"
      ? "grade12"
      : templateType === "grade11_techpro"
        ? "grade11TechPro"
        : "grade11Academic";
  return activeScheduleBreaks[templateKey] ?? defaultSchedulePrintSettings.scheduleBreaks[templateKey];
}

function timeToMinutes(value: string) {
  const [rawHour, rawMinute = "0"] = value.split(":");
  let hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (hour < 7) hour += 12;
  return hour * 60 + minute;
}

function minutesToTime(value: number) {
  const hour24 = Math.floor(value / 60);
  const minute = value % 60;
  const hour = hour24 > 12 ? hour24 - 12 : hour24;

  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function getEndTimeForDuration(startTime: string, duration: number) {
  return minutesToTime(timeToMinutes(startTime) + duration * 60);
}

function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

function entriesOverlap(first: ClassScheduleEntry, second: ClassScheduleEntry) {
  if (first.day !== second.day) return false;

  return timeRangesOverlap(first.startTime, first.endTime, second.startTime, second.endTime);
}

function isCustomScheduleEntry(entry: ClassScheduleEntry) {
  return entry.custom === true || entry.sourceAssignmentId.startsWith("custom:");
}

function getEntryTitle(entry: ClassScheduleEntry, subjectsById: Map<string, Subject>) {
  return isCustomScheduleEntry(entry)
    ? entry.customTitle || entry.subjectId || "Special Task"
    : subjectsById.get(entry.subjectId)?.subjectName ?? entry.subjectId;
}

function getCustomEntryLabel(entry: ClassScheduleEntry) {
  return entry.customDetails || "Special Task";
}

function getEntrySectionLabel(entry: Pick<ClassScheduleEntry, "sectionId">, sectionsById: Map<string, Section>) {
  return entry.sectionId ? sectionsById.get(entry.sectionId)?.sectionName ?? entry.sectionId : noSectionLabel;
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
  const units = getJoinedAssignmentUnits(assignment);
  const hoursPerSession = getJoinedAssignmentHoursPerSession(assignment);
  const templateType = getTemplateType(assignment.section, assignment.gradeLevel);

  if (hoursPerSession > 0) {
    const sessions = units > 0 ? Math.ceil(units / hoursPerSession) : 0;
    const slots = getSlotsForSection(assignment.section, grade);
    const hasCompatibleSlot = slots.some((slot) => canSlotFitDuration(slot, hoursPerSession));

    return {
      sessions,
      duration: hoursPerSession,
      priority: Math.max(1, 7 - sessions),
      special: !hasCompatibleSlot,
    };
  }

  if (grade === "11" && units === 5) return { sessions: 5, duration: 1, priority: 4, special: false };
  if (grade === "11" && units === 7.5) return { sessions: 5, duration: 1.5, priority: 3, special: false };
  if (grade === "11" && templateType === "grade11_techpro" && units === 10) {
    return { sessions: 5, duration: 2, priority: 2, special: false };
  }
  if (grade === "12" && units === 6) return { sessions: 4, duration: 1.5, priority: 3, special: false };
  if (grade === "12" && units === 12) return { sessions: 8, duration: 1.5, priority: 1, special: false };

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

function canSlotFitDuration(slot: Slot, duration: number) {
  return slot.duration >= duration;
}

function isFixedTechProAssignment(assignment: JoinedAssignment) {
  const units = getJoinedAssignmentUnits(assignment);
  return (
    units === 12.5 &&
    getTemplateType(assignment.section, assignment.gradeLevel) === "grade11_techpro"
  );
}

function getJoinedAssignmentUnits(assignment: JoinedAssignment) {
  return getLoadHours(assignment.subject) || getLoadHours(assignment);
}

function getJoinedAssignmentHoursPerSession(assignment: JoinedAssignment) {
  return Number(assignment.subject.hoursPerSession ?? assignment.hoursPerSession ?? 0);
}

function prefersGrade11AfternoonSlot(assignment: JoinedAssignment) {
  const units = getJoinedAssignmentUnits(assignment);
  return normalizeGrade(assignment.gradeLevel) === "11" && (units === 7.5 || units === 10);
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
    endTime: getEndTimeForDuration(slot.startTime, session.duration),
    duration: session.duration,
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
    endTime: getEndTimeForDuration(slot.startTime, entry.duration),
    slotId: slot.slotId,
  };
}

function moveEntryToManualSlot(entry: ClassScheduleEntry, day: ScheduleDay, slot: Slot): ClassScheduleEntry {
  return {
    ...entry,
    day,
    startTime: slot.startTime,
    endTime: getEndTimeForDuration(slot.startTime, entry.duration),
    slotId: slot.slotId,
  };
}

function hasTeacherConflict(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  if (!entry.teacherId) return false;

  return currentSchedule.some(
    (item) =>
      Boolean(item.teacherId) &&
      item.teacherId === entry.teacherId &&
      entriesOverlap(item, entry),
  );
}

function hasSectionConflict(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  if (!entry.sectionId) return false;

  return currentSchedule.some(
    (item) =>
      Boolean(item.sectionId) &&
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

function hasHardConflict(
  entry: ClassScheduleEntry,
  currentSchedule: ClassScheduleEntry[],
) {
  return (
    currentSchedule.some((item) => item.scheduleId === entry.scheduleId) ||
    hasTeacherConflict(entry, currentSchedule) ||
    hasSectionConflict(entry, currentSchedule) ||
    hasRoomConflict(entry, currentSchedule)
  );
}

function getHardConflictReason(
  entry: ClassScheduleEntry,
  currentSchedule: ClassScheduleEntry[],
  options: { allowSectionOverlap?: boolean } = {},
) {
  const duplicate = currentSchedule.find((item) => item.scheduleId === entry.scheduleId);
  if (duplicate) return "Cannot place here. Duplicate schedule entry.";

  const teacherConflict = entry.teacherId
    ? currentSchedule.find(
        (item) => item.teacherId && item.teacherId === entry.teacherId && entriesOverlap(item, entry),
      )
    : undefined;
  if (teacherConflict) {
    return `Cannot place here. Teacher has an overlapping class (${teacherConflict.startTime}-${teacherConflict.endTime}).`;
  }

  if (!options.allowSectionOverlap) {
    const sectionConflict = entry.sectionId
      ? currentSchedule.find(
          (item) => item.sectionId && item.sectionId === entry.sectionId && entriesOverlap(item, entry),
        )
      : undefined;
    if (sectionConflict) return "Cannot place here. Section already has a class.";
  }

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
      if (entityField === "teacherId" && entry.teacherId && item.teacherId === entry.teacherId) {
        return [`Teacher time conflict: overlaps with ${item.startTime}-${item.endTime}`];
      }
      if (entityField === "sectionId" && entry.sectionId && item.sectionId === entry.sectionId) {
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
      if (entry.teacherId && other.teacherId && entry.teacherId === other.teacherId) {
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
      if (entry.sectionId && other.sectionId && entry.sectionId === other.sectionId) {
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
    const units = getJoinedAssignmentUnits(assignment);
    const lockedCount = lockedCounts.get(assignment.assignmentId) ?? 0;

    if (rule.special) {
      if (lockedCount < rule.sessions) {
        conflicts.push({
          assignmentId: assignment.assignmentId,
          type: "special",
          subjectName: assignment.subject.subjectName,
          sectionName: assignment.section.sectionName,
          teacherName: assignment.teacher.fullName,
          reason: "No compatible time slot exists for this subject's required duration. Check the section template or subject hours.",
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
        preferElectiveSlot: prefersGrade11AfternoonSlot(assignment),
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
    const units = getJoinedAssignmentUnits(assignment);
    const existingCount = existingCounts.get(assignment.assignmentId) ?? 0;

    if (rule.special) {
      if (existingCount < rule.sessions) {
        conflicts.push({
          assignmentId: assignment.assignmentId,
          type: "special",
          subjectName: assignment.subject.subjectName,
          sectionName: assignment.section.sectionName,
          teacherName: assignment.teacher.fullName,
          reason: "No compatible time slot exists for this subject's required duration. Check the section template or subject hours.",
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
        preferElectiveSlot: prefersGrade11AfternoonSlot(assignment),
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
    .filter((slot) => canSlotFitDuration(slot, session.duration))
    .sort((first, second) => {
      if (!session.preferElectiveSlot) return 0;
      return Number(second.slotId.includes("1400")) - Number(first.slotId.includes("1400"));
    });
  const sameSubjectTeacherSectionDays = new Set(
    currentSchedule
      .filter(
        (entry) =>
          entry.sectionId === session.assignment.sectionId &&
          entry.subjectId === session.assignment.subjectId &&
          entry.teacherId === session.assignment.teacherId,
      )
      .map((entry) => entry.day),
  );
  return slotCandidates
    .flatMap((slot) => {
      const preferredDays = preferredDaysForSlot(session, slot, slots);
      const candidateDays = [
        ...preferredDays.filter((day) => !sameSubjectTeacherSectionDays.has(day)),
        ...days.filter((day) => !preferredDays.includes(day) && !sameSubjectTeacherSectionDays.has(day)),
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

function getAllCandidateSlots(session: RequiredSession) {
  return getSlotsForSection(session.assignment.section, session.assignment.gradeLevel)
    .filter((slot) => canSlotFitDuration(slot, session.duration))
    .flatMap((slot) => days.map((day) => ({ day, slot })));
}

function getPlacementBlockers(entry: ClassScheduleEntry, currentSchedule: ClassScheduleEntry[]) {
  return currentSchedule.filter(
    (item) =>
      item.scheduleId === entry.scheduleId ||
      ((item.teacherId === entry.teacherId ||
        item.sectionId === entry.sectionId ||
        Boolean(entry.room && item.room === entry.room)) &&
        entriesOverlap(item, entry)),
  );
}

function explainUnscheduledSession(session: RequiredSession, currentSchedule: ClassScheduleEntry[]) {
  const candidates = getAllCandidateSlots(session);
  if (candidates.length === 0) {
    return "No compatible slot exists for this subject duration in the section template.";
  }

  const counts = {
    teacher: 0,
    section: 0,
    room: 0,
    locked: 0,
  };

  candidates.forEach((candidate) => {
    const entry = createScheduleEntry(session, candidate.day, candidate.slot);
    const blockers = currentSchedule.filter((item) => entriesOverlap(item, entry));

    blockers.forEach((blocker) => {
      if (blocker.locked) counts.locked += 1;
      if (blocker.teacherId === entry.teacherId) counts.teacher += 1;
      if (blocker.sectionId === entry.sectionId) counts.section += 1;
      if (entry.room && blocker.room === entry.room) counts.room += 1;
    });
  });

  const orderedReasons = [
    { label: "teacher conflict", count: counts.teacher },
    { label: "section conflict", count: counts.section },
    { label: "room conflict", count: counts.room },
    { label: "locked entries", count: counts.locked },
  ].sort((first, second) => second.count - first.count);
  const primary = orderedReasons[0];

  if (!primary || primary.count === 0) {
    return "No valid conflict-free slot was available after checking teacher, section, and room rules.";
  }

  return `No valid slot was available. Mostly blocked by ${primary.label}.`;
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

type LocalDraftStatusOptions = {
  entries?: ClassScheduleEntry[];
  nextConflicts?: Conflict[];
  saveStatus?: string;
  nextGenerationMessage?: string;
  nextOptimizationScore?: number | null;
  nextCompletionPercent?: number | null;
  nextGenerationProgress?: GenerationProgress | null;
};

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
  const slots = getAllDisplaySlots();
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
  let score = scheduledEntries.length * 1000000;
  const subjectDayCounts = new Map<string, Set<ScheduleDay>>();
  const subjectTotalCounts = new Map<string, number>();

  scheduledEntries.forEach((entry) => {
    const key = `${entry.sectionId}:${entry.subjectId}`;
    const daysUsed = subjectDayCounts.get(key) ?? new Set<ScheduleDay>();
    daysUsed.add(entry.day);
    subjectDayCounts.set(key, daysUsed);
    subjectTotalCounts.set(key, (subjectTotalCounts.get(key) ?? 0) + 1);

    if (!entry.slotId.includes("1400")) score += 200;
    if (normalizeGrade(entry.gradeLevel) === "11" && entry.duration === 2 && entry.slotId.includes("1400")) {
      score += 500;
    }
    const assignment = requiredByAssignmentId.get(entry.sourceAssignmentId);
    const units = assignment ? getJoinedAssignmentUnits(assignment) : 0;
    if (
      units === 12.5 &&
      getTemplateType(assignment?.section, entry.gradeLevel) === "grade11_techpro"
    ) {
      score += entry.slotId === "g11-techpro-1400-1630" && entry.duration === 2.5 ? 2000 : -5000;
    }
  });

  subjectTotalCounts.forEach((count, key) => {
    const uniqueDays = subjectDayCounts.get(key)?.size ?? 0;
    score += uniqueDays * 150;
    score -= Math.max(0, count - uniqueDays) * 700;
  });

  if (scheduledEntries.some((entry) => normalizeGrade(entry.gradeLevel) === "11")) {
    const sectionIds = new Set(scheduledEntries.map((entry) => entry.sectionId));
    sectionIds.forEach((sectionId) => {
      const electiveCount = scheduledEntries.filter(
        (entry) => entry.sectionId === sectionId && entry.slotId.includes("1400"),
      ).length;
      if (days.length - electiveCount === 1) score += 100;
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
    score -= (Math.max(...usedCounts) - Math.min(...usedCounts)) * 150;
  });

  sectionDaySlotIndexes.forEach((indexes) => {
    const sorted = [...new Set(indexes)].sort((first, second) => first - second);
    for (let index = 1; index < sorted.length; index += 1) {
      score -= Math.max(0, sorted[index] - sorted[index - 1] - 1) * 75;
    }
  });

  if (unscheduledCount > 0) {
    score -= unscheduledCount * 1000000;
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

  score -= specialConflicts.reduce((sum, conflict) => sum + conflict.sessions * 1000000, 0);

  return score;
}

function getSessionDifficultyScore(
  session: RequiredSession,
  remainingSessions: RequiredSession[],
  currentSchedule: ClassScheduleEntry[],
) {
  const candidates = getCandidateSlots(session, currentSchedule);
  const allCandidates = getAllCandidateSlots(session);
  const teacherDemand = remainingSessions.filter(
    (item) => item.assignment.teacherId === session.assignment.teacherId,
  ).length;
  const sectionDemand = remainingSessions.filter(
    (item) => item.assignment.sectionId === session.assignment.sectionId,
  ).length;
  const roomDemand = session.assignment.section.room
    ? remainingSessions.filter((item) => item.assignment.section.room === session.assignment.section.room).length
    : 0;
  const teacherOpenSlots = allCandidates.filter((candidate) => {
    const entry = createScheduleEntry(session, candidate.day, candidate.slot);
    return !currentSchedule.some(
      (item) => item.teacherId === entry.teacherId && entriesOverlap(item, entry),
    );
  }).length;
  const sectionOpenSlots = allCandidates.filter((candidate) => {
    const entry = createScheduleEntry(session, candidate.day, candidate.slot);
    return !currentSchedule.some(
      (item) => item.sectionId === entry.sectionId && entriesOverlap(item, entry),
    );
  }).length;
  const roomOpenSlots = session.assignment.section.room
    ? allCandidates.filter((candidate) => {
        const entry = createScheduleEntry(session, candidate.day, candidate.slot);
        return !currentSchedule.some((item) => item.room === entry.room && entriesOverlap(item, entry));
      }).length
    : allCandidates.length;
  const lockedBlockers = allCandidates.reduce((sum, candidate) => {
    const entry = createScheduleEntry(session, candidate.day, candidate.slot);
    return sum + getPlacementBlockers(entry, currentSchedule).filter((blocker) => blocker.locked).length;
  }, 0);
  const techProWeight = isFixedTechProAssignment(session.assignment) ? 1000 : 0;

  return (
    (100 - candidates.length) * 10000 +
    Math.max(0, teacherDemand - teacherOpenSlots) * 1000 +
    Math.max(0, sectionDemand - sectionOpenSlots) * 900 +
    Math.max(0, roomDemand - roomOpenSlots) * 700 +
    lockedBlockers * 250 +
    techProWeight +
    (10 - session.priority) * 20
  );
}

function sortSessionsByDifficulty(sessions: RequiredSession[], currentSchedule: ClassScheduleEntry[]) {
  return [...sessions].sort((first, second) => {
    const firstScore = getSessionDifficultyScore(first, sessions, currentSchedule);
    const secondScore = getSessionDifficultyScore(second, sessions, currentSchedule);

    if (firstScore !== secondScore) return secondScore - firstScore;
    if (first.priority !== second.priority) return first.priority - second.priority;
    return first.assignment.section.sectionName.localeCompare(second.assignment.section.sectionName);
  });
}

type RepairOption = {
  entries: ClassScheduleEntry[];
  placedEntry: ClassScheduleEntry;
  movedScheduleIds: string[];
};

function findExistingEntryMoveOptions(
  entry: ClassScheduleEntry,
  currentSchedule: ClassScheduleEntry[],
  requiredSessions: RequiredSession[],
  specialConflicts: Conflict[],
  depth: number,
  visitedScheduleIds: Set<string>,
): RepairOption[] {
  if (entry.locked || visitedScheduleIds.has(entry.scheduleId)) return [];

  const slots = getSlotsForEntryTemplate(entry).filter(
    (slot) => canSlotFitDuration(slot, entry.duration),
  );
  const baseVisited = new Set(visitedScheduleIds);
  baseVisited.add(entry.scheduleId);

  return slots
    .flatMap((slot) => days.map((day) => moveEntryToSlot(entry, day, slot)))
    .filter(
      (moved) =>
        moved.day !== entry.day ||
        moved.slotId !== entry.slotId ||
        moved.startTime !== entry.startTime ||
        moved.endTime !== entry.endTime,
    )
    .flatMap((moved) => {
      const blockers = getPlacementBlockers(moved, currentSchedule).filter(
        (blocker) => blocker.scheduleId !== entry.scheduleId,
      );
      if (blockers.some((blocker) => blocker.locked)) return [];
      if (blockers.length === 0) {
        return [{ entries: [...currentSchedule, moved], placedEntry: moved, movedScheduleIds: [moved.scheduleId] }];
      }
      if (depth <= 0) return [];

      const scheduleWithoutBlockers = currentSchedule.filter(
        (item) =>
          item.scheduleId !== entry.scheduleId &&
          !blockers.some((blocker) => blocker.scheduleId === item.scheduleId),
      );
      const relocatedStates = relocateBlockers(
        blockers,
        scheduleWithoutBlockers,
        requiredSessions,
        specialConflicts,
        depth - 1,
        baseVisited,
      );

      return relocatedStates.map((state) => ({
        entries: [...state.entries, moved],
        placedEntry: moved,
        movedScheduleIds: [moved.scheduleId, ...state.movedScheduleIds],
      }));
    })
    .filter((option) => !getHardConflictReason(option.placedEntry, option.entries.filter((item) => item.scheduleId !== option.placedEntry.scheduleId)))
    .sort(
      (first, second) =>
        first.movedScheduleIds.length - second.movedScheduleIds.length ||
        scoreSchedule(second.entries, requiredSessions, specialConflicts) -
          scoreSchedule(first.entries, requiredSessions, specialConflicts),
    )
    .slice(0, 6);
}

function relocateBlockers(
  blockers: ClassScheduleEntry[],
  baseEntries: ClassScheduleEntry[],
  requiredSessions: RequiredSession[],
  specialConflicts: Conflict[],
  depth: number,
  visitedScheduleIds: Set<string>,
) {
  type RelocationState = { entries: ClassScheduleEntry[]; movedScheduleIds: string[] };
  let states: RelocationState[] = [{ entries: baseEntries, movedScheduleIds: [] }];

  blockers.forEach((blocker) => {
    const nextStates: RelocationState[] = [];

    states.forEach((state) => {
      const moveOptions = findExistingEntryMoveOptions(
        blocker,
        state.entries,
        requiredSessions,
        specialConflicts,
        depth,
        visitedScheduleIds,
      );

      moveOptions.forEach((option) => {
        nextStates.push({
          entries: option.entries,
          movedScheduleIds: [...state.movedScheduleIds, ...option.movedScheduleIds],
        });
      });
    });

    states = nextStates
      .sort(
        (first, second) =>
          first.movedScheduleIds.length - second.movedScheduleIds.length ||
          scoreSchedule(second.entries, requiredSessions, specialConflicts) -
            scoreSchedule(first.entries, requiredSessions, specialConflicts),
      )
      .slice(0, 6);
  });

  return states;
}

function findRepairOptionsForSession(
  session: RequiredSession,
  currentSchedule: ClassScheduleEntry[],
  requiredSessions: RequiredSession[],
  specialConflicts: Conflict[],
  maxDepth = 2,
): RepairOption[] {
  return getAllCandidateSlots(session)
    .flatMap((candidate) => {
      const entry = createScheduleEntry(session, candidate.day, candidate.slot);

      const directConflictReason = getHardConflictReason(entry, currentSchedule);
      if (!directConflictReason) {
        return [{ entries: [...currentSchedule, entry], placedEntry: entry, movedScheduleIds: [] }];
      }

      const blockers = getPlacementBlockers(entry, currentSchedule);
      if (blockers.length === 0 || blockers.some((blocker) => blocker.locked) || maxDepth <= 0) return [];

      const scheduleWithoutBlockers = currentSchedule.filter(
        (item) => !blockers.some((blocker) => blocker.scheduleId === item.scheduleId),
      );
      const relocatedStates = relocateBlockers(
        blockers,
        scheduleWithoutBlockers,
        requiredSessions,
        specialConflicts,
        maxDepth - 1,
        new Set(),
      );

      return relocatedStates
        .map((state) => ({
          entries: [...state.entries, entry],
          placedEntry: entry,
          movedScheduleIds: state.movedScheduleIds,
        }))
        .filter(
          (option) =>
            !getHardConflictReason(
              option.placedEntry,
              option.entries.filter((item) => item.scheduleId !== option.placedEntry.scheduleId),
            ),
        );
    })
    .sort(
      (first, second) =>
        first.movedScheduleIds.length - second.movedScheduleIds.length ||
        scoreSchedule(second.entries, requiredSessions, specialConflicts) -
          scoreSchedule(first.entries, requiredSessions, specialConflicts),
    )
    .slice(0, 6);
}

function repairUnscheduledSessions(
  initialEntries: ClassScheduleEntry[],
  remainingSessions: RequiredSession[],
  requiredSessions: RequiredSession[],
  specialConflicts: Conflict[],
) {
  let entries = [...initialEntries];
  let remaining = [...remainingSessions];
  const repairedScheduleIds = new Set<string>();
  const movedScheduleIds = new Set<string>();

  sortSessionsByDifficulty(remaining, entries).forEach((session) => {
    if (!remaining.some((item) => item.sessionId === session.sessionId)) return;

    const repair = findRepairOptionsForSession(
      session,
      entries,
      requiredSessions,
      specialConflicts,
      2,
    )[0];

    if (!repair) return;

    entries = repair.entries;
    repairedScheduleIds.add(repair.placedEntry.scheduleId);
    repair.movedScheduleIds.forEach((scheduleId) => movedScheduleIds.add(scheduleId));
    remaining = remaining.filter((item) => item.sessionId !== session.sessionId);
  });

  return { entries, remainingSessions: remaining, repairedScheduleIds, movedScheduleIds };
}

function generateScheduleFastDraft(
  assignments: JoinedAssignment[],
  lockedEntries: ClassScheduleEntry[] = [],
): GenerationResult {
  const entries: ClassScheduleEntry[] = [...lockedEntries];
  const { sessions: requiredSessions, conflicts } = buildRequiredSessions(assignments, lockedEntries);
  const remainingSessions: RequiredSession[] = [];

  sortSessionsByDifficulty(requiredSessions, entries).forEach((session) => {
    const candidates = getCandidateSlots(session, entries);
    const candidate = candidates[0];

    if (candidate) {
      entries.push(createScheduleEntry(session, candidate.day, candidate.slot));
      return;
    }

    remainingSessions.push(session);
  });

  const repaired = repairUnscheduledSessions(entries, remainingSessions, requiredSessions, conflicts);
  const unresolvedConflicts = repaired.remainingSessions.map((session) =>
    conflictForSession(session, explainUnscheduledSession(session, repaired.entries)),
  );
  const validatedEntries = dedupeScheduleEntries(repaired.entries);
  const validationConflicts = validateScheduleEntries(validatedEntries);

  return {
    entries: validatedEntries,
    conflicts: [...conflicts, ...unresolvedConflicts, ...validationConflicts],
    score: scoreSchedule(validatedEntries, requiredSessions, conflicts.filter((conflict) => conflict.type === "special")),
    ...getCompletionStats(
      validatedEntries,
      unresolvedConflicts.length,
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
    (slot) => canSlotFitDuration(slot, entry.duration),
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
        .filter((slot) => canSlotFitDuration(slot, session.duration));
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
      (sum, assignment) => sum + getJoinedAssignmentUnits(assignment),
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
      const hasCompatibleSlot = slots.some((slot) => canSlotFitDuration(slot, rule.duration));

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
      (sum, assignment) => sum + getJoinedAssignmentUnits(assignment),
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
        `Grade 11 Tech Pro 12.5-hour subjects share the fixed 2:00-4:30 slot for the same ${group.label} (${group.getName(matches[0])}): ${matches.map((assignment) => `${assignment.subject.subjectName} - ${assignment.section.sectionName}`).join(", ")}.`,
      );
    });
  });

  lockedEntries.forEach((entry) => {
    const assignment = assignments.find((item) => item.assignmentId === entry.sourceAssignmentId);
    if (!assignment) return;

    const allowedSlots = getSlotsForSection(assignment.section, assignment.gradeLevel);
    const fitsAllowedSlot = allowedSlots.some(
      (slot) =>
        slot.slotId === entry.slotId &&
        slot.startTime === entry.startTime &&
        canSlotFitDuration(slot, entry.duration),
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
      if (entry.sectionId && other.sectionId && entry.sectionId === other.sectionId) {
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
      remaining.length < bestRemaining.length ||
      (remaining.length === bestRemaining.length && score > bestScore)
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

  const repaired = repairUnscheduledSessions(bestEntries, bestRemaining, requiredSessions, specialConflicts);
  bestEntries = repaired.entries;
  bestRemaining = repaired.remainingSessions;
  bestScore = scoreSchedule(bestEntries, requiredSessions, specialConflicts);

  const unscheduledConflicts = bestRemaining.map((session) =>
    conflictForSession(session, explainUnscheduledSession(session, bestEntries)),
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
    entries: validatedEntries,
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
  const { profile } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";
  const scopedTeacherId = profile?.role === "teacher" ? profile.assignedTeacherId : "";
  const scopedAdvisingSectionId = profile?.role === "teacher" ? profile.advisingSectionId : "";
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [term, setTerm] = useState<AcademicTerm>(defaultTerm);
  const [gradeLevel, setGradeLevel] = useState("all");
  const [strandFilter, setStrandFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("section");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fast");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [curriculumMappings, setCurriculumMappings] = useState<CurriculumMapping[]>([]);
  const [ancillaryLoads, setAncillaryLoads] = useState<AncillaryLoad[]>([]);
  const [savedEntries, setSavedEntries] = useState<ClassScheduleEntry[]>([]);
  const [schedulePrintSettings, setSchedulePrintSettings] = useState<SchedulePrintSettings>(
    defaultSchedulePrintSettings,
  );
  const [draftEntries, setDraftEntries] = useState<ClassScheduleEntry[]>([]);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
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
  const [isUpdatingData, setIsUpdatingData] = useState(false);
  const [generationEndsAt, setGenerationEndsAt] = useState<number | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [draggedConflictAssignmentId, setDraggedConflictAssignmentId] = useState<string | null>(null);
  const [draggedCustomLoad, setDraggedCustomLoad] = useState<DraggedCustomLoad | null>(null);
  const [editingRoomScheduleId, setEditingRoomScheduleId] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState("");
  const [lockMessage, setLockMessage] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [autoPlotMode, setAutoPlotMode] = useState<AutoPlotMode>("empty");
  const [autoPlotScope, setAutoPlotScope] = useState<AutoPlotScope>("selected");
  const [preserveExistingSchedule, setPreserveExistingSchedule] = useState(true);
  const [showCustomTaskPanel, setShowCustomTaskPanel] = useState(false);
  const [customForm, setCustomForm] = useState<CustomScheduleForm>({
    sectionId: "",
    teacherId: "",
    title: "Homeroom Guidance",
    hours: "1",
    room: "",
  });
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSaveRunRef = useRef(0);
  const autoSaveTimerRef = useRef<number | null>(null);
  const draftRevisionRef = useRef(0);
  const stopGenerationRef = useRef(false);
  const scheduleContextKey = `${schoolYear}|${term}|${gradeLevel}|${strandFilter}`;
  const draftStorageKey = getDraftStorageKey(schoolYear, term, gradeLevel, strandFilter);
  const scheduleContextKeyRef = useRef(scheduleContextKey);

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeCurriculumMappings(setCurriculumMappings), []);
  useEffect(() => subscribeAncillaryLoads(setAncillaryLoads), []);
  useEffect(
    () =>
      subscribeSchedulePrintSettings((settings) => {
        setSchedulePrintSettings(settings);
        setActiveScheduleTimeSlots(settings);
      }),
    [],
  );
  useEffect(
    () => subscribeLoadAssignmentsByPeriod(schoolYear, term, setAssignments),
    [schoolYear, term],
  );
  useEffect(
    () =>
      subscribeClassSchedulesByPeriod(schoolYear, term, gradeLevel, (entries) => {
        setSavedEntries(entries);
      }),
    [gradeLevel, schoolYear, term],
  );
  useEffect(() => {
    scheduleContextKeyRef.current = scheduleContextKey;
    latestSaveRunRef.current += 1;
    draftRevisionRef.current += 1;
    setDraftEntries([]);
    setHasDraftChanges(false);
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
    setEditingRoomScheduleId(null);
    setRoomDraft("");
    setSelectedTeacherId("");
    setShowResetConfirmation(false);
    setResetConfirmation("");
    removeLocalScheduleDraft(draftStorageKey);
  }, [draftStorageKey, gradeLevel, schoolYear, scheduleContextKey, strandFilter, term]);

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
  const activeTeachers = useMemo(
    () =>
      teachers
        .filter((teacher) => teacher.status === "active")
        .sort((first, second) => first.fullName.localeCompare(second.fullName)),
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

  const visibleEntries = hasDraftChanges ? draftEntries : savedEntries;
  const unlockedScheduleCount = useMemo(
    () => visibleEntries.filter((entry) => !entry.locked).length,
    [visibleEntries],
  );
  const actionableConflicts = useMemo(
    () => conflicts.filter((conflict) => conflict.type !== "score"),
    [conflicts],
  );
  const visibleSections = useMemo(
    () =>
      [...new Map(joinedAssignments.map((assignment) => [assignment.sectionId, assignment.section])).values()]
        .filter((section) => !scopedAdvisingSectionId || section.sectionId === scopedAdvisingSectionId)
        .sort((first, second) => first.sectionName.localeCompare(second.sectionName)),
    [joinedAssignments, scopedAdvisingSectionId],
  );

  useEffect(() => {
    if (visibleSections.length === 0) return;

    setCustomForm((current) => {
      if (current.sectionId === noSectionFormValue) return current;
      const section = visibleSections.some((item) => item.sectionId === current.sectionId)
        ? sectionsById.get(current.sectionId) ?? visibleSections[0]
        : visibleSections[0];
      if (!section) return current;

      return {
        ...current,
        sectionId: section.sectionId,
        room: current.room || section.room || "",
      };
    });
  }, [sectionsById, visibleSections]);
  useEffect(() => {
    if (activeTeachers.length === 0) return;

    setCustomForm((current) => ({
      ...current,
      teacherId: activeTeachers.some((teacher) => teacher.teacherId === current.teacherId)
        ? current.teacherId
        : activeTeachers[0].teacherId,
    }));
  }, [activeTeachers]);

  const selectedSection = useMemo(
    () => visibleSections.find((section) => section.sectionId === selectedSectionId) ?? visibleSections[0],
    [selectedSectionId, visibleSections],
  );
  const customFormSection = useMemo(
    () => (customForm.sectionId && customForm.sectionId !== noSectionFormValue ? sectionsById.get(customForm.sectionId) : undefined),
    [customForm.sectionId, sectionsById],
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

      return [...teacherMap.values()]
        .filter((teacher) => !scopedTeacherId || teacher.teacherId === scopedTeacherId)
        .sort((first, second) =>
          first.fullName.localeCompare(second.fullName),
        );
    },
    [joinedAssignments, scopedTeacherId, teachersById, visibleEntries],
  );
  const customLoadEntries = useMemo(
    () =>
      visibleEntries
        .filter(isCustomScheduleEntry)
        .sort((first, second) => {
          const firstSection = getEntrySectionLabel(first, sectionsById);
          const secondSection = getEntrySectionLabel(second, sectionsById);
          return firstSection.localeCompare(secondSection) || getEntryTitle(first, subjectsById).localeCompare(getEntryTitle(second, subjectsById));
        }),
    [sectionsById, subjectsById, visibleEntries],
  );

  useEffect(() => {
    if (visibleSections.length === 0) {
      if (selectedSectionId) setSelectedSectionId("");
      return;
    }

    if (!visibleSections.some((section) => section.sectionId === selectedSectionId)) {
      setSelectedSectionId(visibleSections[0].sectionId);
    }
  }, [selectedSectionId, visibleSections]);

  useEffect(() => {
    if (visibleTeachers.length === 0) {
      if (selectedTeacherId) setSelectedTeacherId("");
      return;
    }

    if (!visibleTeachers.some((teacher) => teacher.teacherId === selectedTeacherId)) {
      setSelectedTeacherId(visibleTeachers[0].teacherId);
    }
  }, [selectedTeacherId, visibleTeachers]);
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
  const selectedTeacherCustomLoads = useMemo(
    () =>
      selectedTeacher
        ? customLoadEntries.filter((entry) => entry.teacherId === selectedTeacher.teacherId)
        : [],
    [customLoadEntries, selectedTeacher],
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

  async function handleUpdateScheduleData() {
    if (isGenerating || isUpdatingData) return;

    setIsUpdatingData(true);
    setSaveMessage("Updating scheduler data...");
    setGenerationMessage("");
    setLockMessage("");

    try {
      setActiveScheduleTimeSlots(schedulePrintSettings);
      const periodMappings = curriculumMappings.filter(
        (mapping) => mapping.schoolYear === schoolYear && mapping.term === term,
      );
      let syncMessage = "Live scheduler data refreshed.";

      if (canEdit) {
        const result = await syncLoadAssignmentsForPeriod({
          assignments,
          mappings: curriculumMappings,
          schoolYear,
          sections,
          subjects,
          term,
        });
        const details = [
          `${result.updated} load assignment${result.updated === 1 ? "" : "s"} updated`,
          `${result.removed} removed`,
          result.skipped > 0 ? `${result.skipped} skipped` : "",
        ].filter(Boolean);
        syncMessage = `Load assignments synced: ${details.join(", ")}.`;
      }

      setFeasibilityResult(null);
      setSaveMessage("Scheduler data updated.");
      setLockMessage(
        `${syncMessage} Current records: ${subjects.length} subjects, ${sections.length} sections, ${teachers.length} teachers, ${assignments.length} load assignments, ${periodMappings.length} curriculum mappings.`,
      );
    } catch (error) {
      console.error(error);
      setSaveMessage("Scheduler data update failed. Check your connection and try again.");
    } finally {
      setIsUpdatingData(false);
    }
  }

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
        ? "Feasibility check passed. No hard scheduling conflicts found."
        : "Feasibility check found hard errors. Please review them before plotting.",
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
      .filter((entry) => !isCustomScheduleEntry(entry) && !assignmentsById.has(entry.sourceAssignmentId))
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
                setHasDraftChanges(true);
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
      setHasDraftChanges(true);
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
      updateDraftSchedule(result.entries, {
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
    saveStatus = "Auto-save queued.",
  }: LocalDraftStatusOptions) {
    if (entries.length > 0) {
      setSaveMessage(saveStatus);
    }
  }

  function updateDraftSchedule(
    entries: ClassScheduleEntry[],
    draftOptions: Omit<LocalDraftStatusOptions, "entries" | "saveStatus"> = {},
  ) {
    const entriesSnapshot = entries.map((entry) => ({ ...entry }));
    draftRevisionRef.current += 1;
    setDraftEntries(entriesSnapshot);
    setHasDraftChanges(true);
    saveLocalDraft({
      entries: entriesSnapshot,
      saveStatus: "Auto-save queued.",
      ...draftOptions,
    });
  }

  async function handleSaveCurrentSchedule(
    entriesToSave = visibleEntries,
    saveStatus = "Current schedule saved.",
    draftRevision = draftRevisionRef.current,
  ) {
    if (!canEdit || isGenerating || isSaving) return;

    const entriesSnapshot = entriesToSave.map(cleanEntryForLocalDraft);
    if (entriesSnapshot.length === 0) {
      setSaveMessage("Load or plot a schedule before saving.");
      return;
    }

    const contextKey = scheduleContextKey;
    const saveRun = latestSaveRunRef.current + 1;
    latestSaveRunRef.current = saveRun;
    setIsSaving(true);
    setSaveMessage("Saving current schedule...");

    const saveJob = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await replaceSchedulesByPeriod(schoolYear, term, gradeLevel, strandFilter, entriesSnapshot);

        if (latestSaveRunRef.current === saveRun && scheduleContextKeyRef.current === contextKey) {
          setSavedEntries(entriesSnapshot);
          if (draftRevisionRef.current === draftRevision) {
            setDraftEntries([]);
            setHasDraftChanges(false);
            removeLocalScheduleDraft(draftStorageKey);
          }
          setSaveMessage(saveStatus);
        }
      })
      .catch((error) => {
        console.error(error);
        if (latestSaveRunRef.current === saveRun && scheduleContextKeyRef.current === contextKey) {
          setSaveMessage("Auto-save failed. Check your connection and try again.");
        }
      })
      .finally(() => {
        setIsSaving(false);
      });

    saveQueueRef.current = saveJob;
    return saveJob;
  }

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (!canEdit || isGenerating || isSaving || !hasDraftChanges || draftEntries.length === 0) return;

    const entriesSnapshot = draftEntries.map((entry) => ({ ...entry }));
    const draftRevision = draftRevisionRef.current;
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void handleSaveCurrentSchedule(entriesSnapshot, "Auto-saved current schedule.", draftRevision);
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [canEdit, draftEntries, hasDraftChanges, isGenerating, isSaving]);

  function handleClearDraft() {
    setDraftEntries([]);
    setHasDraftChanges(false);
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
    removeLocalScheduleDraft(draftStorageKey);
  }

  function handleClearUnlockedSchedule() {
    if (!canEdit || isGenerating || isSaving) return;

    const unlockedEntries = visibleEntries.filter((entry) => !entry.locked);
    if (unlockedEntries.length === 0) {
      setLockMessage("No unlocked schedule entries to clear.");
      return;
    }

    const shouldClear = window.confirm(
      `Clear ${unlockedEntries.length} unlocked schedule entr${unlockedEntries.length === 1 ? "y" : "ies"}? Locked entries will stay in place.`,
    );
    if (!shouldClear) return;

    const lockedEntries = visibleEntries
      .filter((entry) => entry.locked)
      .map(cleanEntryForLocalDraft);
    const nextConflicts = getScheduleAuditConflicts(lockedEntries);
    const missingSessionCount = nextConflicts
      .filter((conflict) => conflict.type === "unscheduled" || conflict.type === "special")
      .reduce((sum, conflict) => sum + conflict.sessions, 0);
    const completion = getCompletionStats(
      lockedEntries.filter((entry) =>
        joinedAssignments.some((assignment) => assignment.assignmentId === entry.sourceAssignmentId),
      ),
      missingSessionCount,
      [],
    );

    setDraftEntries(lockedEntries);
    setConflicts(nextConflicts);
    setRecentlyChangedScheduleIds(new Set(lockedEntries.map((entry) => entry.scheduleId)));
    setPlacementLog([]);
    setGenerationProgress(null);
    setOptimizationScore(null);
    setCompletionPercent(completion.completionPercent);
    setGenerationEndsAt(null);
    setGenerationMessage(
      nextConflicts.some((conflict) => conflict.type !== "score")
        ? "Unlocked entries cleared. Removed subjects are now listed for review."
        : "Unlocked entries cleared. Only locked entries remain.",
    );
    setLockMessage(`Cleared ${unlockedEntries.length} unlocked schedule entr${unlockedEntries.length === 1 ? "y" : "ies"}.`);
    updateDraftSchedule(lockedEntries, {
      nextConflicts,
      nextGenerationMessage: nextConflicts.some((conflict) => conflict.type !== "score")
        ? "Unlocked entries cleared. Removed subjects are now listed for review."
        : "Unlocked entries cleared. Only locked entries remain.",
      nextOptimizationScore: null,
      nextCompletionPercent: completion.completionPercent,
      nextGenerationProgress: null,
    });
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
      setHasDraftChanges(false);
      setSavedEntries([]);
      setConflicts([]);
      setGenerationMessage("");
      setOptimizationScore(null);
      setCompletionPercent(null);
      setGenerationProgress(null);
      setRecentlyChangedScheduleIds(new Set());
      setPlacementLog([]);
      setGenerationEndsAt(null);
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
    updateDraftSchedule(nextEntries, {
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

    setDraftEntries(updatedEntries);
    setLockMessage(nextLocked ? "Entry locked. Future generation will keep it fixed." : "Entry unlocked. Future generation can move it.");
    updateDraftSchedule(updatedEntries);
  }

  function startEditRoom(entry: ClassScheduleEntry) {
    if (!canEdit || isGenerating) return;
    setEditingRoomScheduleId(entry.scheduleId);
    setRoomDraft(entry.room ?? "");
    setLockMessage("");
  }

  function cancelEditRoom() {
    setEditingRoomScheduleId(null);
    setRoomDraft("");
  }

  async function saveEditedRoom(entry: ClassScheduleEntry) {
    if (!canEdit || isGenerating) return;

    const nextRoom = roomDraft.trim();
    const nextEntry: ClassScheduleEntry = {
      ...entry,
      room: nextRoom || undefined,
    };
    const otherEntries = visibleEntries.filter((item) => item.scheduleId !== entry.scheduleId);
    const hasNextRoomConflict =
      Boolean(nextRoom) &&
      !isCustomScheduleEntry(nextEntry) &&
      otherEntries.some(
        (item) =>
          item.room === nextRoom &&
          !isCustomScheduleEntry(item) &&
          entriesOverlap(item, nextEntry),
      );

    if (hasNextRoomConflict) {
      setLockMessage(`Room ${nextRoom} is already in use during this time block.`);
      return;
    }

    const updatedEntries = visibleEntries.map((item) =>
      item.scheduleId === entry.scheduleId ? nextEntry : item,
    );

    setDraftEntries(updatedEntries);

    setEditingRoomScheduleId(null);
    setRoomDraft("");
    setRecentlyChangedScheduleIds(new Set([entry.scheduleId]));
    setLockMessage(nextRoom ? `Room updated to ${nextRoom}.` : "Room assignment cleared.");
    updateDraftSchedule(updatedEntries);
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
    setConflicts(nextConflicts);
    setRecentlyChangedScheduleIds(new Set());
    setPlacementLog((current) => current.filter((item) => item.scheduleId !== entry.scheduleId));
    setCompletionPercent(null);
    setOptimizationScore(null);
    setLockMessage(
      isCustomScheduleEntry(entry)
        ? "Custom schedule card removed."
        : "Schedule entry removed. It is now listed as unplaced.",
    );
    updateDraftSchedule(updatedEntries, {
      nextConflicts,
      nextGenerationMessage: isCustomScheduleEntry(entry)
        ? generationMessage
        : "Some subjects could not be scheduled. Review conflicts.",
      nextOptimizationScore: null,
      nextCompletionPercent: null,
      nextGenerationProgress: null,
    });
  }

  function handleAddCustomScheduleCard() {
    if (!canEdit || isGenerating) return;

    const title = customForm.title.trim();
    if (!title) {
      setLockMessage("Enter a title for the custom schedule card.");
      return;
    }

    if (!customForm.teacherId) {
      setLockMessage("Choose a teacher for the custom load.");
      return;
    }

    const hours = Number(customForm.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setLockMessage("Enter a valid number of hours for the custom load.");
      return;
    }

    const isTeacherOnly = customForm.sectionId === noSectionFormValue;
    const templateSection = customFormSection ?? selectedSection ?? visibleSections[0];
    if (!templateSection) {
      setLockMessage("Choose a section template before adding a custom load.");
      return;
    }

    const room = customForm.room.trim() || (isTeacherOnly ? "" : templateSection.room?.trim());
    const customSectionId = isTeacherOnly ? "" : templateSection.sectionId;
    const customId = `custom:${customSectionId || "no-section"}:${customForm.teacherId}:${title}:${Date.now()}`;
    const customEntry: ClassScheduleEntry = {
      scheduleId: customId.replace(/[^a-zA-Z0-9]/g, "_"),
      schoolYear,
      term,
      gradeLevel: templateSection.gradeLevel,
      strand: templateSection.strand,
      sectionId: customSectionId,
      subjectId: title,
      teacherId: customForm.teacherId,
      room: room || undefined,
      day: "Monday",
      startTime: "",
      endTime: "",
      duration: hours,
      slotId: customId,
      sourceAssignmentId: customId,
      locked: true,
      custom: true,
      customTitle: title,
      customDetails: isTeacherOnly ? noSectionLabel : "",
      templateType: getTemplateType(templateSection, templateSection.gradeLevel),
    };

    const updatedEntries = [...visibleEntries, customEntry];
    setDraftEntries(updatedEntries);
    setRecentlyChangedScheduleIds(new Set([customEntry.scheduleId]));
    setPlacementLog((current) => [customEntry, ...current].slice(0, 12));
    setLockMessage(`Added ${title}.`);
    setCustomForm((current) => ({ ...current, title: "", hours: "1" }));
    updateDraftSchedule(updatedEntries, {
      nextGenerationMessage: generationMessage,
      nextOptimizationScore: optimizationScore,
      nextCompletionPercent: completionPercent,
      nextGenerationProgress: generationProgress,
    });
  }

  function buildCustomScheduleEntry(
    title: string,
    duration: number,
    templateSection: Section,
    teacherId: string,
    day: ScheduleDay,
    slot: Slot,
    options: { teacherOnly?: boolean; room?: string; customDetails?: string } = {},
  ): ClassScheduleEntry {
    const sectionId = options.teacherOnly ? "" : templateSection.sectionId;
    const customId = `custom:${sectionId || "no-section"}:${teacherId}:${title}:${Date.now()}`;
    const room = options.room?.trim() || (options.teacherOnly ? "" : templateSection.room?.trim());

    return {
      scheduleId: customId.replace(/[^a-zA-Z0-9]/g, "_"),
      schoolYear,
      term,
      gradeLevel: templateSection.gradeLevel,
      strand: templateSection.strand,
      sectionId,
      subjectId: title,
      teacherId,
      room: room || undefined,
      day,
      startTime: slot.startTime,
      endTime: getEndTimeForDuration(slot.startTime, duration),
      duration,
      slotId: slot.slotId,
      sourceAssignmentId: customId,
      locked: true,
      custom: true,
      customTitle: title,
      customDetails: options.customDetails ?? "Special Task",
      templateType: getTemplateType(templateSection, templateSection.gradeLevel),
    };
  }

  function getCustomDropTemplateSection(entityField: "sectionId" | "teacherId", entityId: string) {
    return entityField === "sectionId"
      ? sectionsById.get(entityId)
      : selectedSection;
  }

  function getCustomDropTeacherId(entityField: "sectionId" | "teacherId", entityId: string) {
    return entityField === "teacherId"
      ? entityId
      : selectedTeacher?.teacherId;
  }

  function entryMatchesCell(entry: ClassScheduleEntry, entityField: "sectionId" | "teacherId", slot: Slot) {
    if (entityField === "sectionId") return entry.slotId === slot.slotId;
    if (entry.slotId === slot.slotId) return true;
    return entry.startTime === slot.startTime && entry.endTime === slot.endTime;
  }

  function entryFor(entityField: "sectionId" | "teacherId", entityId: string, day: ScheduleDay, slot: Slot) {
    return visibleEntries.find(
      (entry) =>
        entry[entityField] === entityId &&
        entry.day === day &&
        entryMatchesCell(entry, entityField, slot),
    );
  }

  function entriesForCell(entityField: "sectionId" | "teacherId", entityId: string, day: ScheduleDay, slot: Slot) {
    return visibleEntries.filter(
      (entry) =>
        entry[entityField] === entityId &&
        entry.day === day &&
        entryMatchesCell(entry, entityField, slot),
    );
  }

  function moveEntryToSlot(entry: ClassScheduleEntry, day: ScheduleDay, slot: Slot): ClassScheduleEntry {
    return {
      ...entry,
      day,
      startTime: slot.startTime,
      endTime: getEndTimeForDuration(slot.startTime, entry.duration),
      slotId: slot.slotId,
    };
  }

  function moveEntryToManualSlot(entry: ClassScheduleEntry, day: ScheduleDay, slot: Slot): ClassScheduleEntry {
    return {
      ...entry,
      day,
      startTime: slot.startTime,
      endTime: getEndTimeForDuration(slot.startTime, entry.duration),
      slotId: slot.slotId,
    };
  }

  function canEntryUseSlot(
    entry: ClassScheduleEntry,
    slot: Slot,
    options: { allowShorterDuration?: boolean } = {},
  ) {
    const section = sectionsById.get(entry.sectionId);
    const compatibleSlots = section ? getSlotsForSection(section, entry.gradeLevel) : getSlotsForEntryTemplate(entry);

    return compatibleSlots.some(
      (gradeSlot) => {
        const sameSlot = gradeSlot.slotId === slot.slotId;
        const sameTime = gradeSlot.startTime === slot.startTime && gradeSlot.endTime === slot.endTime;

        return (
          (sameSlot || sameTime) &&
          (options.allowShorterDuration
            ? entry.duration <= gradeSlot.duration && entry.duration <= slot.duration
            : canSlotFitDuration(gradeSlot, entry.duration) && canSlotFitDuration(slot, entry.duration))
        );
      },
    );
  }

  function getTemplateSlotForEntry(entry: ClassScheduleEntry) {
    const section = sectionsById.get(entry.sectionId);
    return getSlotsForSection(section, entry.gradeLevel).find((slot) => slot.slotId === entry.slotId);
  }

  function getNextSessionIndex(assignmentId: string) {
    return visibleEntries.filter((entry) => entry.sourceAssignmentId === assignmentId).length + 1;
  }

  function buildManualEntry(assignment: JoinedAssignment, day: ScheduleDay, slot: Slot): ClassScheduleEntry | null {
    const rule = sessionsForAssignment(assignment);
    if (slot.duration < rule.duration) return null;

    const entry = createScheduleEntry(
      {
        sessionId: `${assignment.assignmentId}:manual:${Date.now()}`,
        assignment,
        duration: rule.duration,
        sessionIndex: getNextSessionIndex(assignment.assignmentId),
        totalSessions: rule.sessions,
        priority: rule.priority,
        units: getJoinedAssignmentUnits(assignment),
        preferElectiveSlot: prefersGrade11AfternoonSlot(assignment),
      },
      day,
      slot,
    );

    return {
      ...entry,
      endTime: getEndTimeForDuration(slot.startTime, rule.duration),
      duration: rule.duration,
      locked: true,
    };
  }

  function clearDragState() {
    setDraggedScheduleId(null);
    setDraggedConflictAssignmentId(null);
    setDraggedCustomLoad(null);
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

  function handleDropOnCell(
    targetEntry: ClassScheduleEntry | undefined,
    day: ScheduleDay,
    slot: Slot,
    entityField: "sectionId" | "teacherId",
    entityId: string,
  ) {
    if ((!draggedScheduleId && !draggedConflictAssignmentId && !draggedCustomLoad) || isGenerating) return;

    if (draggedCustomLoad) {
      const sourceEntry =
        draggedCustomLoad.type === "existing"
          ? visibleEntries.find((entry) => entry.scheduleId === draggedCustomLoad.scheduleId)
          : undefined;
      const isActivityDrop = draggedCustomLoad.type === "activity";
      if (isActivityDrop && entityField !== "sectionId") {
        setLockMessage("This activity card is for class schedules only. Switch to Class Schedule and drop it on a section slot.");
        clearDragState();
        return;
      }

      const templateSection = sourceEntry
        ? sectionsById.get(sourceEntry.sectionId)
          ?? selectedSection
          ?? visibleSections[0]
        : getCustomDropTemplateSection(entityField, entityId);
      const teacherId = isActivityDrop ? "" : sourceEntry?.teacherId || getCustomDropTeacherId(entityField, entityId);

      if (!templateSection || (!isActivityDrop && !teacherId)) {
        setLockMessage(isActivityDrop ? "Choose a class section before placing this activity." : "Choose a section and teacher before placing this custom load.");
        clearDragState();
        return;
      }

      const customEntry = sourceEntry
        ? {
            ...moveEntryToManualSlot(sourceEntry, day, slot),
            endTime: getEndTimeForDuration(slot.startTime, sourceEntry.duration),
            locked: true,
          }
        : buildCustomScheduleEntry(unlimitedActivityTitle, 1, templateSection, teacherId, day, slot, {
            customDetails: "Class Activity",
          });

      if (!canEntryUseSlot(customEntry, slot, { allowShorterDuration: true })) {
        setLockMessage("Custom placement blocked because the target time slot is shorter than the task duration or outside the grade template.");
        clearDragState();
        return;
      }

      const comparisonEntries = sourceEntry
        ? visibleEntries.filter((entry) => entry.scheduleId !== sourceEntry.scheduleId)
        : visibleEntries;
      const conflictReason = getHardConflictReason(customEntry, comparisonEntries);
      if (conflictReason) {
        setLockMessage(conflictReason);
        clearDragState();
        return;
      }

      const updatedEntries = sourceEntry
        ? visibleEntries.map((entry) => (entry.scheduleId === sourceEntry.scheduleId ? customEntry : entry))
        : [...visibleEntries, customEntry];

      setDraftEntries(updatedEntries);
      setRecentlyChangedScheduleIds(new Set([customEntry.scheduleId]));
      setPlacementLog((current) => [customEntry, ...current.filter((item) => item.scheduleId !== customEntry.scheduleId)].slice(0, 12));
      setLockMessage(`Placed ${getEntryTitle(customEntry, subjectsById)}.`);
      updateDraftSchedule(updatedEntries, {
        nextGenerationMessage: generationMessage,
        nextOptimizationScore: optimizationScore,
        nextCompletionPercent: completionPercent,
        nextGenerationProgress: generationProgress,
      });
      clearDragState();
      return;
    }

    if (draggedConflictAssignmentId) {
      const assignment = joinedAssignments.find((item) => item.assignmentId === draggedConflictAssignmentId);
      if (!assignment) {
        clearDragState();
        return;
      }

      const manualEntry = buildManualEntry(assignment, day, slot);
      if (!manualEntry || !canEntryUseSlot(manualEntry, slot, { allowShorterDuration: true })) {
        setLockMessage("Manual placement blocked because the target time slot is shorter than the subject duration or outside the grade template.");
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
      updateDraftSchedule(updatedEntries, { nextConflicts: updatedConflicts });
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

    const sourceSlot = getTemplateSlotForEntry(sourceEntry) ?? {
      slotId: sourceEntry.slotId,
      startTime: sourceEntry.startTime,
      endTime: sourceEntry.endTime,
      duration: sourceEntry.duration,
      label: `${sourceEntry.startTime}-${sourceEntry.endTime}`,
    };
    const movedSource = moveEntryToManualSlot(sourceEntry, day, slot);
    const movedTarget = targetEntry ? moveEntryToManualSlot(targetEntry, sourceEntry.day, sourceSlot) : undefined;
    const otherEntries = visibleEntries.filter(
      (entry) =>
        entry.scheduleId !== sourceEntry.scheduleId &&
        entry.scheduleId !== targetEntry?.scheduleId,
    );

    if (
      !canEntryUseSlot(sourceEntry, slot, { allowShorterDuration: true }) ||
      (targetEntry && !canEntryUseSlot(targetEntry, sourceSlot, { allowShorterDuration: true }))
    ) {
      setLockMessage("Move blocked because the target time slot is shorter than the subject duration or outside the grade template.");
      clearDragState();
      return;
    }

    const moveConflictReason =
      getHardConflictReason(
        movedSource,
        [...otherEntries, ...(movedTarget ? [movedTarget] : [])],
      ) ||
      (movedTarget
        ? getHardConflictReason(movedTarget, [...otherEntries, movedSource])
        : "");

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
    setRecentlyChangedScheduleIds(
      new Set([sourceEntry.scheduleId, ...(movedTarget ? [movedTarget.scheduleId] : [])]),
    );
    setLockMessage("");
    updateDraftSchedule(updatedEntries);
    clearDragState();
  }

  function selectAdjacentSection(direction: -1 | 1) {
    if (visibleSections.length === 0) return;

    const currentIndex = Math.max(
      0,
      visibleSections.findIndex((section) => section.sectionId === selectedSection?.sectionId),
    );
    const nextIndex = (currentIndex + direction + visibleSections.length) % visibleSections.length;
    setSelectedSectionId(visibleSections[nextIndex].sectionId);
  }

  function renderSectionNavigator() {
    if (visibleSections.length === 0) return null;

    const selectedIndex = Math.max(
      0,
      visibleSections.findIndex((section) => section.sectionId === selectedSection?.sectionId),
    );

    return (
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <label className="min-w-0 flex-1 text-xs font-semibold uppercase text-slate-500">
          Section
          <select
            className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal normal-case text-slate-900"
            onChange={(event) => setSelectedSectionId(event.target.value)}
            value={selectedSection?.sectionId ?? ""}
          >
            {visibleSections.map((section) => (
              <option key={section.sectionId} value={section.sectionId}>
                {section.sectionName}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <p className="text-xs font-semibold text-slate-600">
            {selectedIndex + 1} of {visibleSections.length}
          </p>
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            <button
              aria-label="Previous section"
              className="inline-flex h-9 w-9 items-center justify-center bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={visibleSections.length < 2}
              onClick={() => selectAdjacentSection(-1)}
              title="Previous section"
              type="button"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Next section"
              className="inline-flex h-9 w-9 items-center justify-center border-l border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={visibleSections.length < 2}
              onClick={() => selectAdjacentSection(1)}
              title="Next section"
              type="button"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function selectAdjacentTeacher(direction: -1 | 1) {
    if (visibleTeachers.length === 0) return;

    const currentIndex = Math.max(
      0,
      visibleTeachers.findIndex((teacher) => teacher.teacherId === selectedTeacher?.teacherId),
    );
    const nextIndex = (currentIndex + direction + visibleTeachers.length) % visibleTeachers.length;
    setSelectedTeacherId(visibleTeachers[nextIndex].teacherId);
  }

  function renderTeacherNavigator() {
    if (visibleTeachers.length === 0) return null;

    const selectedIndex = Math.max(
      0,
      visibleTeachers.findIndex((teacher) => teacher.teacherId === selectedTeacher?.teacherId),
    );

    return (
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <label className="min-w-0 flex-1 text-xs font-semibold uppercase text-slate-500">
          Teacher
          <select
            className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal normal-case text-slate-900"
            onChange={(event) => setSelectedTeacherId(event.target.value)}
            value={selectedTeacher?.teacherId ?? ""}
          >
            {visibleTeachers.map((teacher) => (
              <option key={teacher.teacherId} value={teacher.teacherId}>
                {teacher.fullName}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <p className="text-xs font-semibold text-slate-600">
            {selectedIndex + 1} of {visibleTeachers.length}
          </p>
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            <button
              aria-label="Previous teacher"
              className="inline-flex h-9 w-9 items-center justify-center bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={visibleTeachers.length < 2}
              onClick={() => selectAdjacentTeacher(-1)}
              title="Previous teacher"
              type="button"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Next teacher"
              className="inline-flex h-9 w-9 items-center justify-center border-l border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={visibleTeachers.length < 2}
              onClick={() => selectAdjacentTeacher(1)}
              title="Next teacher"
              type="button"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function openPrintableSchedule() {
    const title = viewMode === "section" ? "Class Schedule" : "Teacher Schedule";
    const entities = viewMode === "section" ? visibleSections : visibleTeachers;
    const field = viewMode === "section" ? "sectionId" : "teacherId";
    const signatories =
      viewMode === "section"
        ? schedulePrintSettings.classSchedule
        : schedulePrintSettings.teacherSchedule;
    const signatureItems = [
      { label: "Prepared by:", signatory: signatories.preparedBy },
      { label: "Checked by:", signatory: signatories.checkedBy },
      { label: "Noted by:", signatory: signatories.notedBy },
    ];
    const signatureRows = signatureItems
      .map(
        (item) =>
          `<div>
            <span>${escapeHtml(item.label)}</span>
            <strong class="${item.signatory.name.trim() ? "" : "is-empty"}">${escapeHtml(item.signatory.name)}</strong>
            <small>${escapeHtml(item.signatory.position)}</small>
          </div>`,
      )
      .join("");
    const pages = entities.map((entity) => {
      const entityId = viewMode === "section" ? (entity as Section).sectionId : (entity as Teacher).teacherId;
      const entityName = viewMode === "section" ? (entity as Section).sectionName : (entity as Teacher).fullName;
      const teacherTotalTeachingLoad =
        viewMode === "teacher"
          ? assignments
              .filter((assignment) => assignment.teacherId === entityId)
              .reduce(
                (sum, assignment) =>
                  sum + (getLoadHours(subjectsById.get(assignment.subjectId)) || getLoadHours(assignment)),
                0,
              )
          : 0;
      const teacherTotalAncillaryLoad =
        viewMode === "teacher"
          ? ancillaryLoads
              .filter(
                (load) =>
                  load.teacherId === entityId &&
                  load.schoolYear === schoolYear,
              )
              .reduce((sum, load) => sum + getLoadHours(load), 0)
          : 0;
      const entitySlots =
        viewMode === "section"
          ? getSlotsForSection(entity as Section, (entity as Section).gradeLevel)
          : getAllDisplaySlots();
      const entityBreaks = viewMode === "section" ? getBreaksForSection(entity as Section, (entity as Section).gradeLevel) : [];
      const entityMeta =
        viewMode === "section"
          ? [
              { label: "Section", value: (entity as Section).sectionName },
              { label: "Grade Level", value: `Grade ${(entity as Section).gradeLevel}` },
              { label: "Strand", value: (entity as Section).strand },
              { label: "Room", value: (entity as Section).room || "TBA" },
              { label: "Template", value: getTemplateLabel(entity as Section, (entity as Section).gradeLevel) },
            ]
          : [
              { label: "Teacher", value: (entity as Teacher).fullName },
              { label: "Position", value: (entity as Teacher).position },
              { label: "Specialization", value: (entity as Teacher).specialization },
              { label: "Total Teaching Load", value: `${teacherTotalTeachingLoad} hours` },
              { label: "Total Ancillary Loads", value: `${teacherTotalAncillaryLoad} hours` },
            ];
      const timetableRows = [
        ...entitySlots.map((slot) => ({ type: "slot" as const, startTime: slot.startTime, endTime: slot.endTime, slot })),
        ...entityBreaks.map((breakRow) => ({ type: "break" as const, ...breakRow })),
      ].sort(
        (first, second) =>
          timeToMinutes(first.startTime) - timeToMinutes(second.startTime) ||
          timeToMinutes(first.endTime) - timeToMinutes(second.endTime),
      );
      const rows = timetableRows
        .flatMap((row) => {
          if (row.type === "break") {
            return [
              `<tr class="break-row"><th>${escapeHtml(`${row.startTime}-${row.endTime}`)}</th><td colspan="${days.length}">${escapeHtml(row.label)}</td></tr>`,
            ];
          }

          const rowEntries = days.map((day) => entryFor(field, entityId, day, row.slot));
          if (rowEntries.every((entry) => !entry)) return [];

          const cells = days
            .map((day, index) => {
              const entry = rowEntries[index];
              const section = entry ? sectionsById.get(entry.sectionId) : undefined;
              const teacher = entry ? teachersById.get(entry.teacherId) : undefined;
              const isCustomEntry = entry ? isCustomScheduleEntry(entry) : false;
              const secondary = isCustomEntry
                ? entry?.customDetails
                : viewMode === "section"
                  ? teacher?.fullName
                  : entry
                    ? getEntrySectionLabel(entry, sectionsById)
                    : "";
              const details = [
                secondary,
                entry?.room ? `Room ${entry.room}` : "",
                viewMode === "teacher" && entry ? `${entry.duration} hr${entry.duration === 1 ? "" : "s"}` : "",
              ].filter(Boolean);
              return `<td>${entry ? `<strong>${escapeHtml(getEntryTitle(entry, subjectsById))}</strong>${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join("")}` : ""}</td>`;
            })
            .join("");
          return [`<tr><th>${escapeHtml(row.slot.label)}</th>${cells}</tr>`];
        })
        .join("");
      const metaRows = entityMeta
        .map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`)
        .join("");

      return `<section class="page">
        <header class="letterhead">
          <div class="agency">
            <img class="print-logo header-logo" src="${depedLogoUrl}" alt="DepEd logo" />
            <p class="script">Republic of the Philippines</p>
            <p class="deped">Department of Education</p>
            <p>REGION IV-A CALABARZON</p>
            <p>SCHOOLS DIVISION OF BATANGAS</p>
            <p>MATAASNAKAHOY SENIOR HIGH SCHOOL</p>
            <p>BAYORBOR, MATAASNAKAHOY, BATANGAS</p>
          </div>
        </header>
        <div class="document-title">
          <p>School Year ${escapeHtml(schoolYear)} | ${escapeHtml(term)}</p>
          <h1>${escapeHtml(title.toUpperCase())}</h1>
          <strong>${escapeHtml(entityName)}</strong>
        </div>
        <div class="meta-grid">${metaRows}</div>
        <table class="schedule-table">
          <thead><tr><th>Time</th>${days.map((day) => `<th>${day}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="signature-grid">${signatureRows}</div>
        <footer>
          <div class="footer-brand">
            <img class="print-logo" src="${bagongPilipinasLogoUrl}" alt="Bagong Pilipinas logo" />
            <img class="print-logo" src="${mshsLogoUrl}" alt="Mataasnakahoy Senior High School logo" />
          </div>
          <div class="footer-details">
            <div><strong>Address</strong><span>:</span> Brgy. Bayorbor, Mataasnakahoy, Batangas</div>
            <div><strong>Phone No.</strong><span>:</span> (043)741-8878</div>
            <div><strong>Email</strong><span>:</span> mkahoyshs2016@gmail.com</div>
          </div>
        </footer>
      </section>`;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>
      @page{size:A4 landscape;margin:10mm}
      *{box-sizing:border-box}
      body{margin:0;background:#e5e7eb;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:10px}
      .no-print{position:fixed;right:16px;top:16px;z-index:10;border:1px solid #1d4ed8;background:#1d4ed8;color:white;border-radius:6px;padding:9px 14px;font-weight:700}
      .page{display:flex;flex-direction:column;height:190mm;background:white;margin:0 auto 14px;padding:6mm 8mm 8mm;page-break-after:always}
      .page:last-child{page-break-after:auto}
      .letterhead{border-bottom:1.5px solid #111827;padding-bottom:4px}
      .print-logo{width:42px;height:42px;object-fit:contain}
      .header-logo{display:block;margin:0 auto 1px}
      .agency{text-align:center;line-height:1.06}
      .agency p{margin:0}
      .agency .script{font-family:"Old English Text MT","Times New Roman",serif;font-size:11px;font-weight:700;text-transform:none}
      .agency .deped{font-family:"Old English Text MT","Times New Roman",serif;font-size:17px;font-weight:700;text-transform:none}
      .agency p:not(.script):not(.deped){font-family:"Times New Roman",serif;font-size:9px;font-weight:700;letter-spacing:.02em}
      .document-title{text-align:center;margin:6px 0 5px;line-height:1.15}
      .document-title p{margin:0;color:#374151;font-size:8px;font-weight:700;text-transform:uppercase}
      h1{margin:2px 0 1px;font-size:14px;letter-spacing:.06em}
      .document-title strong{font-size:10px;text-transform:uppercase}
      .meta-grid{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #111827;border-bottom:0;margin-bottom:0}
      .meta-grid div{min-height:30px;border-right:1px solid #111827;padding:4px 6px}
      .meta-grid div:last-child{border-right:0}
      .meta-grid span{display:block;color:#374151;font-size:8px;font-weight:700;text-transform:uppercase}
      .meta-grid strong{display:block;margin-top:2px;font-size:10px}
      table{border-collapse:collapse;width:100%}
      .schedule-table th,.schedule-table td{border:1px solid #111827;padding:4px 5px;vertical-align:top}
      .schedule-table thead th{background:#dbeafe;text-align:center;font-size:10px;text-transform:uppercase}
      .schedule-table tbody th{width:86px;background:#f3f4f6;text-align:center;font-size:9px}
      .schedule-table td{height:42px;width:18%;font-size:9px;line-height:1.25}
      .schedule-table td strong{display:block;font-size:9px;text-transform:uppercase}
      .schedule-table td span{display:block;margin-top:2px;color:#374151}
      .break-row th,.break-row td{height:auto;background:#fef3c7!important;text-align:center;font-weight:700;text-transform:uppercase}
      .signature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:12px;text-align:center}
      .signature-grid span{display:block;margin-bottom:6px;text-align:left;font-size:9px;font-weight:700}
      .signature-grid strong{display:inline-block;min-height:13px;font-size:10px;text-decoration:underline;text-underline-offset:2px;text-transform:uppercase}
      .signature-grid strong.is-empty{text-decoration:none}
      .signature-grid small{display:block;margin-top:2px;color:#374151;font-size:8px}
      footer{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px;border-top:1.5px solid #111827;margin-top:auto;padding-top:4px;color:#374151;font-size:7px}
      .footer-brand{display:flex;align-items:center;gap:6px}
      .footer-details{line-height:1.25}
      .footer-details strong{display:inline-block;width:42px;color:#111827}
      .footer-details span{display:inline-block;width:8px;text-align:center}
      .empty-state{padding:35mm 10mm;text-align:center}
      .empty-state h1{font-size:18px}
      @media print{body{background:white}.no-print{display:none}.page{height:190mm;margin:0;padding:0 0 4mm}.schedule-table{break-inside:auto}.schedule-table tr{break-inside:avoid}}
    </style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button>${pages || `<section class="page empty-state"><h1>${escapeHtml(title)}</h1><p>No schedule entries found for the selected filters.</p></section>`}<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script></body></html>`);
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
        : getAllDisplaySlots();
    const entityBreaks = entityField === "sectionId" ? getBreaksForSection(entity as Section, (entity as Section).gradeLevel) : [];

    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" key={entityId}>
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
            {entityTitle}
            {entityField === "sectionId" && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                {getTemplateLabel(entity as Section)}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">
            {entityField === "sectionId"
              ? `Grade ${(entity as Section).gradeLevel} - ${(entity as Section).strand}${(entity as Section).room ? ` - Room ${(entity as Section).room}` : ""}`
              : (entity as Teacher).specialization}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed text-left text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="w-24 px-2 py-2 font-semibold">Time</th>
                {days.map((day) => (
                  <th className="px-2 py-2 font-semibold" key={day}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {entitySlots.flatMap((slot) => {
                const slotRow = (
                  <tr key={slot.slotId}>
                    <td className="px-2 py-2 align-top font-semibold text-slate-950">{slot.label}</td>
                    {days.map((day) => {
                      const cellEntries = entriesForCell(entityField, entityId, day, slot);
                      const exactEntry = cellEntries.find((entry) => entry.slotId === slot.slotId);
                      const dropTargetEntry = exactEntry ?? cellEntries[0];

                      return (
                        <td
                          className={[
                            "h-16 px-2 py-2 align-top",
                            canEdit && !isGenerating ? "transition-colors hover:bg-blue-50/50" : "",
                          ].join(" ")}
                          key={`${slot.slotId}-${day}`}
                          onDragOver={(event) => {
                            if (canEdit && !isGenerating) event.preventDefault();
                          }}
                          onDrop={() => handleDropOnCell(dropTargetEntry, day, slot, entityField, entityId)}
                        >
                          {cellEntries.length > 0 ? (
                            <div className="space-y-2">
                              {cellEntries.map((entry) => {
                                const section = sectionsById.get(entry.sectionId);
                                const teacher = teachersById.get(entry.teacherId);
                                const isCustomEntry = isCustomScheduleEntry(entry);
                                const isEditingRoom = editingRoomScheduleId === entry.scheduleId;
                                const isRecentlyChanged = recentlyChangedScheduleIds.has(entry.scheduleId);
                                const overlapWarnings = getOverlapWarnings(entry, visibleEntries, entityField);

                                return (
                                  <div
                                    className={[
                                      "rounded-md border p-1.5 transition-all",
                                      overlapWarnings.length > 0
                                        ? "border-red-300 bg-red-50"
                                        : isCustomEntry
                                          ? "border-emerald-200 bg-emerald-50"
                                          : entry.locked
                                            ? "border-amber-200 bg-amber-50"
                                            : "border-blue-100 bg-blue-50",
                                      canEdit && !entry.locked && !isGenerating && !isEditingRoom ? "cursor-grab active:cursor-grabbing" : "",
                                      draggedScheduleId === entry.scheduleId ? "opacity-50" : "",
                                      isRecentlyChanged ? "animate-pulse ring-2 ring-blue-400 ring-offset-1" : "",
                                    ].join(" ")}
                                    draggable={canEdit && !entry.locked && !isGenerating && !isEditingRoom}
                                    key={entry.scheduleId}
                                    onDragEnd={clearDragState}
                                    onDragStart={(event) => {
                                      setDraggedScheduleId(entry.scheduleId);
                                      setDraggedConflictAssignmentId(null);
                                      setDraggedCustomLoad(null);
                                      event.dataTransfer.effectAllowed = "move";
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        {isCustomEntry && (
                                          <p className="text-[10px] font-bold uppercase text-emerald-700">{getCustomEntryLabel(entry)}</p>
                                        )}
                                        <p className="font-semibold text-slate-950">{getEntryTitle(entry, subjectsById)}</p>
                                      </div>
                                      {canEdit && (
                                        <div className="flex shrink-0 gap-1">
                                          <button
                                            aria-label="Edit room assignment"
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                            disabled={isGenerating}
                                            onClick={() => startEditRoom(entry)}
                                            title="Edit room"
                                            type="button"
                                          >
                                            <Pencil size={14} />
                                          </button>
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
                                    <p className="text-slate-600">
                                      {isCustomEntry
                                        ? `${entry.duration} hr${entry.duration === 1 ? "" : "s"}`
                                        : entityField === "sectionId"
                                          ? teacher?.fullName
                                          : section?.sectionName}
                                    </p>
                                    {!isCustomEntry && <p className="text-slate-500">{entry.startTime}-{entry.endTime}</p>}
                                    {isEditingRoom ? (
                                      <div className="mt-2 flex items-center gap-1">
                                        <input
                                          aria-label="Room assignment"
                                          className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                          onChange={(event) => setRoomDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") saveEditedRoom(entry);
                                            if (event.key === "Escape") cancelEditRoom();
                                          }}
                                          placeholder="Room"
                                          value={roomDraft}
                                        />
                                        <button
                                          aria-label="Save room assignment"
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                                          onClick={() => saveEditedRoom(entry)}
                                          type="button"
                                        >
                                          <Check size={14} />
                                        </button>
                                        <button
                                          aria-label="Cancel room edit"
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                          onClick={cancelEditRoom}
                                          type="button"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    ) : (
                                      <p className="text-slate-500">Room {entry.room || "TBA"}</p>
                                    )}
                                    {entry.locked && <p className="text-[11px] font-semibold uppercase text-amber-700">Locked</p>}
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
                    <td className="px-2 py-1.5 font-semibold">{breakAfter.startTime}-{breakAfter.endTime}</td>
                    <td className="px-2 py-1.5 font-medium" colSpan={5}>{breakAfter.label}</td>
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
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              disabled={isGenerating || isSaving || isUpdatingData}
              onClick={() => void handleUpdateScheduleData()}
              type="button"
            >
              <RefreshCw className={isUpdatingData ? "animate-spin" : ""} size={16} />
              {isUpdatingData ? "Updating..." : "Update Data"}
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isGenerating || isUpdatingData}
              onClick={handleCheckFeasibility}
              type="button"
            >
              Check Feasibility
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isGenerating || isUpdatingData}
              onClick={handleRefreshScheduleConflicts}
              type="button"
            >
              <RefreshCw size={16} /> Refresh Conflicts
            </button>
            {canEdit && (
              <>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isGenerating || isSaving || visibleEntries.length === 0}
                  onClick={() => void handleSaveCurrentSchedule()}
                  type="button"
                >
                  <Save size={16} /> Save Now
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={isGenerating || isSaving || unlockedScheduleCount === 0}
                  onClick={() => void handleClearUnlockedSchedule()}
                  title="Clear all unlocked entries and keep locked entries"
                  type="button"
                >
                  <Trash2 size={16} /> Clear Unlocked
                </button>
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
              </>
            )}
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={openPrintableSchedule} type="button">
              <Printer size={16} /> Print
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={openPrintableSubjectLoads} type="button">
              <Printer size={16} /> Print Subjects
            </button>
          </div>
        }
        description="Review, manage, and auto-save class schedules from existing load assignments."
        title="Scheduler"
      />

      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <SummaryCard detail={gradeLevel === "all" ? "All grades selected" : `Grade ${gradeLevel} selected`} label="Sections" value={visibleSections.length} />
        <SummaryCard detail={hasDraftChanges ? "auto-save pending" : "saved schedule"} label="Scheduled Sessions" value={visibleEntries.length} />
        <SummaryCard detail="needs review" label="Conflicts" value={actionableConflicts.length} />
        <SummaryCard detail={optimizationScore === null ? "audit to calculate" : `score ${optimizationScore.toLocaleString()}`} label="Done" value={completionPercent === null ? "-" : `${completionPercent}%`} />
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold uppercase text-slate-500">
            School Year
            <input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900" onChange={(event) => setSchoolYear(event.target.value)} value={schoolYear} />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Term
            <select className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900" onChange={(event) => setTerm(event.target.value as AcademicTerm)} value={term}>
              {termOptions.map((termOption) => <option key={termOption} value={termOption}>{termOption}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Grade Level
            <select className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900" onChange={(event) => setGradeLevel(event.target.value)} value={gradeLevel}>
              {gradeOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All Grades" : `Grade ${option}`}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Strand
            <select className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900" onChange={(event) => setStrandFilter(event.target.value)} value={strandFilter}>
              <option value="all">All strands</option>
              {strandOptions.map((strand) => <option key={strand} value={strand}>{strand}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            View
            <div className="mt-1 grid h-9 grid-cols-2 overflow-hidden rounded-md border border-slate-300">
              <button className={viewMode === "section" ? "bg-blue-600 text-white" : "bg-white text-slate-700"} onClick={() => setViewMode("section")} type="button">By Section</button>
              <button className={viewMode === "teacher" ? "bg-blue-600 text-white" : "bg-white text-slate-700"} onClick={() => setViewMode("teacher")} type="button">By Teacher</button>
            </div>
          </label>
        </div>
        {canEdit && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setShowCustomTaskPanel((current) => !current)}
              type="button"
            >
              <ChevronDown
                aria-hidden="true"
                className={showCustomTaskPanel ? "rotate-180 transition-transform" : "transition-transform"}
                size={16}
              />
              Task/Subject
            </button>
            {showCustomTaskPanel && (
              <>
                <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(170px,1.1fr)_minmax(170px,1.1fr)_minmax(170px,1.1fr)_minmax(100px,130px)_minmax(140px,0.9fr)_auto]">
              <label className="text-xs font-semibold uppercase text-slate-500">
                Task/Subject
                <input
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900"
                  disabled={isGenerating || isSaving || visibleSections.length === 0}
                  onChange={(event) => setCustomForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Homeroom Guidance"
                  value={customForm.title}
                />
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Teacher
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900"
                  disabled={isGenerating || isSaving || activeTeachers.length === 0}
                  onChange={(event) => setCustomForm((current) => ({ ...current, teacherId: event.target.value }))}
                  value={customForm.teacherId}
                >
                  {activeTeachers.map((teacher) => (
                    <option key={teacher.teacherId} value={teacher.teacherId}>
                      {teacher.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Section
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900"
                  disabled={isGenerating || isSaving || visibleSections.length === 0}
                  onChange={(event) => {
                    const section = event.target.value === noSectionFormValue
                      ? undefined
                      : sectionsById.get(event.target.value);
                    setCustomForm((current) => ({
                      ...current,
                      sectionId: event.target.value,
                      room: section ? section.room || current.room : "",
                    }));
                  }}
                  value={customForm.sectionId}
                >
                  <option value={noSectionFormValue}>{noSectionLabel}</option>
                  {visibleSections.map((section) => (
                    <option key={section.sectionId} value={section.sectionId}>
                      {section.sectionName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                No. of Hours
                <input
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900"
                  disabled={isGenerating || isSaving || visibleSections.length === 0}
                  min="0.25"
                  onChange={(event) => setCustomForm((current) => ({ ...current, hours: event.target.value }))}
                  step="0.25"
                  type="number"
                  value={customForm.hours}
                />
              </label>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Room
                <input
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-normal normal-case text-slate-900"
                  disabled={isGenerating || isSaving || visibleSections.length === 0}
                  onChange={(event) => setCustomForm((current) => ({ ...current, room: event.target.value }))}
                  placeholder="Room"
                  value={customForm.room}
                />
              </label>
              <button
                className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!customForm.title.trim() || !customForm.teacherId || !Number(customForm.hours) || isGenerating || isSaving || visibleSections.length === 0}
                onClick={handleAddCustomScheduleCard}
                type="button"
              >
                <Plus size={16} /> Add
              </button>
              </div>
                {customLoadEntries.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full min-w-[760px] text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold uppercase">Task/Subject</th>
                          <th className="px-3 py-2 font-semibold uppercase">Teacher</th>
                          <th className="px-3 py-2 font-semibold uppercase">Section</th>
                          <th className="px-3 py-2 font-semibold uppercase">No. of Hours</th>
                          <th className="px-3 py-2 font-semibold uppercase">Room</th>
                          <th className="px-3 py-2 font-semibold uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                        {customLoadEntries.map((entry) => {
                          const teacher = teachersById.get(entry.teacherId);

                          return (
                            <tr key={entry.scheduleId}>
                              <td className="px-3 py-2 font-semibold text-slate-950">{getEntryTitle(entry, subjectsById)}</td>
                              <td className="px-3 py-2">{teacher?.fullName ?? entry.teacherId}</td>
                              <td className="px-3 py-2">{getEntrySectionLabel(entry, sectionsById)}</td>
                              <td className="px-3 py-2">{entry.duration}</td>
                              <td className="px-3 py-2">{entry.room || "TBA"}</td>
                              <td className="px-3 py-2">
                                <button
                                  aria-label="Remove custom load"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                  disabled={isGenerating}
                                  onClick={() => handleRemoveEntry(entry)}
                                  title="Remove custom load"
                                  type="button"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
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
                        const section = sectionsById.get(entry.sectionId);
                        const teacher = teachersById.get(entry.teacherId);
                        const isCustomEntry = isCustomScheduleEntry(entry);

                        return (
                          <div
                            className={index === 0 ? "rounded-md border border-blue-200 bg-blue-50 p-2 animate-pulse" : "rounded-md border border-slate-200 bg-slate-50 p-2"}
                            key={`${entry.scheduleId}-${index}`}
                          >
                            <p className="text-sm font-semibold text-slate-950">
                              {getEntryTitle(entry, subjectsById)}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {isCustomEntry
                                ? `${getCustomEntryLabel(entry)} - ${getEntrySectionLabel(entry, sectionsById)}`
                                : `${teacher?.fullName ?? entry.teacherId} - ${getEntrySectionLabel(entry, sectionsById)}`}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-blue-700">
                              {isCustomEntry
                                ? `${entry.duration} hr${entry.duration === 1 ? "" : "s"}${entry.room ? ` - Room ${entry.room}` : ""}`
                                : `${entry.day}, ${entry.startTime}-${entry.endTime}`}
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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {isGenerating && draftEntries.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 shadow-sm">
              Live draft is updating as the scheduler finds better placements.
            </div>
          )}
          {visibleEntries.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
              No schedule entries found for {gradeLevel === "all" ? "the selected grades" : `Grade ${gradeLevel}`}.
            </div>
          ) : viewMode === "section" ? (
            <>
              {renderSectionNavigator()}
              {selectedSection ? renderScheduleTable(selectedSection, "sectionId") : (
                <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
                  No sections match the selected filters.
                </div>
              )}
            </>
          ) : (
            <>
              {renderTeacherNavigator()}
              {selectedTeacher ? renderScheduleTable(selectedTeacher, "teacherId") : (
                <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
                  No teachers match the selected filters.
                </div>
              )}
            </>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-950">Teacher Auto Plot</h2>
              <StatusBadge label={selectedTeacher ? "Ready" : "No teacher"} tone={selectedTeacher ? "blue" : "amber"} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-slate-500">
                Teacher
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal normal-case text-slate-900"
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
              {selectedTeacher && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-950">{selectedTeacher.fullName}</p>
                    <StatusBadge
                      label={(teacherPlotSummaries.find((summary) => summary.teacher.teacherId === selectedTeacher.teacherId)?.conflictCount ?? 0) > 0 ? "Conflict" : "OK"}
                      tone={(teacherPlotSummaries.find((summary) => summary.teacher.teacherId === selectedTeacher.teacherId)?.conflictCount ?? 0) > 0 ? "red" : "green"}
                    />
                  </div>
                  <p className="mt-1 text-slate-600">
                    {teacherPlotSummaries.find((summary) => summary.teacher.teacherId === selectedTeacher.teacherId)?.unplottedCount ?? 0} unplotted /{" "}
                    {teacherPlotSummaries.find((summary) => summary.teacher.teacherId === selectedTeacher.teacherId)?.plottedCount ?? 0} plotted /{" "}
                    {teacherPlotSummaries.find((summary) => summary.teacher.teacherId === selectedTeacher.teacherId)?.assignmentCount ?? 0} loads
                  </p>
                </div>
              )}
              {selectedTeacher && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Selected Loads</p>
                  <div className="space-y-1">
                    {selectedTeacherAssignments.map((assignment) => {
                      const rule = sessionsForAssignment(assignment);
                      const plottedCount = visibleEntries.filter((entry) => entry.sourceAssignmentId === assignment.assignmentId).length;
                      const canDragLoad = canEdit && !isGenerating && plottedCount < rule.sessions;
                      const warnings = selectedTeacherEntries
                        .filter((entry) => entry.sourceAssignmentId === assignment.assignmentId)
                        .flatMap((entry) => getOverlapWarnings(entry, visibleEntries, "teacherId"));

                      return (
                        <div
                          className={[
                            "rounded-md border border-white bg-white p-1.5 text-xs transition-all",
                            canDragLoad ? "cursor-grab hover:border-blue-200 hover:bg-blue-50 active:cursor-grabbing" : "",
                            draggedConflictAssignmentId === assignment.assignmentId ? "opacity-50" : "",
                          ].join(" ")}
                          draggable={canDragLoad}
                          key={assignment.assignmentId}
                          onDragEnd={clearDragState}
                          onDragStart={(event) => {
                            if (!canDragLoad) return;
                            setDraggedConflictAssignmentId(assignment.assignmentId);
                            setDraggedScheduleId(null);
                            setDraggedCustomLoad(null);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          title={canDragLoad ? "Drag to a compatible schedule slot" : undefined}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-950">{assignment.subject.subjectName}</p>
                            <div className="flex shrink-0 items-center gap-1">
                              <StatusBadge
                                label={plottedCount >= rule.sessions ? "Plotted" : "Unplotted"}
                                tone={plottedCount >= rule.sessions ? "green" : "amber"}
                              />
                              {canDragLoad && <GripVertical aria-hidden="true" className="text-slate-500" size={14} />}
                            </div>
                          </div>
                          <p className="text-slate-600">{assignment.section.sectionName} - {plottedCount}/{rule.sessions} sessions</p>
                          {warnings.map((warning) => (
                            <p className="font-semibold text-red-700" key={warning}>{warning}</p>
                          ))}
                        </div>
                      );
                    })}
                    {selectedTeacherCustomLoads.map((entry) => {
                      const canDragCustomLoad = canEdit && !isGenerating;

                      return (
                        <div
                          className={[
                            "rounded-md border border-emerald-100 bg-emerald-50 p-1.5 text-xs transition-all",
                            canDragCustomLoad ? "cursor-grab hover:border-emerald-300 hover:bg-emerald-100 active:cursor-grabbing" : "",
                            draggedCustomLoad?.type === "existing" && draggedCustomLoad.scheduleId === entry.scheduleId ? "opacity-50" : "",
                          ].join(" ")}
                          draggable={canDragCustomLoad}
                          key={entry.scheduleId}
                          onDragEnd={clearDragState}
                          onDragStart={(event) => {
                            if (!canDragCustomLoad) return;
                            setDraggedCustomLoad({ type: "existing", scheduleId: entry.scheduleId });
                            setDraggedConflictAssignmentId(null);
                            setDraggedScheduleId(null);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          title={canDragCustomLoad ? "Drag to a compatible schedule slot" : undefined}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase text-emerald-700">{getCustomEntryLabel(entry)}</p>
                              <p className="font-semibold text-slate-950">{getEntryTitle(entry, subjectsById)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <StatusBadge label={entry.startTime ? "Plotted" : "Unplotted"} tone={entry.startTime ? "green" : "amber"} />
                              {canDragCustomLoad && <GripVertical aria-hidden="true" className="text-slate-500" size={14} />}
                            </div>
                          </div>
                          <p className="text-slate-600">
                            {getEntrySectionLabel(entry, sectionsById)} - {entry.duration} hr{entry.duration === 1 ? "" : "s"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Class Activity</p>
                {(() => {
                  const canDragActivity = canEdit && !isGenerating && viewMode === "section" && Boolean(selectedSection);

                  return (
                    <div
                      className={[
                        "rounded-md border border-sky-100 bg-sky-50 p-1.5 text-xs transition-all",
                        canDragActivity ? "cursor-grab hover:border-sky-300 hover:bg-sky-100 active:cursor-grabbing" : "opacity-70",
                        draggedCustomLoad?.type === "activity" ? "opacity-50" : "",
                      ].join(" ")}
                      draggable={canDragActivity}
                      onDragEnd={clearDragState}
                      onDragStart={(event) => {
                        if (!canDragActivity) return;
                        setDraggedCustomLoad({ type: "activity" });
                        setDraggedConflictAssignmentId(null);
                        setDraggedScheduleId(null);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      title={canDragActivity ? "Drag to add a one-hour class activity" : undefined}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-sky-700">Unlimited</p>
                          <p className="font-semibold text-slate-950">{unlimitedActivityTitle}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <StatusBadge label="1 hour" tone="blue" />
                          {canDragActivity && <GripVertical aria-hidden="true" className="text-slate-500" size={14} />}
                        </div>
                      </div>
                      <p className="text-slate-600">Class schedule only</p>
                    </div>
                  );
                })()}
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Auto Plot Mode
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal normal-case text-slate-900"
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
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal normal-case text-slate-900"
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
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
                  label={feasibilityResult.canGenerate ? "Ready" : "Blocked"}
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
                      setDraggedCustomLoad(null);
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
