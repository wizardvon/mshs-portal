import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";

export type UserPortalSettings = {
  hideInactiveDashboardCards: boolean;
  theme: UserPortalTheme;
  density: UserPortalDensity;
  updatedAt?: unknown;
};

export type UserPortalTheme = "mshs_classic" | "academic_blue" | "dark_mode" | "high_contrast";
export type UserPortalDensity = "comfortable" | "compact";

export const defaultUserPortalSettings: UserPortalSettings = {
  hideInactiveDashboardCards: false,
  theme: "mshs_classic",
  density: "comfortable",
};

function withUserSettingsDefaults(settings?: Partial<UserPortalSettings>): UserPortalSettings {
  return {
    hideInactiveDashboardCards: settings?.hideInactiveDashboardCards ?? defaultUserPortalSettings.hideInactiveDashboardCards,
    theme: settings?.theme ?? defaultUserPortalSettings.theme,
    density: settings?.density ?? defaultUserPortalSettings.density,
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
      theme: settings.theme,
      density: settings.density,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
