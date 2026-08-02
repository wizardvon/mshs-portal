import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { db, messagingConfig, messagingPromise } from "../firebase";
import type { UserProfile, UserRole } from "../types";

export type PortalNotification = {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  href?: string;
  audience: "all" | UserRole | "user";
  createdBy: string;
  creatorName: string;
  read: boolean;
  readAt?: unknown;
  createdAt: unknown;
};

type SendNotificationInput = {
  title: string;
  body: string;
  href?: string;
  audience: "all" | UserRole | "user";
  targetUserId?: string;
  sender: UserProfile;
};

const tokenCollection = (userId: string) => collection(db, "users", userId, "notificationTokens");
const notificationCollection = (userId: string) => collection(db, "users", userId, "notifications");
const firestoreBatchLimit = 500;

function getVapidKey() {
  return import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
}

function serviceWorkerUrl() {
  const params = new URLSearchParams(
    Object.entries(messagingConfig).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value) {
        acc[key] = value;
      }
      return acc;
    }, {}),
  );

  return `/firebase-messaging-sw.js?${params.toString()}`;
}

async function digestToken(token: string) {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function canUseDeviceNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function registerDeviceForNotifications(user: UserProfile) {
  if (!canUseDeviceNotifications()) {
    throw new Error("This browser does not support device notifications.");
  }

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    throw new Error("Missing VITE_FIREBASE_VAPID_KEY. Add the Firebase Web Push certificate key first.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const messaging = await messagingPromise;
  if (!messaging) {
    throw new Error("Firebase Messaging is not supported in this browser.");
  }

  const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), {
    updateViaCache: "none",
  });
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error("Firebase did not return a device token.");
  }

  const tokenId = await digestToken(token);
  await setDoc(
    doc(tokenCollection(user.userId), tokenId),
    {
      tokenId,
      token,
      userId: user.userId,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      enabled: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return token;
}

export function subscribeNotifications(
  userId: string,
  callback: (notifications: PortalNotification[]) => void,
): Unsubscribe {
  const notificationsQuery = query(notificationCollection(userId), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(notificationsQuery, (snapshot) => {
    callback(
      snapshot.docs.map((notificationDoc) => ({
        notificationId: notificationDoc.id,
        ...(notificationDoc.data() as Omit<PortalNotification, "notificationId">),
      })),
    );
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await updateDoc(doc(notificationCollection(userId), notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(userId: string, notifications: PortalNotification[]) {
  const unread = notifications.filter((notification) => !notification.read);
  if (!unread.length) {
    return;
  }

  const batch = writeBatch(db);
  unread.forEach((notification) => {
    batch.update(doc(notificationCollection(userId), notification.notificationId), {
      read: true,
      readAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function sendPortalNotification(input: SendNotificationInput) {
  const usersSnapshot = await getDocs(collection(db, "users"));
  const recipients = usersSnapshot.docs
    .map((userDoc) => userDoc.data() as UserProfile)
    .filter((user) => {
      if (user.status !== "approved") {
        return false;
      }
      if (input.audience === "all") {
        return true;
      }
      if (input.audience === "user") {
        return user.userId === input.targetUserId;
      }
      return user.role === input.audience;
    });

  for (let index = 0; index < recipients.length; index += firestoreBatchLimit) {
    const batch = writeBatch(db);
    recipients.slice(index, index + firestoreBatchLimit).forEach((recipient) => {
      const notificationRef = doc(notificationCollection(recipient.userId));
      batch.set(notificationRef, {
        notificationId: notificationRef.id,
        userId: recipient.userId,
        title: input.title.trim(),
        body: input.body.trim(),
        href: input.href?.trim() || "",
        audience: input.audience,
        createdBy: input.sender.userId,
        creatorName: input.sender.fullName,
        read: false,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return recipients.length;
}

export async function subscribeForegroundPushNotifications(
  callback: (payload: { title: string; body: string; href?: string }) => void,
) {
  const messaging = await messagingPromise;
  if (!messaging) {
    return undefined;
  }

  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title || payload.data?.title || "MSHS Portal",
      body: payload.notification?.body || payload.data?.body || "",
      href: payload.data?.href,
    });
  });
}
