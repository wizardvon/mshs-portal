const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const multicastLimit = 500;
const notificationBatchLimit = 500;
const invalidTokenCodes = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function stringValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hostingOrigin() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "mshs-portal-be381";
  return `https://${projectId}.web.app`;
}

function absoluteHostingUrl(value) {
  const path = stringValue(value, "/dashboard");
  try {
    return new URL(path, hostingOrigin()).href;
  } catch {
    return `${hostingOrigin()}/dashboard`;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function announcementForCallable(snapshot) {
  const data = snapshot.data();
  const { createdAt, updatedAt, ...announcement } = data;
  return {
    ...announcement,
    announcementId: snapshot.id,
    createdAtMillis: createdAt?.toMillis?.() ?? null,
    updatedAtMillis: updatedAt?.toMillis?.() ?? null,
  };
}

function statusChanged(event) {
  const before = event.data.before.data();
  const after = event.data.after.data();
  return before?.status !== after?.status;
}

async function getApprovedUsers() {
  const snapshot = await admin
    .firestore()
    .collection("users")
    .where("status", "==", "approved")
    .get();

  return snapshot.docs.map((userDoc) => userDoc.data());
}

async function getUsersByTeacherId(teacherId) {
  if (!teacherId) {
    return [];
  }

  const users = await getApprovedUsers();
  return users.filter((user) => user.assignedTeacherId === teacherId);
}

async function getTeacherUserIds() {
  const users = await getApprovedUsers();
  return users
    .filter((user) => ["teacher", "master_teacher"].includes(user.role))
    .map((user) => user.userId);
}

exports.listVisibleAnnouncements = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError("unauthenticated", "Sign in to view announcements.");
  }

  const profileSnapshot = await admin.firestore().collection("users").doc(userId).get();
  const profile = profileSnapshot.data();
  if (!profileSnapshot.exists || profile?.status !== "approved") {
    throw new HttpsError("permission-denied", "Your portal account is not approved.");
  }

  const canManageAll = ["super_admin", "admin"].includes(profile.role);
  let announcementsQuery = admin
    .firestore()
    .collection("announcements")
    .where("status", "==", "published");

  if (!canManageAll) {
    announcementsQuery = announcementsQuery.where("authorizedUserIds", "array-contains", userId);
  }

  announcementsQuery = announcementsQuery
    .orderBy("sortRank", "desc")
    .orderBy("createdAt", "desc");

  const cursorId = stringValue(request.data?.cursorId);
  if (cursorId) {
    const cursorSnapshot = await admin.firestore().collection("announcements").doc(cursorId).get();
    if (!cursorSnapshot.exists) {
      throw new HttpsError("invalid-argument", "The announcement page cursor is no longer available.");
    }
    announcementsQuery = announcementsQuery.startAfter(cursorSnapshot);
  }

  const pageSize = 20;
  const snapshot = await announcementsQuery.limit(pageSize + 1).get();
  const pageDocuments = snapshot.docs.slice(0, pageSize);
  return {
    announcements: pageDocuments.map(announcementForCallable),
    cursorId: pageDocuments[pageDocuments.length - 1]?.id ?? null,
    hasMore: snapshot.docs.length > pageSize,
  };
});

