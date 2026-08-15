import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "../firebase";
import type { UserProfile } from "../types";
import type {
  Announcement,
  AnnouncementAttachment,
  AnnouncementDraft,
  AnnouncementPriority,
  AnnouncementRead,
} from "../types/announcements";

export const announcementPageSize = 20;
export const announcementMaxFileSize = 50 * 1024 * 1024;

const allowedAttachmentTypes = new Map<string, "pdf" | "image">([
  ["application/pdf", "pdf"],
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
] as const);

const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);

export type AnnouncementPage = {
  announcements: Announcement[];
  cursor: QueryDocumentSnapshot | string | null;
  hasMore: boolean;
};

type CallableAnnouncement = Omit<Announcement, "createdAt" | "updatedAt"> & {
  createdAtMillis?: number | null;
  updatedAtMillis?: number | null;
};

type CallableAnnouncementPage = {
  announcements: CallableAnnouncement[];
  cursorId: string | null;
  hasMore: boolean;
};

const listVisibleAnnouncements = httpsCallable<
  { cursorId?: string | null },
  CallableAnnouncementPage
>(functions, "listVisibleAnnouncements");

function announcementFromDoc(snapshot: QueryDocumentSnapshot): Announcement {
  return {
    announcementId: snapshot.id,
    ...(snapshot.data() as Omit<Announcement, "announcementId">),
  };
}

function normalizeFileName(fileName: string) {
  const parts = fileName.trim().split(".");
  const extension = parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : "";
  const base = parts.join(".").replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return `${base || "attachment"}${extension}`.slice(-180);
}

function attachmentId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getAnnouncementSortRank(priority: AnnouncementPriority, isPinned: boolean) {
  const priorityRank = priority === "urgent" ? 3 : priority === "important" ? 2 : 1;
  return (isPinned ? 10 : 0) + priorityRank;
}

export function validateAnnouncementFiles(files: readonly File[]) {
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedAttachmentTypes.has(file.type) || !allowedExtensions.has(extension)) {
      throw new Error(`${file.name} is not supported. Upload PDF, JPG, JPEG, PNG, or WEBP files only.`);
    }
    if (file.size > announcementMaxFileSize) {
      throw new Error(`${file.name} is larger than the 50 MB attachment limit.`);
    }
    if (file.size === 0) {
      throw new Error(`${file.name} is empty and cannot be uploaded.`);
    }
  }
}

async function uploadAnnouncementFile(
  announcementId: string,
  file: File,
  uploaderId: string,
  onProgress?: (progress: number) => void,
) {
  const nextAttachmentId = attachmentId();
  const safeName = normalizeFileName(file.name);
  const storagePath = `announcements/${announcementId}/${nextAttachmentId}-${safeName}`;
  const storageRef = ref(storage, storagePath);
  const metadata: UploadMetadata = {
    contentType: file.type,
    customMetadata: {
      announcementId,
      originalFileName: file.name,
      uploadedBy: uploaderId,
    },
  };

  const snapshot = await new Promise<UploadTaskSnapshot>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, metadata);
    task.on(
      "state_changed",
      (progressSnapshot) => {
        const total = progressSnapshot.totalBytes || file.size || 1;
        onProgress?.((progressSnapshot.bytesTransferred / total) * 100);
      },
      reject,
      () => resolve(task.snapshot),
    );
  });

  return {
    attachmentId: nextAttachmentId,
    fileName: file.name,
    fileType: allowedAttachmentTypes.get(file.type)!,
    mimeType: file.type,
    fileSize: file.size,
    storagePath,
    downloadURL: await getDownloadURL(snapshot.ref),
  } satisfies AnnouncementAttachment;
}

async function uploadFiles(
  announcementId: string,
  files: readonly File[],
  uploaderId: string,
  onProgress?: (progress: number) => void,
) {
  validateAnnouncementFiles(files);
  const uploaded: AnnouncementAttachment[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const attachment = await uploadAnnouncementFile(announcementId, files[index], uploaderId, (fileProgress) => {
        onProgress?.(((index + fileProgress / 100) / Math.max(files.length, 1)) * 100);
      });
      uploaded.push(attachment);
    }
  } catch (error) {
    await removeUploadedFiles(uploaded);
    throw error;
  }
  onProgress?.(100);
  return uploaded;
}

