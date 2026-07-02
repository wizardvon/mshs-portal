import type { Timestamp } from "firebase/firestore";

export type SubjectCategory =
  | "Core Subjects"
  | "Applied / Specialized Subjects"
  | "Track / Strand Subjects"
  | "Electives / Others";

export type LoadStatus =
  | "Under Teaching Load"
  | "Normal Teaching Load"
  | "Full Teaching Load"
  | "Over Teaching Load";
export type RecordStatus = "active" | "inactive";
export type AcademicTerm = "1st Term" | "2nd Term" | "3rd Term";
export type ScheduleDay = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";
export type DllRequestStatus = "active" | "closed";
export type DllSubmissionType = "soft_copy" | "hard_copy";
export type DllSubmissionStatus = "submitted" | "approved" | "returned";

export type Teacher = {
  teacherId: string;
  fullName: string;
  position: string;
  specialization: string;
  maxLoad: number;
  status: RecordStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Subject = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  category: SubjectCategory;
  units: number;
  hoursPerSession?: number;
  gradeLevel: string;
  strand: string;
  term: AcademicTerm;
  status: RecordStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Section = {
  sectionId: string;
  sectionName: string;
  gradeLevel: string;
  track: string;
  strand: string;
  room?: string;
  schoolYear: string;
  status: RecordStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type CurriculumMapping = {
  mappingId: string;
  schoolYear: string;
  gradeLevel: string;
  strand: string;
  term: AcademicTerm;
  sectionId: string;
  subjectId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type LoadAssignment = {
  assignmentId: string;
  schoolYear: string;
  term: AcademicTerm;
  gradeLevel: string;
  strand: string;
  subjectId: string;
  sectionId: string;
  teacherId: string;
  units: number;
  hoursPerSession?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ClassScheduleEntry = {
  scheduleId: string;
  schoolYear: string;
  term: AcademicTerm;
  gradeLevel: string;
  strand: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  room?: string;
  day: ScheduleDay;
  startTime: string;
  endTime: string;
  duration: number;
  slotId: string;
  sourceAssignmentId: string;
  locked?: boolean;
  custom?: boolean;
  customTitle?: string;
  customDetails?: string;
  templateType?: "grade11_academic" | "grade11_techpro" | "grade12";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type SavedSchedule = {
  savedScheduleId: string;
  name: string;
  schoolYear: string;
  term: AcademicTerm;
  gradeLevel: string;
  strand: string;
  entries: ClassScheduleEntry[];
  entryCount: number;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type AncillaryLoad = {
  ancillaryLoadId: string;
  teacherId: string;
  schoolYear: string;
  ancillary: string;
  units: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type PrintSignatory = {
  name: string;
  position: string;
};

export type SchedulePrintSignatories = {
  preparedBy: PrintSignatory;
  checkedBy: PrintSignatory;
  notedBy: PrintSignatory;
};

export type ScheduleTemplateKey = "grade11Academic" | "grade11TechPro" | "grade12";

export type ScheduleTimeSlot = {
  slotId: string;
  startTime: string;
  endTime: string;
  duration: number;
  label: string;
};

export type ScheduleBreak = {
  breakId: string;
  label: string;
  startTime: string;
  endTime: string;
};

export type ScheduleTimeSlotSettings = Record<ScheduleTemplateKey, ScheduleTimeSlot[]>;
export type ScheduleBreakSettings = Record<ScheduleTemplateKey, ScheduleBreak[]>;

export type SchedulePrintSettings = {
  classSchedule: SchedulePrintSignatories;
  teacherSchedule: SchedulePrintSignatories;
  scheduleTimeSlots: ScheduleTimeSlotSettings;
  scheduleBreaks: ScheduleBreakSettings;
  updatedAt?: Timestamp;
};

export type DllRequest = {
  requestId: string;
  title: string;
  schoolYear: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  dueDate: string;
  instructions?: string;
  status: DllRequestStatus;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type DllSubmission = {
  submissionId: string;
  requestId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  submittedBy: string;
  submissionType: DllSubmissionType;
  link?: string;
  status: DllSubmissionStatus;
  remarks?: string;
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: Timestamp;
  submittedAt?: Timestamp;
  archived?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export const subjectCategories: SubjectCategory[] = [
  "Core Subjects",
  "Applied / Specialized Subjects",
  "Track / Strand Subjects",
  "Electives / Others",
];

export const defaultSchoolYear = "2026-2027";
export const termOptions: AcademicTerm[] = ["1st Term", "2nd Term", "3rd Term"];
export const defaultTerm: AcademicTerm = "1st Term";
