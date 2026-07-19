import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";

export type UserPortalSettings = {
  hideInactiveDashboardCards: boolean;
  updatedAt?: unknown;
};

export const defaultUserPortalSettings: UserPortalSettings = {
  hideInactiveDashboardCards: false,
};

function withUserSettingsDefaults(settings?: Partial<UserPortalSettings>): UserPortalSettings {
  return {
    hideInactiveDashboardCards: settings?.hideInactiveDashboardCards ?? defaultUserPortalSettings.hideInactiveDashboardCards,
    updatedAt: settings?.updatedAt,
  };
}

export function subscribeUserPortalSettings(
  userId: string | undefined,
  callback: (settings: UserPortalSettings) => void,
): Unsubscribe {
  if (!userId) {
    callback(defaultUserPortalSettings);
    return () => undefined;
  }

  return onSnapshot(doc(db, "userSettings", userId), (snapshot) => {
    callback(withUserSettingsDefaults(snapshot.exists() ? (snapshot.data() as UserPortalSettings) : undefined));
  });
}

export async function saveUserPortalSettings(userId: string, settings: UserPortalSettings) {
  await setDoc(
    doc(db, "userSettings", userId),
    {
      hideInactiveDashboardCards: settings.hideInactiveDashboardCards,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
