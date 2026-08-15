import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { GradeComputation, GradeComputationSettings } from "../types/loading";

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "_");
}

function cleanObject<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

type GradeComputationWrite = Omit<
  GradeComputation,
  "computationId" | "submittedAt" | "createdAt" | "updatedAt"
>;

type GradeComputationSettingsWrite = Omit<
  GradeComputationSettings,
  "settingsId" | "createdAt" | "updatedAt"
>;

function getFirestoreErrorCode(caught: unknown): string {
  if (!caught || typeof caught !== "object") return "";
  const code = "code" in caught && typeof caught.code === "string" ? caught.code : "";
  if (code) return code.replace(/^firestore\//, "");
  return "cause" in caught ? getFirestoreErrorCode(caught.cause) : "";
}

export function getGradeComputationErrorMessage(
  caught: unknown,
  action = "save the grade computation",
) {
  if (getFirestoreErrorCode(caught) === "permission-denied") {
    return `Firestore rejected the request to ${action} (permission-denied). Your teacher account or subject-section assignment is not authorized by the deployed Firestore rules; the data was not saved.`;
  }

  const detail = caught instanceof Error ? caught.message : "Unknown Firestore error";
  return `Unable to ${action}: ${detail}`;
}

export function getGradeComputationId(assignmentId: string, enrollmentId: string) {
  return [assignmentId, enrollmentId].map(safeId).join("__");
}

export function getGradeComputationSettingsId(assignmentId: string) {
  return safeId(assignmentId);
}

export const subscribeGradeComputationsByTeacher = (
  teacherId: string,
  callback: (computations: GradeComputation[], serverSynced: boolean) => void,
  onError?: (error: Error) => void,
): Unsubscribe => {
  if (!teacherId) {
    callback([], true);
    return () => undefined;
  }

  const computationsQuery = query(
    collection(db, "gradeComputations"),
    where("teacherId", "==", teacherId),
  );

  return onSnapshot(
    computationsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const acceptedComputations = snapshot.docs
        .filter((item) => !item.metadata.hasPendingWrites)
        .map((item) => item.data() as GradeComputation);
      callback(
        acceptedComputations,
        !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites,
      );
    },
    onError,
  );
};

export const subscribeGradeComputationSettings = (
  assignmentId: string,
  callback: (settings: GradeComputationSettings | null, serverSynced: boolean) => void,
  onError?: (error: Error) => void,
): Unsubscribe => {
  if (!assignmentId) {
    callback(null, true);
    return () => undefined;
  }

  const settingsRef = doc(
    db,
    "gradeComputationSettings",
    getGradeComputationSettingsId(assignmentId),
  );

  return onSnapshot(
    settingsRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      const isAccepted = snapshot.exists() && !snapshot.metadata.hasPendingWrites;
      callback(
        isAccepted ? (snapshot.data() as GradeComputationSettings) : null,
        !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites,
      );
    },
    onError,
  );
};

export async function saveGradeComputationSettings(
  settings: GradeComputationSettingsWrite,
  exists: boolean,
) {
  const settingsId = getGradeComputationSettingsId(settings.assignmentId);
  const settingsRef = doc(db, "gradeComputationSettings", settingsId);
  const batch = writeBatch(db);

  batch.set(settingsRef, cleanObject({
    ...settings,
    settingsId,
    ...(exists ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }), { merge: true });
  await batch.commit();

  return settingsId;
}

export async function upsertGradeComputation(
  computation: GradeComputationWrite,
  exists: boolean,
) {
  const computationId = getGradeComputationId(
    computation.assignmentId,
    computation.enrollmentId,
  );
  const computationRef = doc(db, "gradeComputations", computationId);
  const batch = writeBatch(db);

  batch.set(computationRef, cleanObject({
    ...computation,
    computationId,
    submittedAt: serverTimestamp(),
    ...(exists ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }), { merge: true });

  await batch.commit().catch((caught) => {
    console.error("Rejected grade computation payload", {
      computationId,
      assignmentId: computation.assignmentId,
      classEnrollmentId: computation.classEnrollmentId,
      enrollmentId: computation.enrollmentId,
      lrn: computation.lrn,
      teacherId: computation.teacherId,
      subjectId: computation.subjectId,
      sectionId: computation.sectionId,
      schoolYear: computation.schoolYear,
      term: computation.term,
      submittedBy: computation.submittedBy,
      weights: computation.weights,
      highestScores: computation.highestScores,
      written: computation.written,
      performance: computation.performance,
      exam: computation.exam,
      initialGrade: computation.initialGrade,
      finalGrade: computation.finalGrade,
    });
    throw caught;
  });

  return computationId;
}

export async function upsertGradeComputations(
  computations: Array<{
    computation: GradeComputationWrite;
    exists: boolean;
  }>,
) {
  for (const { computation, exists } of computations) {
    try {
      await upsertGradeComputation(computation, exists);
    } catch (caught) {
      console.error(`Unable to save computation for ${computation.studentName}`, caught);
      throw caught;
    }
  }
}

export async function saveGradeComputationsAndSettings(
  settings: GradeComputationSettingsWrite,
  settingsExists: boolean,
  computations: Array<{
    computation: GradeComputationWrite;
    exists: boolean;
  }>,
) {
  const settingsId = getGradeComputationSettingsId(settings.assignmentId);
  const settingsRef = doc(db, "gradeComputationSettings", settingsId);
  const computationWrites = computations.map(({ computation, exists }) => {
    const computationId = getGradeComputationId(
      computation.assignmentId,
      computation.enrollmentId,
    );
    return {
      computation,
      computationId,
      exists,
      ref: doc(db, "gradeComputations", computationId),
    };
  });
  const batch = writeBatch(db);

  batch.set(settingsRef, cleanObject({
    ...settings,
    settingsId,
    ...(settingsExists ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }), { merge: true });

  computationWrites.forEach((item) => {
    batch.set(item.ref, cleanObject({
      ...item.computation,
      computationId: item.computationId,
      submittedAt: serverTimestamp(),
      ...(item.exists ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    }), { merge: true });
  });

  await batch.commit();

  return {
    settingsId,
    computationIds: computationWrites.map((item) => item.computationId),
  };
}
