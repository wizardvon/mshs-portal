import {
  collection,
  doc,
  getDoc,
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
import type {
  PersonnelAttendanceRecord,
  PersonnelCreditBalance,
  PersonnelCreditLog,
  PersonnelCreditType,
  PersonnelStaffType,
} from "../types/loading";

type CreditWrite = Omit<PersonnelCreditBalance, "creditId" | "createdAt" | "updatedAt">;
type CreditLogWrite = Omit<PersonnelCreditLog, "logId" | "createdAt">;

function getAttendanceId(attendanceDate: string, staffType: PersonnelStaffType, staffId: string) {
  return [attendanceDate, staffType, staffId].join("__").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getCreditLogId() {
  return doc(collection(db, "personnelCreditLogs")).id;
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

export function subscribePersonnelCreditLogs(
  callback: (logs: PersonnelCreditLog[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "personnelCreditLogs"), (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as PersonnelCreditLog)
        .sort((first, second) => {
          const firstTime = first.createdAt?.toMillis?.() ?? 0;
          const secondTime = second.createdAt?.toMillis?.() ?? 0;
          return secondTime - firstTime || first.staffName.localeCompare(second.staffName);
        }),
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

export async function adjustPersonnelCredit(
  credit: CreditWrite,
  creditType: PersonnelCreditType,
  amount: number,
  remarks: string,
) {
  const currentSnapshot = await getDoc(doc(db, "personnelCredits", credit.staffId));
  const currentCredit = currentSnapshot.exists() ? (currentSnapshot.data() as PersonnelCreditBalance) : null;
  const previousBalance = currentCredit?.[creditType] ?? 0;
  const newBalance = previousBalance + amount;
  const logId = getCreditLogId();

  if (newBalance < 0) {
    throw new Error("Credit balance cannot go below zero.");
  }

  await setDoc(
    doc(db, "personnelCredits", credit.staffId),
    {
      ...credit,
      creditId: credit.staffId,
      specialOrderServiceCredit: currentCredit?.specialOrderServiceCredit ?? credit.specialOrderServiceCredit,
      localServiceCredit: currentCredit?.localServiceCredit ?? credit.localServiceCredit,
      wellnessBreak: currentCredit?.wellnessBreak ?? credit.wellnessBreak,
      leaveCredits: currentCredit?.leaveCredits ?? credit.leaveCredits,
      [creditType]: newBalance,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(doc(db, "personnelCreditLogs", logId), {
    logId,
    staffId: credit.staffId,
    staffName: credit.staffName,
    staffType: credit.staffType,
    roleOrPosition: credit.roleOrPosition,
    creditType,
    source: "manual_adjustment",
    amount,
    previousBalance,
    newBalance,
    remarks,
    createdBy: credit.updatedBy,
    creatorName: credit.updaterName,
    createdAt: serverTimestamp(),
  });

  return logId;
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
  creditUpdates: CreditWrite[] = [],
  creditLogs: CreditLogWrite[] = [],
) {
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  function commitWhenFull() {
    if (operationCount < 500) return;
    batches.push(batch.commit());
    batch = writeBatch(db);
    operationCount = 0;
  }

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
    commitWhenFull();
  });

  creditUpdates.forEach((credit) => {
    batch.set(
      doc(db, "personnelCredits", credit.staffId),
      {
        ...credit,
        creditId: credit.staffId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    operationCount += 1;
    commitWhenFull();
  });

  creditLogs.forEach((log) => {
    const logId = getCreditLogId();
    batch.set(doc(db, "personnelCreditLogs", logId), {
      ...log,
      logId,
      createdAt: serverTimestamp(),
    });
    operationCount += 1;
    commitWhenFull();
  });

  if (operationCount > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  return records.length;
}

export { getAttendanceId };

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
