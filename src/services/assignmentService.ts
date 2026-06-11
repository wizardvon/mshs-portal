import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { LoadAssignment } from "../types/loading";
import { subscribeCollection } from "./firestoreCrud";

export const subscribeLoadAssignments = (
  callback: (assignments: LoadAssignment[]) => void,
) => subscribeCollection<LoadAssignment>("loadAssignments", callback, []);

export const subscribeLoadAssignmentsByPeriod = (
  schoolYear: string,
  term: string,
  callback: (assignments: LoadAssignment[]) => void,
) => {
  const assignmentsQuery = query(
    collection(db, "loadAssignments"),
    where("schoolYear", "==", schoolYear),
    where("term", "==", term),
  );

  return onSnapshot(assignmentsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as LoadAssignment));
  });
};

export function getAssignmentId(
  schoolYear: string,
  term: string,
  subjectId: string,
  sectionId: string,
) {
  return [schoolYear, term, subjectId, sectionId]
    .map((value) => value.replace(/[^a-zA-Z0-9]/g, "_"))
    .join("__");
}

export async function saveLoadAssignment(
  assignment: Omit<LoadAssignment, "assignmentId" | "createdAt" | "updatedAt">,
) {
  const assignmentId = getAssignmentId(
    assignment.schoolYear,
    assignment.term,
    assignment.subjectId,
    assignment.sectionId,
  );

  return setDoc(
    doc(db, "loadAssignments", assignmentId),
    {
      ...assignment,
      assignmentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeLoadAssignment(
  schoolYear: string,
  term: string,
  subjectId: string,
  sectionId: string,
) {
  return deleteDoc(
    doc(db, "loadAssignments", getAssignmentId(schoolYear, term, subjectId, sectionId)),
  );
}
