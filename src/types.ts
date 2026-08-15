export type UserRole =
  | "principal"
  | "master_teacher"
  | "teacher"
  | "registrar"
  | "administrative_officer"
  | "administrative_assistant"
  | "admin"
  | "super_admin";
export type UserStatus = "approved" | "pending" | "disabled";
export type AppModule =
  | "dashboard"
  | "announcements"
  | "loading"
  | "teachers"
  | "subjects"
  | "sections"
  | "enrollment"
  | "curriculum_mapping"
  | "load_assignment"
  | "scheduler"
  | "dll_submissions"
  | "document_requests"
  | "tosia_pro"
  | "mps"
  | "grade_computation"
  | "grade_submissions"
  | "grade_summary"
  | "observations"
  | "personnel_attendance"
  | "personnel_locator"
  | "my_personnel_attendance"
  | "teacher_loads"
  | "certificates"
  | "printable_certificates"
  | "reports"
  | "personnel_settings"
  | "settings"
  | "backup_restore"
  | "users";

export type UserProfile = {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  modulePermissions?: AppModule[];
  assignedTeacherId?: string;
  advisingSectionId?: string;
  createdAt: unknown;
};

export type CertificateEventType = string;
export type CertificateFormat = "certification" | "participation" | "recognition";
export type CertificationType = "standard" | "esat";
export type CertificateStatus = "valid" | "revoked";
export type CertificatePersonType = "speaker_facilitator" | "technical_working_group";

export type CertificateRecord = {
  certificateId: string;
  certificateNo: string;
  eventType: CertificateEventType;
  eventTitle: string;
  startDate: string;
  endDate: string;
  eventDate?: string;
  venue: string;
  facilitator?: string;
  schoolYear?: string;
  defaultHoursAttended?: number;
  certificateFormat?: CertificateFormat;
  certificationType?: CertificationType;
  certificationSignatoryName?: string;
  certificationSignatoryTitle?: string;
  issuedBy: string;
  issuedDate: string;
  status: CertificateStatus;
  publicAccess: boolean;
  notes?: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type CertificateParticipant = {
  participantId: string;
  certificateId: string;
  participantUserId?: string;
  participantStaffId?: string;
  participantStaffType?: "teaching" | "non_teaching";
  certificateNo: string;
  participantName: string;
  participantRole: string;
  participantOffice: string;
  hoursAttended: number;
  status: CertificateStatus;
  publicAccess: boolean;
  notes?: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type CertificatePerson = {
  personId: string;
  certificateId: string;
  personType: CertificatePersonType;
  fullName: string;
  roleOrPosition: string;
  office: string;
  notes?: string;
  createdAt: unknown;
  updatedAt: unknown;
};
