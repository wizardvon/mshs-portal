import {
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Subject } from "../types/loading";
import { createRecord, deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

const firestoreBatchLimit = 450;

function chunkBatchWrites(writes: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  const chunks: Array<Array<(batch: ReturnType<typeof writeBatch>) => void>> = [];
  for (let index = 0; index < writes.length; index += firestoreBatchLimit) {
    chunks.push(writes.slice(index, index + firestoreBatchLimit));
  }
  return chunks;
}

export const subscribeSubjects = (callback: (subjects: Subject[]) => void) =>
  subscribeCollection<Subject>("subjects", callback);

export const createSubject = (subject: Omit<Subject, "subjectId" | "createdAt" | "updatedAt">) =>
  createRecord<Subject>("subjects", "subjectId", subject as Subject);

async function syncSubjectScheduleSettingsToLoadAssignments(
  subjectId: string,
  settings: Partial<Pick<Subject, "units" | "hoursPerSession">>,
) {
  const assignmentsQuery = query(
    collection(db, "loadAssignments"),
    where("subjectId", "==", subjectId),
  );
  const snapshot = await getDocs(assignmentsQuery);
  const writes = snapshot.docs.map((item) => (batch: ReturnType<typeof writeBatch>) => {
    batch.update(item.ref, {
      ...settings,
      updatedAt: serverTimestamp(),
    });
  });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );
}

export async function updateSubject(subjectId: string, subject: Partial<Subject>) {
  await updateRecord<Subject>("subjects", subjectId, subject);

  if (subject.units !== undefined || subject.hoursPerSession !== undefined) {
    await syncSubjectScheduleSettingsToLoadAssignments(subjectId, {
      ...(subject.units !== undefined ? { units: Number(subject.units || 0) } : {}),
      ...(subject.hoursPerSession !== undefined
        ? { hoursPerSession: Number(subject.hoursPerSession || 0) }
        : {}),
    });
  }
}

export const deleteSubject = (subjectId: string) => deleteRecord("subjects", subjectId);