async function removeUploadedFiles(attachments: readonly AnnouncementAttachment[]) {
  await Promise.allSettled(attachments.map((attachment) => deleteObject(ref(storage, attachment.storagePath))));
}

export async function fetchAnnouncementsPage(
  profile: UserProfile,
  cursor: QueryDocumentSnapshot | string | null = null,
): Promise<AnnouncementPage> {
  const canManageAll = profile.role === "admin" || profile.role === "super_admin";
  if (!canManageAll) {
    const result = await listVisibleAnnouncements({
      cursorId: typeof cursor === "string" ? cursor : null,
    });
    const page = result.data;
    return {
      announcements: page.announcements.map(({ createdAtMillis, updatedAtMillis, ...announcement }) => ({
        ...announcement,
        createdAt: typeof createdAtMillis === "number" ? Timestamp.fromMillis(createdAtMillis) : undefined,
        updatedAt: typeof updatedAtMillis === "number" ? Timestamp.fromMillis(updatedAtMillis) : undefined,
      })),
      cursor: page.cursorId,
      hasMore: page.hasMore,
    };
  }

  const constraints: QueryConstraint[] = canManageAll
    ? [where("status", "==", "published"), orderBy("sortRank", "desc"), orderBy("createdAt", "desc")]
    : [
        where("authorizedUserIds", "array-contains", profile.userId),
        where("status", "==", "published"),
        orderBy("sortRank", "desc"),
        orderBy("createdAt", "desc"),
      ];

  if (cursor && typeof cursor !== "string") constraints.push(startAfter(cursor));
  constraints.push(limit(announcementPageSize + 1));
  const snapshot = await getDocs(query(collection(db, "announcements"), ...constraints));
  const pageDocs = snapshot.docs.slice(0, announcementPageSize);
  return {
    announcements: pageDocs.map(announcementFromDoc),
    cursor: pageDocs[pageDocs.length - 1] ?? null,
    hasMore: snapshot.docs.length > announcementPageSize,
  };
}

export async function getAnnouncement(announcementId: string) {
  const snapshot = await getDoc(doc(db, "announcements", announcementId));
  if (!snapshot.exists()) return null;
  return { announcementId: snapshot.id, ...(snapshot.data() as Omit<Announcement, "announcementId">) };
}

