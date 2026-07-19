import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { CurriculumMapping, LoadAssignment, Section, Subject } from "../types/loading";
import { getLoadHours, withLegacyUnits } from "../utils/loadHours";
import { subscribeCollection } from "./firestoreCrud";

const firestoreBatchLimit = 450;

export type LoadAssignmentSyncResult = {
  updated: number;
  removed: number;
  skipped: number;
};

function chunkBatchWrites(writes: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  const chunks: Array<Array<(batch: ReturnType<typeof writeBatch>) => void>> = [];
  for (let index = 0; index < writes.length; index += firestoreBatchLimit) {
    chunks.push(writes.slice(index, index + firestoreBatchLimit));
  }
  return chunks;
}

export const subscribeLoadAssignments = (
  callback: (assignments: LoadAssignment[]) => void,
) => subscribeCollection<LoadAssignment>("loadAssignments", callback, []);

export const subscribeLoadAssignmentsByPeriod = (
  schoolYear: string,
  term: string,
  callback: (assignments: LoadAssignment[]) => void,
) => {
  const assignmentsQuery = query(
    collection(db, "loadAssignments"),
    where("schoolYear", "==", schoolYear),
    where("term", "==", term),
  );

  return onSnapshot(assignmentsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as LoadAssignment));
  });
};

export function getAssignmentId(
  schoolYear: string,
  term: string,
  subjectId: string,
  sectionId: string,
) {
  return [schoolYear, term, subjectId, sectionId]
    .map((value) => value.replace(/[^a-zA-Z0-9]/g, "_"))
    .join("__");
}

export async function saveLoadAssignment(
  assignment: Omit<LoadAssignment, "assignmentId" | "createdAt" | "updatedAt">,
) {
  const assignmentId = getAssignmentId(
    assignment.schoolYear,
    assignment.term,
    assignment.subjectId,
    assignment.sectionId,
  );
  const { hoursPerSession, ...requiredAssignment } = assignment;
  const loadHours = getLoadHours(assignment);
  const normalizedHoursPerSession = Number(hoursPerSession || 0);
  const assignmentData = {
    ...requiredAssignment,
    ...withLegacyUnits(loadHours),
    assignmentId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(normalizedHoursPerSession > 0
      ? { hoursPerSession: normalizedHoursPerSession }
      : {}),
  };

  return setDoc(
    doc(db, "loadAssignments", assignmentId),
    assignmentData,
  );
}

export async function removeLoadAssignment(
  schoolYear: string,
  term: string,
  subjectId: string,
  sectionId: string,
) {
  return deleteDoc(
    doc(db, "loadAssignments", getAssignmentId(schoolYear, term, subjectId, sectionId)),
  );
}

export async function syncLoadAssignmentsForPeriod({
  assignments,
  mappings,
  schoolYear,
  sections,
  subjects,
  term,
}: {
  assignments: LoadAssignment[];
  mappings: CurriculumMapping[];
  schoolYear: string;
  sections: Section[];
  subjects: Subject[];
  term: string;
}): Promise<LoadAssignmentSyncResult> {
  const subjectsById = new Map(subjects.map((subject) => [subject.subjectId, subject]));
  const sectionsById = new Map(sections.map((section) => [section.sectionId, section]));
  const mappedCells = new Set(
    mappings
      .filter((mapping) => mapping.schoolYear === schoolYear && mapping.term === term)
      .map((mapping) => `${mapping.sectionId}:${mapping.subjectId}`),
  );
  let updated = 0;
  let removed = 0;
  let skipped = 0;
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  assignments
    .filter((assignment) => assignment.schoolYear === schoolYear && assignment.term === term)
    .forEach((assignment) => {
      const subject = subjectsById.get(assignment.subjectId);
      const section = sectionsById.get(assignment.sectionId);
      const isMapped = mappedCells.has(`${assignment.sectionId}:${assignment.subjectId}`);
      const assignmentRef = doc(db, "loadAssignments", assignment.assignmentId);

      if (!subject || !section || !isMapped) {
        writes.push((batch) => batch.delete(assignmentRef));
        removed += 1;
        return;
      }

      if (subject.term !== term || section.schoolYear !== schoolYear) {
        writes.push((batch) => batch.delete(assignmentRef));
        removed += 1;
        return;
      }

      if (section.gradeLevel !== subject.gradeLevel) {
        skipped += 1;
        return;
      }

      const normalizedHoursPerSession = Number(subject.hoursPerSession || 0);
      const loadHours = getLoadHours(subject);
      const syncedAssignment = {
        gradeLevel: section.gradeLevel,
        strand: section.strand,
        ...withLegacyUnits(loadHours),
        updatedAt: serverTimestamp(),
        hoursPerSession:
          normalizedHoursPerSession > 0 ? normalizedHoursPerSession : deleteField(),
      };
      const alreadySynced =
        assignment.gradeLevel === syncedAssignment.gradeLevel &&
        assignment.strand === syncedAssignment.strand &&
        getLoadHours(assignment) === loadHours &&
        Number(assignment.hoursPerSession || 0) === normalizedHoursPerSession;

      if (alreadySynced) return;

      writes.push((batch) => batch.update(assignmentRef, syncedAssignment));
      updated += 1;
    });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );

  return { updated, removed, skipped };
}
