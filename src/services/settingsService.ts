import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import type { ScheduleBreak, SchedulePrintSettings, ScheduleTimeSlot } from "../types/loading";

const schedulePrintSettingsRef = doc(db, "appSettings", "schedulePrint");

const grade11AcademicSlots: ScheduleTimeSlot[] = [
  { slotId: "g11-0700-0830", startTime: "7:00", endTime: "8:30", duration: 1.5, label: "7:00-8:30" },
  { slotId: "g11-0830-1000", startTime: "8:30", endTime: "10:00", duration: 1.5, label: "8:30-10:00" },
  { slotId: "g11-1015-1145", startTime: "10:15", endTime: "11:45", duration: 1.5, label: "10:15-11:45" },
  { slotId: "g11-1230-1400", startTime: "12:30", endTime: "2:00", duration: 1.5, label: "12:30-2:00" },
  { slotId: "g11-1400-1600", startTime: "2:00", endTime: "4:00", duration: 2, label: "2:00-4:00" },
];

const grade11TechProSlots: ScheduleTimeSlot[] = [
  { slotId: "g11-techpro-0700-0830", startTime: "7:00", endTime: "8:30", duration: 1.5, label: "7:00-8:30" },
  { slotId: "g11-techpro-0830-1000", startTime: "8:30", endTime: "10:00", duration: 1.5, label: "8:30-10:00" },
  { slotId: "g11-techpro-1015-1145", startTime: "10:15", endTime: "11:45", duration: 1.5, label: "10:15-11:45" },
  { slotId: "g11-techpro-1230-1400", startTime: "12:30", endTime: "2:00", duration: 1.5, label: "12:30-2:00" },
  { slotId: "g11-techpro-1400-1630", startTime: "2:00", endTime: "4:30", duration: 2.5, label: "2:00-4:30" },
];

const grade12Slots: ScheduleTimeSlot[] = [
  { slotId: "g12-0700-0900", startTime: "7:00", endTime: "9:00", duration: 2, label: "7:00-9:00" },
  { slotId: "g12-0915-1115", startTime: "9:15", endTime: "11:15", duration: 2, label: "9:15-11:15" },
  { slotId: "g12-1200-1400", startTime: "12:00", endTime: "2:00", duration: 2, label: "12:00-2:00" },
  { slotId: "g12-1400-1600", startTime: "2:00", endTime: "4:00", duration: 2, label: "2:00-4:00" },
];

const grade11Breaks: ScheduleBreak[] = [
  { breakId: "g11-break-1000-1015", label: "Health Break", startTime: "10:00", endTime: "10:15" },
  { breakId: "g11-lunch-1145-1230", label: "Lunch Break", startTime: "11:45", endTime: "12:30" },
];

const grade12Breaks: ScheduleBreak[] = [
  { breakId: "g12-break-0900-0915", label: "Health Break", startTime: "9:00", endTime: "9:15" },
  { breakId: "g12-lunch-1115-1200", label: "Lunch Break", startTime: "11:15", endTime: "12:00" },
];

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
  scheduleTimeSlots: {
    grade11Academic: grade11AcademicSlots,
    grade11TechPro: grade11TechProSlots,
    grade12: grade12Slots,
  },
  scheduleBreaks: {
    grade11Academic: grade11Breaks,
    grade11TechPro: grade11Breaks,
    grade12: grade12Breaks,
  },
};

function withSlotDefaults(
  slots: Partial<SchedulePrintSettings>["scheduleTimeSlots"],
): SchedulePrintSettings["scheduleTimeSlots"] {
  return {
    grade11Academic:
      slots?.grade11Academic?.length ? slots.grade11Academic : defaultSchedulePrintSettings.scheduleTimeSlots.grade11Academic,
    grade11TechPro:
      slots?.grade11TechPro?.length ? slots.grade11TechPro : defaultSchedulePrintSettings.scheduleTimeSlots.grade11TechPro,
    grade12: slots?.grade12?.length ? slots.grade12 : defaultSchedulePrintSettings.scheduleTimeSlots.grade12,
  };
}

function withBreakDefaults(
  breaks: Partial<SchedulePrintSettings>["scheduleBreaks"],
): SchedulePrintSettings["scheduleBreaks"] {
  return {
    grade11Academic:
      breaks?.grade11Academic ?? defaultSchedulePrintSettings.scheduleBreaks.grade11Academic,
    grade11TechPro:
      breaks?.grade11TechPro ?? defaultSchedulePrintSettings.scheduleBreaks.grade11TechPro,
    grade12: breaks?.grade12 ?? defaultSchedulePrintSettings.scheduleBreaks.grade12,
  };
}

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
    scheduleTimeSlots: withSlotDefaults(settings?.scheduleTimeSlots),
    scheduleBreaks: withBreakDefaults(settings?.scheduleBreaks),
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