async function createPortalNotifications(userIds, notification) {
  const recipientIds = unique(userIds).filter((userId) => userId !== notification.createdBy);
  if (!recipientIds.length) {
    return 0;
  }

  for (const recipientChunk of chunk(recipientIds, notificationBatchLimit)) {
    const batch = admin.firestore().batch();
    recipientChunk.forEach((userId) => {
      const notificationRef = admin
        .firestore()
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .doc();

      batch.set(notificationRef, {
        notificationId: notificationRef.id,
        userId,
        title: notification.title,
        body: notification.body,
        href: notification.href || "/dashboard",
        audience: notification.audience || "user",
        createdBy: notification.createdBy || "system",
        creatorName: notification.creatorName || "MSHS Portal",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return recipientIds.length;
}

async function getDocumentRequest(requestId) {
  const snapshot = await admin.firestore().collection("documentRequests").doc(requestId).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function getDllRequest(requestId) {
  const snapshot = await admin.firestore().collection("dllRequests").doc(requestId).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function getMpsRequest(requestId) {
  const snapshot = await admin.firestore().collection("mpsRequests").doc(requestId).get();
  return snapshot.exists ? snapshot.data() : null;
}

exports.sendDeviceNotification = onDocumentCreated(
  "users/{userId}/notifications/{notificationId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    const notification = snapshot.data();
    const userId = event.params.userId;
    const title = stringValue(notification.title, "MSHS Portal");
    const body = stringValue(notification.body);
    const href = stringValue(notification.href, "/dashboard");
    const link = absoluteHostingUrl(href);
    const iconUrl = absoluteHostingUrl("/mshs-portal-icon.png");

    const tokensSnapshot = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .collection("notificationTokens")
      .where("enabled", "==", true)
      .get();

    const tokenDocs = tokensSnapshot.docs.filter((tokenDoc) => {
      const token = tokenDoc.get("token");
      return typeof token === "string" && token.length >= 20;
    });

    if (!tokenDocs.length) {
      logger.info("No enabled notification tokens for user.", {
        userId,
        notificationId: event.params.notificationId,
      });
      return;
    }

    const tokenChunks = chunk(tokenDocs, multicastLimit);
    const staleTokenRefs = [];
    let successCount = 0;
    let failureCount = 0;

    for (const tokenChunk of tokenChunks) {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokenChunk.map((tokenDoc) => tokenDoc.get("token")),
        notification: {
          title,
          body,
        },
        data: {
          notificationId: event.params.notificationId,
          userId,
          title,
          body,
          href,
        },
        webpush: {
          headers: {
            Urgency: "high",
          },
          notification: {
            title,
            body,
            icon: iconUrl,
            badge: iconUrl,
          },
          fcmOptions: {
            link,
          },
        },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((sendResult, index) => {
        if (sendResult.success || !sendResult.error) {
          return;
        }

        if (invalidTokenCodes.has(sendResult.error.code)) {
          staleTokenRefs.push(tokenChunk[index].ref);
        }
      });
    }

    for (const staleChunk of chunk(staleTokenRefs, multicastLimit)) {
      const batch = admin.firestore().batch();
      staleChunk.forEach((tokenRef) => batch.delete(tokenRef));
      await batch.commit();
    }

    logger.info("Device notification delivery finished.", {
      userId,
      notificationId: event.params.notificationId,
      successCount,
      failureCount,
      staleTokenCount: staleTokenRefs.length,
    });
  },
);

exports.notifyDocumentRequestCreated = onDocumentCreated(
  "documentRequests/{requestId}",
  async (event) => {
    const request = event.data?.data();
    if (!request || request.status !== "active") {
      return;
    }

    const count = await createPortalNotifications(request.targetUserIds || [], {
      title: "New document request",
      body: `${stringValue(request.creatorName, "MSHS Portal")} requested: ${stringValue(request.title, "Document request")}. Due ${stringValue(request.dueDate, "date not set")}.`,
      href: "/document-requests",
      createdBy: request.createdBy,
      creatorName: request.creatorName,
    });

    logger.info("Document request notifications created.", {
      requestId: event.params.requestId,
      count,
    });
  },
);

exports.notifyAnnouncementPublished = onDocumentUpdated(
  "announcements/{announcementId}",
  async (event) => {
    const before = event.data.before.data();
    const announcement = event.data.after.data();
    if (before?.status === "published" || announcement?.status !== "published") {
      return;
    }

    const count = await createPortalNotifications(announcement.targetUserIds || [], {
      title: `New announcement: ${stringValue(announcement.title, "School announcement")}`,
      body: `${stringValue(announcement.source, "MSHS Portal")}: ${stringValue(announcement.message, "Open the announcement to view details.")}`.slice(0, 240),
      href: `/announcements?announcement=${event.params.announcementId}`,
      createdBy: announcement.postedByUid,
      creatorName: announcement.postedByName,
    });

    logger.info("Announcement notifications created.", {
      announcementId: event.params.announcementId,
      count,
    });
  },
);

exports.notifyDocumentSubmissionCreated = onDocumentCreated(
  "documentRequestSubmissions/{submissionId}",
  async (event) => {
    const submission = event.data?.data();
    if (!submission || !submission.requestId) {
      return;
    }

    const request = await getDocumentRequest(submission.requestId);
    if (!request?.createdBy) {
      return;
    }

    const count = await createPortalNotifications([request.createdBy], {
      title: "Document submitted",
      body: `${stringValue(submission.targetName, "A user")} submitted ${stringValue(submission.requestTitle, "a document request")}.`,
      href: "/document-requests",
      createdBy: submission.submittedBy,
      creatorName: submission.targetName,
    });

    logger.info("Document submission notification created.", {
      submissionId: event.params.submissionId,
      count,
    });
  },
);

exports.notifyDocumentSubmissionResubmitted = onDocumentUpdated(
  "documentRequestSubmissions/{submissionId}",
  async (event) => {
    if (!statusChanged(event)) {
      return;
    }

    const submission = event.data.after.data();
    if (submission.status !== "submitted" || !submission.requestId) {
      return;
    }

    const request = await getDocumentRequest(submission.requestId);
    if (!request?.createdBy) {
      return;
    }

    await createPortalNotifications([request.createdBy], {
      title: "Document resubmitted",
      body: `${stringValue(submission.targetName, "A user")} resubmitted ${stringValue(submission.requestTitle, "a document request")}.`,
      href: "/document-requests",
      createdBy: submission.submittedBy,
      creatorName: submission.targetName,
    });
  },
);

exports.notifyDocumentSubmissionReviewed = onDocumentUpdated(
  "documentRequestSubmissions/{submissionId}",
  async (event) => {
    if (!statusChanged(event)) {
      return;
    }

    const submission = event.data.after.data();
    if (!["confirmed", "returned"].includes(submission.status)) {
      return;
    }

    const title = submission.status === "confirmed" ? "Document confirmed" : "Document returned";
    const body =
      submission.status === "confirmed"
        ? `${stringValue(submission.requestTitle, "Your document")} was confirmed.`
        : `${stringValue(submission.requestTitle, "Your document")} was returned for correction.`;

    await createPortalNotifications([submission.targetUserId], {
      title,
      body,
      href: "/document-requests",
      createdBy: submission.confirmedBy,
      creatorName: submission.confirmerName,
    });
  },
);

exports.notifyDllRequestCreated = onDocumentCreated(
  "dllRequests/{requestId}",
  async (event) => {
    const request = event.data?.data();
    if (!request || request.status !== "active") {
      return;
    }

    const teacherUserIds = await getTeacherUserIds();
    const count = await createPortalNotifications(teacherUserIds, {
      title: "DLL submission requested",
      body: `${stringValue(request.title, "DLL submission")} is due ${stringValue(request.dueDate, "date not set")}.`,
      href: "/dll-submissions",
      createdBy: request.createdBy,
      creatorName: "MSHS Portal",
    });

    logger.info("DLL request notifications created.", {
      requestId: event.params.requestId,
      count,
    });
  },
);

exports.notifyDllSubmissionCreated = onDocumentCreated(
  "dllSubmissions/{submissionId}",
  async (event) => {
    const submission = event.data?.data();
    if (!submission?.requestId) {
      return;
    }

    const request = await getDllRequest(submission.requestId);
    if (!request?.createdBy) {
      return;
    }

    await createPortalNotifications([request.createdBy], {
      title: "DLL submitted",
      body: `${stringValue(submission.teacherName, "A teacher")} submitted DLL for ${stringValue(submission.subjectName, "a subject")}.`,
      href: "/dll-submissions",
      createdBy: submission.submittedBy,
      creatorName: submission.teacherName,
    });
  },
);

exports.notifyDllSubmissionResubmitted = onDocumentUpdated(
  "dllSubmissions/{submissionId}",
  async (event) => {
    if (!statusChanged(event)) {
      return;
    }

    const submission = event.data.after.data();
    if (submission.status !== "submitted" || !submission.requestId) {
      return;
    }

    const request = await getDllRequest(submission.requestId);
    if (!request?.createdBy) {
      return;
    }

    await createPortalNotifications([request.createdBy], {
      title: "DLL resubmitted",
      body: `${stringValue(submission.teacherName, "A teacher")} resubmitted DLL for ${stringValue(submission.subjectName, "a subject")}.`,
      href: "/dll-submissions",
      createdBy: submission.submittedBy,
      creatorName: submission.teacherName,
    });
  },
);

exports.notifyDllSubmissionReviewed = onDocumentUpdated(
  "dllSubmissions/{submissionId}",
  async (event) => {
    if (!statusChanged(event)) {
      return;
    }

    const submission = event.data.after.data();
    if (!["approved", "returned"].includes(submission.status)) {
      return;
    }

    const teacherUsers = await getUsersByTeacherId(submission.teacherId);
    const teacherUserIds = teacherUsers.map((user) => user.userId);
    const title = submission.status === "approved" ? "DLL approved" : "DLL returned";
    const body =
      submission.status === "approved"
        ? `Your DLL for ${stringValue(submission.subjectName, "a subject")} was approved.`
        : `Your DLL for ${stringValue(submission.subjectName, "a subject")} was returned for correction.`;

    await createPortalNotifications(unique([submission.submittedBy, ...teacherUserIds]), {
      title,
      body,
      href: "/dll-submissions",
      createdBy: submission.reviewedBy,
      creatorName: submission.reviewerName,
    });
  },
);

exports.notifyMpsRequestCreated = onDocumentCreated(
  "mpsRequests/{requestId}",
  async (event) => {
    const request = event.data?.data();
    if (!request || request.status !== "active") {
      return;
    }

    const teacherUserIds = await getTeacherUserIds();
    const count = await createPortalNotifications(teacherUserIds, {
      title: "MPS submission requested",
      body: `${stringValue(request.testName, request.title || "MPS submission")} is due ${stringValue(request.dueDate, "date not set")}.`,
      href: "/mps",
      createdBy: request.createdBy,
      creatorName: request.creatorName,
    });

    logger.info("MPS request notifications created.", {
      requestId: event.params.requestId,
      count,
    });
  },
);

exports.notifyMpsSubmissionCreated = onDocumentCreated(
  "mpsSubmissions/{submissionId}",
  async (event) => {
    const submission = event.data?.data();
    if (!submission?.requestId) {
      return;
    }

    const request = await getMpsRequest(submission.requestId);
    if (!request?.createdBy) {
      return;
    }

    await createPortalNotifications([request.createdBy], {
      title: "MPS submitted",
      body: `${stringValue(submission.teacherName, "A teacher")} submitted MPS for ${stringValue(submission.subjectName, "a subject")} - ${stringValue(submission.sectionName, "a section")}.`,
      href: "/mps",
      createdBy: submission.submittedBy,
      creatorName: submission.teacherName,
    });
  },
);

exports.notifyMpsSubmissionUpdated = onDocumentUpdated(
  "mpsSubmissions/{submissionId}",
  async (event) => {
    const before = event.data.before.data();
    const submission = event.data.after.data();
    if (
      before.mps === submission.mps &&
      before.leastMasteredCompetency === submission.leastMasteredCompetency &&
      before.plannedIntervention === submission.plannedIntervention
    ) {
      return;
    }

    const request = await getMpsRequest(submission.requestId);
    if (!request?.createdBy) {
      return;
    }

    await createPortalNotifications([request.createdBy], {
      title: "MPS updated",
      body: `${stringValue(submission.teacherName, "A teacher")} updated MPS for ${stringValue(submission.subjectName, "a subject")} - ${stringValue(submission.sectionName, "a section")}.`,
      href: "/mps",
      createdBy: submission.submittedBy,
      creatorName: submission.teacherName,
    });
  },
);

exports.notifyObservationScheduleCreated = onDocumentCreated(
  "observationSchedules/{observationId}",
  async (event) => {
    const schedule = event.data?.data();
    if (!schedule || schedule.status !== "scheduled") {
      return;
    }

    const teacherUsers = await getUsersByTeacherId(schedule.teacherId);
    const activityLabel =
      schedule.activityType === "coaching_mentoring"
        ? "Coaching/mentoring"
        : `${stringValue(schedule.observationType, "Classroom observation")}`;

    const count = await createPortalNotifications(teacherUsers.map((user) => user.userId), {
      title: `${activityLabel} scheduled`,
      body: `${stringValue(schedule.observerName, "An observer")} scheduled ${activityLabel.toLowerCase()} on ${stringValue(schedule.scheduleDate)} from ${stringValue(schedule.startTime)} to ${stringValue(schedule.endTime)}.`,
      href: "/observations",
      createdBy: schedule.createdBy,
      creatorName: schedule.observerName,
    });

    logger.info("Observation schedule notifications created.", {
      observationId: event.params.observationId,
      count,
    });
  },
);

exports.notifyObservationScheduleStatusChanged = onDocumentUpdated(
  "observationSchedules/{observationId}",
  async (event) => {
    if (!statusChanged(event)) {
      return;
    }

    const schedule = event.data.after.data();
    if (!["cancelled", "done"].includes(schedule.status)) {
      return;
    }

    const teacherUsers = await getUsersByTeacherId(schedule.teacherId);
    const title = schedule.status === "cancelled" ? "Observation schedule cancelled" : "Observation marked done";
    const body =
      schedule.status === "cancelled"
        ? `Your schedule on ${stringValue(schedule.scheduleDate)} from ${stringValue(schedule.startTime)} to ${stringValue(schedule.endTime)} was cancelled.`
        : `Your schedule on ${stringValue(schedule.scheduleDate)} was marked done.`;

    await createPortalNotifications(teacherUsers.map((user) => user.userId), {
      title,
      body,
      href: "/observations",
      createdBy: schedule.observerId,
      creatorName: schedule.observerName,
    });
  },
);
