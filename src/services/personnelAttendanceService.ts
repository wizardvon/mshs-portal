import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { PersonnelAttendanceRecord, PersonnelCreditBalance, PersonnelStaffType } from "../types/loading";

function getAttendanceId(attendanceDate: string, staffType: PersonnelStaffType, staffId: string) {
  return [attendanceDate, staffType, staffId].join("__").replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function subscribePersonnelAttendanceByDate(
  attendanceDate: string,
  callback: (records: PersonnelAttendanceRecord[]) => void,
): Unsubscribe {
  const attendanceQuery = query(
    collection(db, "personnelAttendance"),
    where("attendanceDate", "==", attendanceDate),
  );

  return onSnapshot(attendanceQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as PersonnelAttendanceRecord)
        .sort((first, second) => first.staffName.localeCompare(second.staffName)),
    );
  });
}

export function subscribePersonnelAttendanceByDateRange(
  startDate: string,
  endDate: string,
  callback: (records: PersonnelAttendanceRecord[]) => void,
): Unsubscribe {
  const attendanceQuery = query(
    collection(db, "personnelAttendance"),
    where("attendanceDate", ">=", startDate),
    where("attendanceDate", "<=", endDate),
  );

  return onSnapshot(attendanceQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as PersonnelAttendanceRecord)
        .sort(
          (first, second) =>
            second.attendanceDate.localeCompare(first.attendanceDate) ||
            first.staffName.localeCompare(second.staffName),
        ),
    );
  });
}

export function subscribePersonnelAttendanceByStaff(
  staffId: string,
  callback: (records: PersonnelAttendanceRecord[]) => void,
): Unsubscribe {
  if (!staffId) {
    callback([]);
    return () => undefined;
  }

  const attendanceQuery = query(
    collection(db, "personnelAttendance"),
    where("staffId", "==", staffId),
  );

  return onSnapshot(attendanceQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as PersonnelAttendanceRecord)
        .sort((first, second) => second.attendanceDate.localeCompare(first.attendanceDate)),
    );
  });
}

export function subscribePersonnelCredits(
  callback: (credits: PersonnelCreditBalance[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "personnelCredits"), (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as PersonnelCreditBalance)
        .sort((first, second) => first.staffName.localeCompare(second.staffName)),
    );
  });
}

export function subscribePersonnelCredit(
  staffId: string,
  callback: (credit: PersonnelCreditBalance | null) => void,
): Unsubscribe {
  if (!staffId) {
    callback(null);
    return () => undefined;
  }

  return onSnapshot(doc(db, "personnelCredits", staffId), (snapshot) => {
    callback(snapshot.exists() ? (snapshot.data() as PersonnelCreditBalance) : null);
  });
}

export async function upsertPersonnelCredit(
  credit: Omit<PersonnelCreditBalance, "creditId" | "createdAt" | "updatedAt">,
) {
  await setDoc(
    doc(db, "personnelCredits", credit.staffId),
    {
      ...credit,
      creditId: credit.staffId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return credit.staffId;
}

export async function upsertPersonnelAttendance(
  record: Omit<PersonnelAttendanceRecord, "attendanceId" | "createdAt" | "updatedAt">,
) {
  const attendanceId = getAttendanceId(record.attendanceDate, record.staffType, record.staffId);

  await setDoc(
    doc(db, "personnelAttendance", attendanceId),
    {
      ...record,
      attendanceId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return attendanceId;
}

export async function upsertPersonnelAttendanceBatch(
  records: Array<Omit<PersonnelAttendanceRecord, "attendanceId" | "createdAt" | "updatedAt">>,
) {
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  records.forEach((record) => {
    const attendanceId = getAttendanceId(record.attendanceDate, record.staffType, record.staffId);
    batch.set(
      doc(db, "personnelAttendance", attendanceId),
      {
        ...record,
        attendanceId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
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
  return records.length;
}

export async function deleteAllPersonnelAttendance() {
  const snapshot = await getDocs(collection(db, "personnelAttendance"));
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  snapshot.docs.forEach((attendanceDoc) => {
    batch.delete(attendanceDoc.ref);
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

export async function deletePersonnelAttendanceByDate(attendanceDate: string) {
  const snapshot = await getDocs(query(
    collection(db, "personnelAttendance"),
    where("attendanceDate", "==", attendanceDate),
  ));
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  snapshot.docs.forEach((attendanceDoc) => {
    batch.delete(attendanceDoc.ref);
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
