import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  AcademicTerm,
  ClassEnrollment,
  EnrollmentStudent,
  LoadAssignment,
  Section,
  Subject,
} from "../types/loading";
import { updateRecord } from "./firestoreCrud";

const firestoreBatchLimit = 450;

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "_");
}

function cleanObject<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function chunkBatchWrites(writes: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  const chunks: Array<Array<(batch: ReturnType<typeof writeBatch>) => void>> = [];
  for (let index = 0; index < writes.length; index += firestoreBatchLimit) {
    chunks.push(writes.slice(index, index + firestoreBatchLimit));
  }
  return chunks;
}

export function getEnrollmentId(schoolYear: string, sectionId: string, lrn: string) {
  return [schoolYear, sectionId, lrn].map(safeId).join("__");
}

export function getClassEnrollmentId(
  schoolYear: string,
  term: AcademicTerm,
  sectionId: string,
  subjectId: string,
  lrn: string,
) {
  return [schoolYear, term, sectionId, subjectId, lrn].map(safeId).join("__");
}

export type ClassSubjectEnrollmentInput = {
  section: Section;
  subject: Subject;
  assignment?: LoadAssignment;
};

export const subscribeEnrollmentStudents = (
  callback: (students: EnrollmentStudent[]) => void,
) => {
  const studentsQuery = query(collection(db, "enrollmentStudents"));

  return onSnapshot(studentsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as EnrollmentStudent));
  });
};

export const subscribeClassEnrollments = (
  callback: (enrollments: ClassEnrollment[]) => void,
) => {
  const enrollmentsQuery = query(collection(db, "classEnrollments"));

  return onSnapshot(enrollmentsQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as ClassEnrollment));
  });
};

export async function saveEnrollmentStudent(
  student: Omit<EnrollmentStudent, "enrollmentId" | "createdAt" | "updatedAt">,
) {
  const enrollmentId = getEnrollmentId(student.schoolYear, student.sectionId, student.lrn);

  await setDoc(
    doc(db, "enrollmentStudents", enrollmentId),
    cleanObject({
      ...student,
      enrollmentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );

  return enrollmentId;
}

export const updateEnrollmentStudent = (
  enrollmentId: string,
  student: Partial<EnrollmentStudent>,
) => updateRecord<EnrollmentStudent>("enrollmentStudents", enrollmentId, cleanObject(student));

export const deleteEnrollmentStudent = (enrollmentId: string) =>
  deleteDoc(doc(db, "enrollmentStudents", enrollmentId));

export async function importEnrollmentStudents(
  students: Array<Omit<EnrollmentStudent, "enrollmentId" | "createdAt" | "updatedAt">>,
) {
  const writes = students.map((student) => {
    const enrollmentId = getEnrollmentId(student.schoolYear, student.sectionId, student.lrn);

    return (batch: ReturnType<typeof writeBatch>) => {
      batch.set(
        doc(db, "enrollmentStudents", enrollmentId),
        cleanObject({
          ...student,
          enrollmentId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        { merge: true },
      );
    };
  });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );
}

function buildClassEnrollment(
  student: EnrollmentStudent,
  option: ClassSubjectEnrollmentInput,
  schoolYear: string,
  term: AcademicTerm,
) {
  const classEnrollmentId = getClassEnrollmentId(
    schoolYear,
    term,
    option.section.sectionId,
    option.subject.subjectId,
    student.lrn,
  );

  return cleanObject({
    classEnrollmentId,
    enrollmentId: student.enrollmentId,
    lrn: student.lrn,
    studentName: student.displayName,
    schoolYear,
    term,
    gradeLevel: option.subject.gradeLevel,
    strand: option.section.strand,
    sectionId: option.section.sectionId,
    sectionName: option.section.sectionName,
    subjectId: option.subject.subjectId,
    subjectCode: option.subject.subjectCode,
    subjectName: option.subject.subjectName,
    teacherId: option.assignment?.teacherId,
    status: "enrolled",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function addClassEnrollmentsForStudents({
  options,
  schoolYear,
  students,
  term,
}: {
  options: ClassSubjectEnrollmentInput[];
  schoolYear: string;
  students: EnrollmentStudent[];
  term: AcademicTerm;
}) {
  const activeStudents = students.filter((student) => student.status === "enrolled");
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  activeStudents.forEach((student) => {
    options.forEach((option) => {
      const enrollment = buildClassEnrollment(student, option, schoolYear, term);
      writes.push((batch) => {
        batch.set(
          doc(db, "classEnrollments", enrollment.classEnrollmentId),
          enrollment,
          { merge: true },
        );
      });
    });
  });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );

  return {
    students: activeStudents.length,
    subjects: options.length,
    records: activeStudents.length * options.length,
  };
}

export async function replaceClassEnrollmentsForStudent({
  options,
  schoolYear,
  student,
  term,
}: {
  options: ClassSubjectEnrollmentInput[];
  schoolYear: string;
  student: EnrollmentStudent;
  term: AcademicTerm;
}) {
  const enrollmentsQuery = query(
    collection(db, "classEnrollments"),
    where("enrollmentId", "==", student.enrollmentId),
    where("schoolYear", "==", schoolYear),
    where("term", "==", term),
  );
  const snapshot = await getDocs(enrollmentsQuery);
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  snapshot.docs.forEach((item) => {
    writes.push((batch) => batch.delete(item.ref));
  });

  options.forEach((option) => {
    const enrollment = buildClassEnrollment(student, option, schoolYear, term);
    writes.push((batch) => {
      batch.set(
        doc(db, "classEnrollments", enrollment.classEnrollmentId),
        enrollment,
        { merge: true },
      );
    });
  });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );

  return {
    subjects: options.length,
  };
}

export async function deleteClassEnrollmentsForStudent(enrollmentId: string) {
  const enrollmentsQuery = query(
    collection(db, "classEnrollments"),
    where("enrollmentId", "==", enrollmentId),
  );
  const snapshot = await getDocs(enrollmentsQuery);
  const writes = snapshot.docs.map((item) => (batch: ReturnType<typeof writeBatch>) => {
    batch.delete(item.ref);
  });

  await Promise.all(
    chunkBatchWrites(writes).map((chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((write) => write(batch));
      return batch.commit();
    }),
  );
}
