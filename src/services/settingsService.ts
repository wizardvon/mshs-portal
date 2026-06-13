import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { SchedulePrintSettings } from "../types/loading";

const schedulePrintSettingsRef = doc(db, "appSettings", "schedulePrint");

export const defaultSchedulePrintSettings: SchedulePrintSettings = {
  classSchedule: {
    preparedBy: { name: "", position: "" },
    checkedBy: { name: "", position: "" },
    notedBy: { name: "", position: "" },
  },
  teacherSchedule: {
    preparedBy: { name: "", position: "" },
    checkedBy: { name: "", position: "" },
    notedBy: { name: "", position: "" },
  },
};

function withDefaults(settings?: Partial<SchedulePrintSettings>): SchedulePrintSettings {
  return {
    classSchedule: {
      preparedBy: {
        ...defaultSchedulePrintSettings.classSchedule.preparedBy,
        ...settings?.classSchedule?.preparedBy,
      },
      checkedBy: {
        ...defaultSchedulePrintSettings.classSchedule.checkedBy,
        ...settings?.classSchedule?.checkedBy,
      },
      notedBy: {
        ...defaultSchedulePrintSettings.classSchedule.notedBy,
        ...settings?.classSchedule?.notedBy,
      },
    },
    teacherSchedule: {
      preparedBy: {
        ...defaultSchedulePrintSettings.teacherSchedule.preparedBy,
        ...settings?.teacherSchedule?.preparedBy,
      },
      checkedBy: {
        ...defaultSchedulePrintSettings.teacherSchedule.checkedBy,
        ...settings?.teacherSchedule?.checkedBy,
      },
      notedBy: {
        ...defaultSchedulePrintSettings.teacherSchedule.notedBy,
        ...settings?.teacherSchedule?.notedBy,
      },
    },
    updatedAt: settings?.updatedAt,
  };
}

export function subscribeSchedulePrintSettings(
  callback: (settings: SchedulePrintSettings) => void,
): Unsubscribe {
  return onSnapshot(schedulePrintSettingsRef, (snapshot) => {
    callback(withDefaults(snapshot.exists() ? (snapshot.data() as SchedulePrintSettings) : undefined));
  });
}

export async function saveSchedulePrintSettings(settings: SchedulePrintSettings) {
  await setDoc(
    schedulePrintSettingsRef,
    {
      ...settings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