export async function createAnnouncement(
  draft: AnnouncementDraft,
  files: readonly File[],
  poster: UserProfile,
  onProgress?: (progress: number) => void,
) {
  const announcementRef = doc(collection(db, "announcements"));
  const targetUserIds = Array.from(new Set(draft.targetUserIds));
  const authorizedUserIds = Array.from(new Set([...targetUserIds, poster.userId]));
  const baseRecord = {
    ...draft,
    announcementId: announcementRef.id,
    targetUserIds,
    authorizedUserIds,
    postedByUid: poster.userId,
    postedByName: poster.fullName,
    status: "draft" as const,
    sortRank: getAnnouncementSortRank(draft.priority, false),
    isPinned: false,
    isArchived: false,
    attachments: [] as AnnouncementAttachment[],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(announcementRef, baseRecord);
  let attachments: AnnouncementAttachment[] = [];
  try {
    attachments = await uploadFiles(announcementRef.id, files, poster.userId, onProgress);
    await updateDoc(announcementRef, {
      attachments,
      status: "published",
      updatedAt: serverTimestamp(),
    });
    return announcementRef.id;
  } catch (error) {
    await removeUploadedFiles(attachments);
    await deleteDoc(announcementRef).catch(() => undefined);
    throw error;
  }
}

export async function updateAnnouncement(
  existing: Announcement,
  draft: AnnouncementDraft,
  files: readonly File[],
  editor: UserProfile,
  onProgress?: (progress: number) => void,
) {
  let addedAttachments: AnnouncementAttachment[] = [];
  try {
    addedAttachments = await uploadFiles(existing.announcementId, files, editor.userId, onProgress);
    const targetUserIds = Array.from(new Set(draft.targetUserIds));
    await updateDoc(doc(db, "announcements", existing.announcementId), {
      ...draft,
      targetUserIds,
      authorizedUserIds: Array.from(new Set([...targetUserIds, existing.postedByUid])),
      attachments: [...existing.attachments, ...addedAttachments],
      sortRank: getAnnouncementSortRank(draft.priority, existing.isPinned),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await removeUploadedFiles(addedAttachments);
    throw error;
  }
}

export async function setAnnouncementArchived(announcementId: string, isArchived: boolean) {
  return updateDoc(doc(db, "announcements", announcementId), {
    isArchived,
    updatedAt: serverTimestamp(),
  });
}

export async function setAnnouncementPinned(announcement: Announcement, isPinned: boolean) {
  return updateDoc(doc(db, "announcements", announcement.announcementId), {
    isPinned,
    sortRank: getAnnouncementSortRank(announcement.priority, isPinned),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeAnnouncementReads(userId: string, callback: (reads: AnnouncementRead[]) => void): Unsubscribe {
  const readsQuery = query(collection(db, "announcementReads"), where("userId", "==", userId));
  return onSnapshot(readsQuery, (snapshot) => {
    callback(snapshot.docs.map((readDoc) => ({ readId: readDoc.id, ...(readDoc.data() as Omit<AnnouncementRead, "readId">) })));
  });
}

export async function markAnnouncementRead(announcement: Announcement, user: UserProfile) {
  if (!announcement.targetUserIds.includes(user.userId)) return;
  const readRef = doc(db, "announcementReads", `${announcement.announcementId}_${user.userId}`);
  try {
    await setDoc(readRef, {
      readId: readRef.id,
      announcementId: announcement.announcementId,
      userId: user.userId,
      userName: user.fullName,
      firstReadAt: serverTimestamp(),
    });
  } catch (caught) {
    // Creating the deterministic receipt is intentionally idempotent. If it
    // already exists, the create-shaped set is rejected by the update rule;
    // confirm the existing receipt and leave its original first-read time intact.
    const current = await getDoc(readRef).catch(() => null);
    if (!current?.exists()) throw caught;
  }
}

export async function acknowledgeAnnouncement(announcement: Announcement, user: UserProfile) {
  if (!announcement.requireAcknowledgment || !announcement.targetUserIds.includes(user.userId)) return;
  const readRef = doc(db, "announcementReads", `${announcement.announcementId}_${user.userId}`);
  try {
    // Most acknowledgments update the read receipt created when the dialog opened.
    await updateDoc(readRef, { acknowledgedAt: serverTimestamp() });
  } catch (updateError) {
    try {
      // If the initial read receipt has not been created yet, create both states
      // together without first reading a document that does not exist.
      await setDoc(readRef, {
        readId: readRef.id,
        announcementId: announcement.announcementId,
        userId: user.userId,
        userName: user.fullName,
        firstReadAt: serverTimestamp(),
        acknowledgedAt: serverTimestamp(),
      });
    } catch {
      // Another tab may have created the receipt between the two writes.
      // Retrying the acknowledgment update is safe and preserves firstReadAt.
      try {
        await updateDoc(readRef, { acknowledgedAt: serverTimestamp() });
      } catch {
        throw updateError;
      }
    }
  }
}

export async function getAnnouncementReadReport(announcementId: string) {
  const snapshot = await getDocs(
    query(collection(db, "announcementReads"), where("announcementId", "==", announcementId)),
  );
  return snapshot.docs.map((readDoc) => ({
    readId: readDoc.id,
    ...(readDoc.data() as Omit<AnnouncementRead, "readId">),
  }));
}

export async function permanentlyDeleteAnnouncement(announcement: Announcement) {
  await removeUploadedFiles(announcement.attachments);
  const readSnapshot = await getDocs(
    query(collection(db, "announcementReads"), where("announcementId", "==", announcement.announcementId)),
  );
  for (let index = 0; index < readSnapshot.docs.length; index += 450) {
    const batch = writeBatch(db);
    readSnapshot.docs.slice(index, index + 450).forEach((readDoc) => batch.delete(readDoc.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, "announcements", announcement.announcementId));
}

export async function downloadAnnouncementAttachment(attachment: AnnouncementAttachment) {
  const response = await fetch(attachment.downloadURL);
  if (!response.ok) throw new Error("The attachment could not be downloaded.");
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = attachment.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
