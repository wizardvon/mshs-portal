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
import type { DllRequest, DllSubmission } from "../types/loading";

export const subscribeDllRequests = (callback: (requests: DllRequest[]) => void): Unsubscribe => {
  const requestsQuery = query(collection(db, "dllRequests"), orderBy("createdAt", "desc"));

  return onSnapshot(requestsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as DllRequest));
  });
};

export async function createDllRequest(
  request: Omit<DllRequest, "requestId" | "createdAt" | "updatedAt">,
) {
  const ref = doc(collection(db, "dllRequests"));
  await setDoc(ref, {
    ...request,
    requestId: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export const updateDllRequest = (requestId: string, request: Partial<DllRequest>) =>
  updateDoc(doc(db, "dllRequests", requestId), {
    ...request,
    updatedAt: serverTimestamp(),
  });

export const subscribeDllSubmissions = (
  callback: (submissions: DllSubmission[]) => void,
  teacherId?: string,
): Unsubscribe => {
  const constraints = teacherId ? [where("teacherId", "==", teacherId)] : [orderBy("createdAt", "desc")];
  const submissionsQuery = query(collection(db, "dllSubmissions"), ...constraints);

  return onSnapshot(submissionsQuery, (snapshot) => {
    const submissions = snapshot.docs.map((item) => item.data() as DllSubmission);
    callback(
      submissions.sort((a, b) => {
        const left = a.createdAt?.toMillis?.() ?? 0;
        const right = b.createdAt?.toMillis?.() ?? 0;
        return right - left;
      }),
    );
  });
};

export async function upsertDllSubmission(
  submission: Omit<
    DllSubmission,
    "submissionId" | "status" | "remarks" | "reviewedBy" | "reviewerName" | "reviewedAt" | "submittedAt" | "createdAt" | "updatedAt"
  > & { submissionId?: string },
) {
  if (submission.submissionId) {
    await updateDoc(doc(db, "dllSubmissions", submission.submissionId), {
      ...submission,
      status: "submitted",
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return submission.submissionId;
  }

  const ref = doc(collection(db, "dllSubmissions"));

  await setDoc(ref, {
    ...submission,
    submissionId: ref.id,
    status: "submitted",
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export const reviewDllSubmission = (
  submissionId: string,
  review: Pick<DllSubmission, "status" | "remarks" | "reviewedBy" | "reviewerName">,
) =>
  updateDoc(doc(db, "dllSubmissions", submissionId), {
    ...review,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

export async function archiveAllDllSubmissions() {
  const snapshot = await getDocs(collection(db, "dllSubmissions"));
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  snapshot.docs.forEach((submissionDoc) => {
    batch.update(submissionDoc.ref, {
      archived: true,
      updatedAt: serverTimestamp(),
    });
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

export async function deleteAllDllSubmissions() {
  const [submissionSnapshot, requestSnapshot] = await Promise.all([
    getDocs(collection(db, "dllSubmissions")),
    getDocs(collection(db, "dllRequests")),
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

  submissionSnapshot.docs.forEach((submissionDoc) => queueDelete(submissionDoc.ref));
  requestSnapshot.docs.forEach((requestDoc) => queueDelete(requestDoc.ref));

  if (operationCount > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  return {
    requestCount: requestSnapshot.size,
    submissionCount: submissionSnapshot.size,
  };
}
