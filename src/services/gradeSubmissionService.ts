import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { GradeSubmission } from "../types/loading";

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "_");
}

export function getGradeSubmissionId(assignmentId: string, enrollmentId: string) {
  return [assignmentId, enrollmentId].map(safeId).join("__");
}

export const subscribeGradeSubmissionsByTeacher = (
  teacherId: string,
  callback: (submissions: GradeSubmission[]) => void,
): Unsubscribe => {
  if (!teacherId) {
    callback([]);
    return () => undefined;
  }

  const submissionsQuery = query(
    collection(db, "gradeSubmissions"),
    where("teacherId", "==", teacherId),
  );

  return onSnapshot(submissionsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as GradeSubmission));
  });
};

export const subscribeGradeSubmissionsBySection = (
  sectionId: string,
  callback: (submissions: GradeSubmission[]) => void,
): Unsubscribe => {
  if (!sectionId) {
    callback([]);
    return () => undefined;
  }

  const submissionsQuery = query(
    collection(db, "gradeSubmissions"),
    where("sectionId", "==", sectionId),
  );

  return onSnapshot(submissionsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as GradeSubmission));
  });
};

export const subscribeAllGradeSubmissions = (
  callback: (submissions: GradeSubmission[]) => void,
): Unsubscribe => {
  const submissionsQuery = query(collection(db, "gradeSubmissions"));

  return onSnapshot(submissionsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as GradeSubmission));
  });
};

export async function upsertGradeSubmission(
  submission: Omit<GradeSubmission, "gradeSubmissionId" | "submittedAt" | "createdAt" | "updatedAt">,
  exists: boolean,
) {
  const gradeSubmissionId = getGradeSubmissionId(
    submission.assignmentId,
    submission.enrollmentId,
  );

  const submissionRef = doc(db, "gradeSubmissions", gradeSubmissionId);

  if (exists) {
    await updateDoc(submissionRef, {
      ...submission,
      gradeSubmissionId,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(submissionRef, {
      ...submission,
      gradeSubmissionId,
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return gradeSubmissionId;
}

export async function upsertGradeSubmissions(
  submissions: Array<{
    exists: boolean;
    submission: Omit<GradeSubmission, "gradeSubmissionId" | "submittedAt" | "createdAt" | "updatedAt">;
  }>,
) {
  await Promise.all(
    submissions.map(({ exists, submission }) =>
      upsertGradeSubmission(submission, exists),
    ),
  );
}
