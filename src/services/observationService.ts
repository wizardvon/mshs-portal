import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { ObservationSchedule } from "../types/loading";

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as T;
}

export const subscribeObservationSchedules = (
  callback: (schedules: ObservationSchedule[]) => void,
  filters: { teacherId?: string; observerId?: string } = {},
): Unsubscribe => {
  const constraints = [];
  if (filters.teacherId) constraints.push(where("teacherId", "==", filters.teacherId));
  if (filters.observerId) constraints.push(where("observerId", "==", filters.observerId));
  return onSnapshot(query(collection(db, "observationSchedules"), ...constraints), (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as ObservationSchedule)
        .sort((first, second) => `${first.scheduleDate} ${first.startTime}`.localeCompare(`${second.scheduleDate} ${second.startTime}`)),
    );
  });
};

export async function createObservationSchedule(
  schedule: Omit<ObservationSchedule, "observationId" | "createdAt" | "updatedAt">,
) {
  const ref = doc(collection(db, "observationSchedules"));
  await setDoc(ref, {
    ...withoutUndefined(schedule),
    observationId: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export const updateObservationSchedule = (
  observationId: string,
  updates: Partial<ObservationSchedule>,
) =>
  updateDoc(doc(db, "observationSchedules", observationId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });

export const updateObservationStatus = (
  observationId: string,
  status: ObservationSchedule["status"],
) =>
  updateDoc(doc(db, "observationSchedules", observationId), {
    status,
    ...(status === "done" ? { completedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });

export async function deleteAllObservationSchedules() {
  const snapshot = await getDocs(collection(db, "observationSchedules"));
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  snapshot.docs.forEach((scheduleDoc) => {
    batch.delete(scheduleDoc.ref);
    operationCount += 1;

    if (operationCount === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      operationCount = 0;
    }
  });

  if (operationCount > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  return snapshot.size;
}
