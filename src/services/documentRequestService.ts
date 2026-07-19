import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { DocumentRequest, DocumentRequestSubmission } from "../types/loading";

export function subscribeDocumentRequests(callback: (requests: DocumentRequest[]) => void): Unsubscribe {
  const requestsQuery = query(collection(db, "documentRequests"), orderBy("createdAt", "desc"));

  return onSnapshot(requestsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as DocumentRequest));
  });
}

export function subscribeDocumentRequestSubmissions(callback: (submissions: DocumentRequestSubmission[]) => void): Unsubscribe {
  const submissionsQuery = query(collection(db, "documentRequestSubmissions"), orderBy("createdAt", "desc"));

  return onSnapshot(submissionsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as DocumentRequestSubmission));
  });
}

export async function createDocumentRequest(
  request: Omit<DocumentRequest, "requestId" | "createdAt" | "updatedAt">,
) {
  const ref = doc(collection(db, "documentRequests"));

  await setDoc(ref, {
    ...request,
    requestId: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export function updateDocumentRequest(requestId: string, request: Partial<DocumentRequest>) {
  return updateDoc(doc(db, "documentRequests", requestId), {
    ...request,
    updatedAt: serverTimestamp(),
  });
}

export async function upsertDocumentRequestSubmission(
  submission: Omit<
    DocumentRequestSubmission,
    "submissionId" | "status" | "remarks" | "confirmedBy" | "confirmerName" | "submittedAt" | "confirmedAt" | "createdAt" | "updatedAt"
  > & { submissionId?: string },
) {
  if (submission.submissionId) {
    await updateDoc(doc(db, "documentRequestSubmissions", submission.submissionId), {
      ...submission,
      status: "submitted",
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return submission.submissionId;
  }

  const ref = doc(collection(db, "documentRequestSubmissions"));

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

export function reviewDocumentRequestSubmission(
  submissionId: string,
  review: Pick<DocumentRequestSubmission, "status" | "remarks" | "confirmedBy" | "confirmerName">,
) {
  return updateDoc(doc(db, "documentRequestSubmissions", submissionId), {
    ...review,
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
