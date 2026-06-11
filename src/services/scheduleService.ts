import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { AcademicTerm, ClassScheduleEntry } from "../types/loading";
import type { SavedSchedule } from "../types/loading";

const firestoreBatchLimit = 450;

function createSavedScheduleId(name: string, schoolYear: string, term: AcademicTerm, gradeLevel: string, strand: string) {
  return [schoolYear, term, gradeLevel, strand, name, Date.now()]
    .map((value) => String(value).trim().replace(/[^a-zA-Z0-9]/g, "_"))
    .join("__");
}

export const subscribeClassSchedulesByPeriod = (
  schoolYear: string,
  term: AcademicTerm,
  gradeLevel: string,
  callback: (entries: ClassScheduleEntry[]) => void,
) => {
  const schedulesQuery =
    gradeLevel === "all"
      ? query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
        )
      : query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
          where("gradeLevel", "==", gradeLevel),
        );

  return onSnapshot(schedulesQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as ClassScheduleEntry));
  });
};

export const subscribeSavedSchedulesByContext = (
  schoolYear: string,
  term: AcademicTerm,
  gradeLevel: string,
  strand: string,
  callback: (schedules: SavedSchedule[]) => void,
) => {
  const schedulesQuery = query(
    collection(db, "savedSchedules"),
    where("schoolYear", "==", schoolYear),
    where("term", "==", term),
    where("gradeLevel", "==", gradeLevel),
    where("strand", "==", strand),
  );

  return onSnapshot(schedulesQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as SavedSchedule)
        .sort((first, second) => first.name.localeCompare(second.name)),
    );
  });
};

export async function saveNamedSchedule(
  name: string,
  schoolYear: string,
  term: AcademicTerm,
  gradeLevel: string,
  strand: string,
  entries: ClassScheduleEntry[],
  createdBy?: string,
) {
  const trimmedName = name.trim();
  const savedScheduleId = createSavedScheduleId(trimmedName, schoolYear, term, gradeLevel, strand);

  return setDoc(doc(db, "savedSchedules", savedScheduleId), {
    savedScheduleId,
    name: trimmedName,
    schoolYear,
    term,
    gradeLevel,
    strand,
    entries,
    entryCount: entries.length,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveGeneratedSchedule(entries: ClassScheduleEntry[]) {
  const batch = writeBatch(db);

  entries.forEach((entry) => {
    batch.set(
      doc(db, "classSchedules", entry.scheduleId),
      {
        ...entry,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  return batch.commit();
}

function chunkBatchWrites(writes: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  const chunks: Array<Array<(batch: ReturnType<typeof writeBatch>) => void>> = [];
  for (let index = 0; index < writes.length; index += firestoreBatchLimit) {
    chunks.push(writes.slice(index, index + firestoreBatchLimit));
  }
  return chunks;
}

export async function replaceSchedulesByPeriod(
  schoolYear: string,
  term: AcademicTerm,
  gradeLevel: string,
  strandFilter: string,
  entries: ClassScheduleEntry[],
  options: { includeLocked?: boolean } = {},
) {
  const schedulesQuery =
    gradeLevel === "all"
      ? query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
        )
      : query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
          where("gradeLevel", "==", gradeLevel),
        );
  const snapshot = await getDocs(schedulesQuery);
  const nextIds = new Set(entries.map((entry) => entry.scheduleId));
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  snapshot.docs.forEach((item) => {
    const entry = item.data() as ClassScheduleEntry;
    const matchesStrand = strandFilter === "all" || entry.strand === strandFilter;
    if (!matchesStrand || nextIds.has(item.id)) return;
    if (!options.includeLocked && entry.locked) return;

    writes.push((batch) => batch.delete(doc(db, "classSchedules", item.id)));
  });

  entries.forEach((entry) => {
    writes.push((batch) =>
      batch.set(
        doc(db, "classSchedules", entry.scheduleId),
        {
          ...entry,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );
}

export async function deleteSchedulesByPeriod(
  schoolYear: string,
  term: AcademicTerm,
  gradeLevel: string,
  options: { includeLocked?: boolean } = {},
) {
  const schedulesQuery =
    gradeLevel === "all"
      ? query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
        )
      : query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
          where("gradeLevel", "==", gradeLevel),
        );
  const snapshot = await getDocs(schedulesQuery);

  await Promise.all(
    snapshot.docs
      .filter((item) => options.includeLocked || !(item.data() as ClassScheduleEntry).locked)
      .map((item) => deleteDoc(doc(db, "classSchedules", item.id))),
  );
}

export async function resetSchedulesByContextSafely(
  schoolYear: string,
  term: AcademicTerm,
  gradeLevel: string,
  strandFilter: string,
) {
  const schedulesQuery =
    gradeLevel === "all"
      ? query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
        )
      : query(
          collection(db, "classSchedules"),
          where("schoolYear", "==", schoolYear),
          where("term", "==", term),
          where("gradeLevel", "==", gradeLevel),
        );
  const snapshot = await getDocs(schedulesQuery);
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  snapshot.docs.forEach((item) => {
    const entry = item.data() as ClassScheduleEntry;
    if (strandFilter !== "all" && entry.strand !== strandFilter) return;
    writes.push((batch) => batch.delete(doc(db, "classSchedules", item.id)));
  });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );
}

export async function saveScheduleEntry(entry: ClassScheduleEntry) {
  return setDoc(
    doc(db, "classSchedules", entry.scheduleId),
    {
      ...entry,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateScheduleLock(scheduleId: string, locked: boolean) {
  return updateDoc(doc(db, "classSchedules", scheduleId), {
    locked,
    updatedAt: serverTimestamp(),
  });
}
