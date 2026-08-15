import type { Timestamp } from "firebase/firestore";

export type AnnouncementAudienceType =
  | "all_personnel"
  | "teaching_personnel"
  | "non_teaching_personnel"
  | "department"
  | "grade_level"
  | "selected_personnel"
  | "selected_group";

export type AnnouncementCategory =
  | "memorandum"
  | "advisory"
  | "meeting"
  | "activity_event"
  | "deadline_submission"
  | "information"
  | "other";

export type AnnouncementPriority = "normal" | "important" | "urgent";

export type AnnouncementAttachment = {
  attachmentId: string;
  fileName: string;
  fileType: "pdf" | "image";
  mimeType: string;
  fileSize: number;
  storagePath: string;
  downloadURL: string;
};

export type Announcement = {
  announcementId: string;
  title: string;
  source: string;
  message: string;
  audienceType: AnnouncementAudienceType;
  audienceIds: string[];
  audienceNames: string[];
  targetUserIds: string[];
  authorizedUserIds: string[];
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  postedByUid: string;
  postedByName: string;
  status: "draft" | "published";
  sortRank: number;
  isPinned: boolean;
  isArchived: boolean;
  requireAcknowledgment: boolean;
  attachments: AnnouncementAttachment[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type AnnouncementRead = {
  readId: string;
  announcementId: string;
  userId: string;
  userName: string;
  firstReadAt?: Timestamp;
  acknowledgedAt?: Timestamp;
};

export type AnnouncementDraft = Pick<
  Announcement,
  | "title"
  | "source"
  | "message"
  | "audienceType"
  | "audienceIds"
  | "audienceNames"
  | "targetUserIds"
  | "category"
  | "priority"
  | "requireAcknowledgment"
>;
