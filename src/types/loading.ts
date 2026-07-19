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
export type DocumentRequestStatus = "active" | "closed";
export type DocumentRequestType = "soft_copy" | "hard_copy" | "both";
export type DocumentRequestSubmissionStatus = "submitted" | "confirmed" | "returned";
export type MpsRequestStatus = "active" | "closed";
export type ObservationActivityType = "classroom_observation" | "coaching_mentoring";
export type ClassroomObservationType = "Formal (CO)" | "Informal (ICO)" | "Walkthrough" | "Other";
export type ObservationStatus = "scheduled" | "done" | "cancelled";
export type PersonnelStaffType = "teaching" | "non_teaching";
export type PersonnelAttendanceStatus = "present" | "absent" | "official_business";
export type EnrollmentStatus = "enrolled" | "transferred" | "dropped";

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
  loadHours?: number;
  subjectUnits?: number;
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

export type EnrollmentStudent = {
  enrollmentId: string;
  lrn: string;
  displayName: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  sex?: string;
  age?: number;
  birthDate?: string;
  shsAdmissionDate?: string;
  completedLevel?: string;
  completionDate?: string;
  jhsGeneralAverage?: string;
  oldHsGeneralAverage?: string;
  peptRating?: string;
  alsRating?: string;
  assessmentDate?: string;
  learningCenter?: string;
  previousSchoolName?: string;
  previousSchoolAddress?: string;
  eligibilityNotes?: string;
  schoolYear: string;
  gradeLevel: string;
  strand: string;
  sectionId: string;
  sectionName: string;
  status: EnrollmentStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ClassEnrollment = {
  classEnrollmentId: string;
  enrollmentId: string;
  lrn: string;
  studentName: string;
  schoolYear: string;
  term: AcademicTerm;
  gradeLevel: string;
  strand: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId?: string;
  status: EnrollmentStatus;
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
  loadHours?: number;
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
  loadHours?: number;
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

export type AcademicSettings = {
  currentSchoolYear: string;
  currentTerm: AcademicTerm;
  hideInactiveDashboardCards?: boolean;
  updatedAt?: Timestamp;
};

export type DllRequest = {
  requestId: string;
  title: string;
  schoolYear: string;
  term?: AcademicTerm;
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
  schoolYear?: string;
  term?: AcademicTerm;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  submittedBy: string;
  submissionType: DllSubmissionType;
  link?: string;
  submittedTo?: string;
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

export type DocumentRequest = {
  requestId: string;
  title: string;
  description: string;
  dueDate: string;
  requestType: DocumentRequestType;
  status: DocumentRequestStatus;
  targetUserIds: string[];
  targetGroup: "manual" | "all_personnel" | "all_teachers" | "all_admin";
  createdBy: string;
  creatorName: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type DocumentRequestSubmission = {
  submissionId: string;
  requestId: string;
  requestTitle: string;
  targetUserId: string;
  targetName: string;
  submittedBy: string;
  submissionType: DocumentRequestType;
  link?: string;
  hardCopyNote?: string;
  status: DocumentRequestSubmissionStatus;
  remarks?: string;
  confirmedBy?: string;
  confirmerName?: string;
  submittedAt?: Timestamp;
  confirmedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type PersonnelAttendanceRecord = {
  attendanceId: string;
  attendanceDate: string;
  staffType: PersonnelStaffType;
  staffId: string;
  staffName: string;
  roleOrPosition: string;
  status: PersonnelAttendanceStatus;
  remarks: string;
  recordedBy: string;
  recorderName: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type PersonnelCreditBalance = {
  creditId: string;
  staffId: string;
  staffName: string;
  staffType: PersonnelStaffType;
  roleOrPosition: string;
  specialOrderServiceCredit: number;
  localServiceCredit: number;
  wellnessBreak: number;
  leaveCredits: number;
  remarks?: string;
  updatedBy: string;
  updaterName: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ObservationSchedule = {
  observationId: string;
  schoolYear: string;
  term: AcademicTerm;
  teacherId: string;
  teacherName: string;
  observerId: string;
  observerName: string;
  observerRole?: string;
  activityType: ObservationActivityType;
  observationType?: ClassroomObservationType;
  scheduleDate: string;
  day: ScheduleDay;
  startTime: string;
  endTime: string;
  subjectId?: string;
  subjectName?: string;
  sectionId?: string;
  sectionName?: string;
  room?: string;
  notes?: string;
  status: ObservationStatus;
  completedAt?: Timestamp;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type MpsRequest = {
  requestId: string;
  title: string;
  schoolYear: string;
  term: AcademicTerm;
  testName: string;
  dueDate: string;
  instructions?: string;
  status: MpsRequestStatus;
  createdBy: string;
  creatorName: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type MpsSubmission = {
  submissionId: string;
  requestId: string;
  schoolYear: string;
  term: AcademicTerm;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  gradeLevel: string;
  strand: string;
  mps: number;
  leastMasteredCompetency: string;
  plannedIntervention: string;
  submittedBy: string;
  submittedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type GradeSubmission = {
  gradeSubmissionId: string;
  assignmentId: string;
  classEnrollmentId: string;
  enrollmentId: string;
  lrn: string;
  studentName: string;
  schoolYear: string;
  term: AcademicTerm;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  gradeLevel: string;
  strand: string;
  grade: number;
  submittedBy: string;
  submittedAt?: Timestamp;
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
