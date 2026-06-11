import type { Teacher } from "../types/loading";
import { createRecord, deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

export const subscribeTeachers = (callback: (teachers: Teacher[]) => void) =>
  subscribeCollection<Teacher>("teachers", callback);

export const createTeacher = (teacher: Omit<Teacher, "teacherId" | "createdAt" | "updatedAt">) =>
  createRecord<Teacher>("teachers", "teacherId", teacher as Teacher);

export const updateTeacher = (teacherId: string, teacher: Partial<Teacher>) =>
  updateRecord<Teacher>("teachers", teacherId, teacher);

export const deleteTeacher = (teacherId: string) => deleteRecord("teachers", teacherId);
