import {
  collection,
  deleteDoc,
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
import type { TosiaAssessment, TosiaRequest } from "../types/loading";

const collectionName = "tosiaAssessments";
const requestCollectionName = "tosiaRequests";

export const subscribeTosiaRequests = (callback: (requests: TosiaRequest[]) => void): Unsubscribe => {
  const requestsQuery = query(collection(db, requestCollectionName), orderBy("createdAt", "desc"));

  return onSnapshot(requestsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as TosiaRequest));
  });
};

export async function createTosiaRequest(
  request: Omit<TosiaRequest, "requestId" | "createdAt" | "updatedAt">,
) {
  const ref = doc(collection(db, requestCollectionName));
  await setDoc(ref, {
    ...request,
    requestId: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export const updateTosiaRequest = (requestId: string, request: Partial<TosiaRequest>) =>
  updateDoc(doc(db, requestCollectionName, requestId), {
    ...request,
    updatedAt: serverTimestamp(),
  });

export async function deleteTosiaRequest(requestId: string) {
  const assessmentsSnapshot = await getDocs(query(collection(db, collectionName), where("requestId", "==", requestId)));
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  const queueDelete = (documentRef: (typeof assessmentsSnapshot.docs)[number]["ref"]) => {
    batch.delete(documentRef);
    operationCount += 1;

    if (operationCount === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      operationCount = 0;
    }
  };

  assessmentsSnapshot.docs.forEach((assessmentDoc) => queueDelete(assessmentDoc.ref));
  queueDelete(doc(db, requestCollectionName, requestId));

  if (operationCount > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  return assessmentsSnapshot.size;
}

export async function deleteAllTosiaRecords() {
  const [requestSnapshot, assessmentSnapshot] = await Promise.all([
    getDocs(collection(db, requestCollectionName)),
    getDocs(collection(db, collectionName)),
  ]);
  const batches = [];
  let batch = writeBatch(db);
  let operationCount = 0;

  const queueDelete = (documentRef: (typeof assessmentSnapshot.docs)[number]["ref"]) => {
    batch.delete(documentRef);
    operationCount += 1;

    if (operationCount === 500) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      operationCount = 0;
    }
  };

  requestSnapshot.docs.forEach((requestDoc) => queueDelete(requestDoc.ref));
  assessmentSnapshot.docs.forEach((assessmentDoc) => queueDelete(assessmentDoc.ref));

  if (operationCount > 0) {
    batches.push(batch.commit());
  }

  await Promise.all(batches);
  return {
    requestCount: requestSnapshot.size,
    assessmentCount: assessmentSnapshot.size,
  };
}

export const subscribeTosiaAssessments = (
  callback: (assessments: TosiaAssessment[]) => void,
  teacherId?: string,
): Unsubscribe => {
  const constraints = teacherId ? [where("teacherId", "==", teacherId)] : [orderBy("updatedAt", "desc")];
  const assessmentsQuery = query(collection(db, collectionName), ...constraints);

  return onSnapshot(assessmentsQuery, (snapshot) => {
    const assessments = snapshot.docs.map((item) => item.data() as TosiaAssessment);
    callback(
      assessments.sort((first, second) => {
        const left = first.updatedAt?.toMillis?.() ?? first.createdAt?.toMillis?.() ?? 0;
        const right = second.updatedAt?.toMillis?.() ?? second.createdAt?.toMillis?.() ?? 0;
        return right - left;
      }),
    );
  });
};

export async function saveTosiaAssessment(
  assessment: Omit<TosiaAssessment, "assessmentId" | "createdAt" | "updatedAt"> & {
    assessmentId?: string;
  },
) {
  if (assessment.assessmentId) {
    await updateDoc(doc(db, collectionName, assessment.assessmentId), {
      ...assessment,
      updatedAt: serverTimestamp(),
    });

    return assessment.assessmentId;
  }

  const ref = doc(collection(db, collectionName));
  await setDoc(ref, {
    ...assessment,
    assessmentId: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export const deleteTosiaAssessment = (assessmentId: string) =>
  deleteDoc(doc(db, collectionName, assessmentId));
