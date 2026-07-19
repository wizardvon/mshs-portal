import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { MpsRequest, MpsSubmission } from "../types/loading";

export const subscribeMpsRequests = (callback: (requests: MpsRequest[]) => void): Unsubscribe => {
  const requestsQuery = query(collection(db, "mpsRequests"), orderBy("createdAt", "desc"));

  return onSnapshot(requestsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as MpsRequest));
  });
};

export async function createMpsRequest(
  request: Omit<MpsRequest, "requestId" | "createdAt" | "updatedAt">,
) {
  const ref = doc(collection(db, "mpsRequests"));
  await setDoc(ref, {
    ...request,
    requestId: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export const updateMpsRequest = (requestId: string, request: Partial<MpsRequest>) =>
  updateDoc(doc(db, "mpsRequests", requestId), {
    ...request,
    updatedAt: serverTimestamp(),
  });

export async function deleteMpsRequest(requestId: string) {
  const submissionsSnapshot = await getDocs(query(collection(db, "mpsSubmissions"), where("requestId", "==", requestId)));
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  const queueDelete = (documentRef: (typeof submissionsSnapshot.docs)[number]["ref"]) => {
    batch.delete(documentRef);
    operationCount += 1;

    if (operationCount === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      operationCount = 0;
    }
  };

  submissionsSnapshot.docs.forEach((submissionDoc) => queueDelete(submissionDoc.ref));
  queueDelete(doc(db, "mpsRequests", requestId));

  if (operationCount > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  return submissionsSnapshot.size;
}

export const subscribeMpsSubmissions = (
  callback: (submissions: MpsSubmission[]) => void,
  teacherId?: string,
): Unsubscribe => {
  const constraints = teacherId ? [where("teacherId", "==", teacherId)] : [orderBy("createdAt", "desc")];
  const submissionsQuery = query(collection(db, "mpsSubmissions"), ...constraints);

  return onSnapshot(submissionsQuery, (snapshot) => {
    const submissions = snapshot.docs.map((item) => item.data() as MpsSubmission);
    callback(
      submissions.sort((first, second) => {
        const left = first.createdAt?.toMillis?.() ?? 0;
        const right = second.createdAt?.toMillis?.() ?? 0;
        return right - left;
      }),
    );
  });
};

export async function upsertMpsSubmission(
  submission: Omit<MpsSubmission, "submissionId" | "submittedAt" | "createdAt" | "updatedAt"> & {
    submissionId?: string;
  },
) {
  if (submission.submissionId) {
    await updateDoc(doc(db, "mpsSubmissions", submission.submissionId), {
      ...submission,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return submission.submissionId;
  }

  const ref = doc(collection(db, "mpsSubmissions"));
  await setDoc(ref, {
    ...submission,
    submissionId: ref.id,
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function deleteAllMpsRecords() {
  const [requestSnapshot, submissionSnapshot] = await Promise.all([
    getDocs(collection(db, "mpsRequests")),
    getDocs(collection(db, "mpsSubmissions")),
  ]);
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  const queueDelete = (documentRef: (typeof submissionSnapshot.docs)[number]["ref"]) => {
    batch.delete(documentRef);
    operationCount += 1;

    if (operationCount === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      operationCount = 0;
    }
  };

  requestSnapshot.docs.forEach((requestDoc) => queueDelete(requestDoc.ref));
  submissionSnapshot.docs.forEach((submissionDoc) => queueDelete(submissionDoc.ref));

  if (operationCount > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  return {
    requestCount: requestSnapshot.size,
    submissionCount: submissionSnapshot.size,
  };
}
