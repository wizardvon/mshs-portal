import type { Subject } from "../types/loading";
import { createRecord, deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

export const subscribeSubjects = (callback: (subjects: Subject[]) => void) =>
  subscribeCollection<Subject>("subjects", callback);

export const createSubject = (subject: Omit<Subject, "subjectId" | "createdAt" | "updatedAt">) =>
  createRecord<Subject>("subjects", "subjectId", subject as Subject);

export const updateSubject = (subjectId: string, subject: Partial<Subject>) =>
  updateRecord<Subject>("subjects", subjectId, subject);

export const deleteSubject = (subjectId: string) => deleteRecord("subjects", subjectId);
