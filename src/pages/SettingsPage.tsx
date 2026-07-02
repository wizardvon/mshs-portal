import { Plus, Save, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import {
  defaultSchedulePrintSettings,
  saveSchedulePrintSettings,
  subscribeSchedulePrintSettings,
} from "../services/settingsService";
import { defaultSchoolYear, defaultTerm, type ScheduleBreak, type SchedulePrintSettings, type ScheduleTemplateKey } from "../types/loading";

type SchedulePrintKey = "classSchedule" | "teacherSchedule";
type SignatoryKey = "preparedBy" | "checkedBy" | "notedBy";
type SignatoryField = "name" | "position";
type SlotField = "startTime" | "endTime" | "duration";
type BreakField = "label" | "startTime" | "endTime";

const schedulePrintSections: Array<{ key: SchedulePrintKey; title: string }> = [
  { key: "classSchedule", title: "Class Schedule Signatories" },
  { key: "teacherSchedule", title: "Teacher Schedule Signatories" },
];

const signatoryFields: Array<{ key: SignatoryKey; label: string }> = [
  { key: "preparedBy", label: "Prepared by" },
  { key: "checkedBy", label: "Checked by" },
  { key: "notedBy", label: "Noted by" },
];

const slotSections: Array<{ key: ScheduleTemplateKey; title: string; description: string }> = [
  { key: "grade11Academic", title: "Grade 11 Academic", description: "Used by Grade 11 sections unless they are Tech Pro." },
  { key: "grade11TechPro", title: "Grade 11 Tech Pro", description: "Used by Grade 11 Tech Pro sections." },
  { key: "grade12", title: "Grade 12", description: "Used by all Grade 12 sections." },
];

function timeToMinutes(value: string) {
  const [rawHour, rawMinute = "0"] = value.split(":");
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (hour < 7) hour += 12;
  return hour * 60 + minute;
}

function minutesToTime(value: number) {
  const hour24 = Math.floor(value / 60);
  const minute = value % 60;
  const hour = hour24 > 12 ? hour24 - 12 : hour24;
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function toTimeInputValue(value: string) {
  const [rawHour, rawMinute = "0"] = value.split(":");
  let hour = Number(rawHour);
  if (hour < 7) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(Number(rawMinute)).padStart(2, "0")}`;
}

function fromTimeInputValue(value: string) {
  const [rawHour, rawMinute = "0"] = value.split(":");
  const hour24 = Number(rawHour);
  const hour = hour24 > 12 ? hour24 - 12 : hour24;
  return `${hour}:${String(Number(rawMinute)).padStart(2, "0")}`;
}

function buildSlotId(templateKey: ScheduleTemplateKey, startTime: string, endTime: string) {
  const prefixByTemplate: Record<ScheduleTemplateKey, string> = {
    grade11Academic: "g11",
    grade11TechPro: "g11-techpro",
    grade12: "g12",
  };
  const normalize = (value: string) => value.replace(":", "").padStart(4, "0");
  return `${prefixByTemplate[templateKey]}-${normalize(startTime)}-${normalize(endTime)}`;
}

function buildBreakId(templateKey: ScheduleTemplateKey, label: string, startTime: string, endTime: string) {
  return `${templateKey}-${label || "break"}-${startTime}-${endTime}`.replace(/[^a-zA-Z0-9]/g, "_");
}

function withDerivedSlotFields(templateKey: ScheduleTemplateKey, slot: SchedulePrintSettings["scheduleTimeSlots"][ScheduleTemplateKey][number]) {
  const duration = Math.max(0.5, (timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)) / 60);
  return {
    ...slot,
    duration,
    label: `${slot.startTime}-${slot.endTime}`,
    slotId: buildSlotId(templateKey, slot.startTime, slot.endTime),
  };
}

function withDerivedBreakFields(templateKey: ScheduleTemplateKey, breakRow: ScheduleBreak) {
  return {
    ...breakRow,
    breakId: buildBreakId(templateKey, breakRow.label, breakRow.startTime, breakRow.endTime),
  };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SchedulePrintSettings>(defaultSchedulePrintSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeSchedulePrintSettings(setSettings), []);

  function updateSignatory(
    scheduleKey: SchedulePrintKey,
    signatoryKey: SignatoryKey,
    field: SignatoryField,
    value: string,
  ) {
    setSettings((current) => ({
      ...current,
      [scheduleKey]: {
        ...current[scheduleKey],
        [signatoryKey]: {
          ...current[scheduleKey][signatoryKey],
          [field]: value,
        },
      },
    }));
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage("");

    try {
      await saveSchedulePrintSettings(settings);
      setMessage("Settings saved.");
    } catch {
      setMessage("Unable to save settings. Please check your connection and permissions.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateSlot(templateKey: ScheduleTemplateKey, slotIndex: number, field: SlotField, value: string) {
    setSettings((current) => ({
      ...current,
      scheduleTimeSlots: {
        ...current.scheduleTimeSlots,
        [templateKey]: current.scheduleTimeSlots[templateKey]
          .map((slot, index) => {
            if (index !== slotIndex) return slot;
            const nextSlot = {
              ...slot,
              [field]: field === "duration" ? Number(value) : fromTimeInputValue(value),
            };
            return field === "duration"
              ? { ...nextSlot, label: `${nextSlot.startTime}-${nextSlot.endTime}` }
              : withDerivedSlotFields(templateKey, nextSlot);
          })
          .sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime)),
      },
    }));
  }

  function addSlot(templateKey: ScheduleTemplateKey) {
    setSettings((current) => {
      const slots = current.scheduleTimeSlots[templateKey];
      const lastSlot = slots[slots.length - 1];
      const startTime = lastSlot ? lastSlot.endTime : "7:00";
      const endTime = minutesToTime(timeToMinutes(startTime) + 90);
      const nextSlot = withDerivedSlotFields(templateKey, {
        slotId: "",
        startTime,
        endTime,
        duration: 1.5,
        label: "",
      });

      return {
        ...current,
        scheduleTimeSlots: {
          ...current.scheduleTimeSlots,
          [templateKey]: [...slots, nextSlot],
        },
      };
    });
  }

  function removeSlot(templateKey: ScheduleTemplateKey, slotIndex: number) {
    setSettings((current) => ({
      ...current,
      scheduleTimeSlots: {
        ...current.scheduleTimeSlots,
        [templateKey]: current.scheduleTimeSlots[templateKey].filter((_, index) => index !== slotIndex),
      },
    }));
  }

  function updateBreak(templateKey: ScheduleTemplateKey, breakIndex: number, field: BreakField, value: string) {
    setSettings((current) => ({
      ...current,
      scheduleBreaks: {
        ...current.scheduleBreaks,
        [templateKey]: current.scheduleBreaks[templateKey]
          .map((breakRow, index) => {
            if (index !== breakIndex) return breakRow;
            const nextBreak = {
              ...breakRow,
              [field]: field === "label" ? value : fromTimeInputValue(value),
            };
            return withDerivedBreakFields(templateKey, nextBreak);
          })
          .sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime)),
      },
    }));
  }

  function addBreak(templateKey: ScheduleTemplateKey) {
    setSettings((current) => {
      const breaks = current.scheduleBreaks[templateKey];
      const lastBreak = breaks[breaks.length - 1];
      const startTime = lastBreak ? lastBreak.endTime : "10:00";
      const endTime = minutesToTime(timeToMinutes(startTime) + 15);
      const nextBreak = withDerivedBreakFields(templateKey, {
        breakId: "",
        label: "Health Break",
        startTime,
        endTime,
      });

      return {
        ...current,
        scheduleBreaks: {
          ...current.scheduleBreaks,
          [templateKey]: [...breaks, nextBreak],
        },
      };
    });
  }

  function removeBreak(templateKey: ScheduleTemplateKey, breakIndex: number) {
    setSettings((current) => ({
      ...current,
      scheduleBreaks: {
        ...current.scheduleBreaks,
        [templateKey]: current.scheduleBreaks[templateKey].filter((_, index) => index !== breakIndex),
      },
    }));
  }

  return (
    <section>
      <PageHeader description="Default configuration and print signatories for the SHS loading module." title="Settings" />

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid h-14 w-14 place-items-center rounded-md bg-blue-50 text-blue-700">
          <Settings size={28} />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Default School Year</span>
            <input className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3" readOnly value={defaultSchoolYear} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Default Term</span>
            <input className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3" readOnly value={defaultTerm} />
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Schedule Time Slots</h2>
            <p className="mt-1 text-sm text-slate-600">
              Set the class scheduling slots used by auto-generate, drag-and-drop placement, and printed timetables.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            <Save size={16} /> {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          {slotSections.map((section) => (
            <div className="rounded-md border border-slate-200 p-4" key={section.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">{section.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{section.description}</p>
                </div>
                <button
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => addSlot(section.key)}
                  type="button"
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {settings.scheduleTimeSlots[section.key].map((slot, index) => (
                  <div className="rounded-md bg-slate-50 p-3" key={`${slot.slotId}-${index}`}>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Start</span>
                        <input
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          onChange={(event) => updateSlot(section.key, index, "startTime", event.target.value)}
                          type="time"
                          value={toTimeInputValue(slot.startTime)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">End</span>
                        <input
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          onChange={(event) => updateSlot(section.key, index, "endTime", event.target.value)}
                          type="time"
                          value={toTimeInputValue(slot.endTime)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Hours</span>
                        <input
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          min="0.5"
                          onChange={(event) => updateSlot(section.key, index, "duration", event.target.value)}
                          step="0.5"
                          type="number"
                          value={slot.duration}
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">{slot.label}</span>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={settings.scheduleTimeSlots[section.key].length <= 1}
                        onClick={() => removeSlot(section.key, index)}
                        title="Remove slot"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-slate-600">Breaks</h4>
                    <p className="mt-1 text-xs text-slate-500">Add health, snack, lunch, or other non-class rows.</p>
                  </div>
                  <button
                    className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => addBreak(section.key)}
                    type="button"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {settings.scheduleBreaks[section.key].length === 0 && (
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                      No breaks configured.
                    </p>
                  )}
                  {settings.scheduleBreaks[section.key].map((breakRow, index) => (
                    <div className="rounded-md bg-emerald-50/80 p-3" key={`${breakRow.breakId}-${index}`}>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Label</span>
                        <input
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          onChange={(event) => updateBreak(section.key, index, "label", event.target.value)}
                          placeholder="Health Break"
                          value={breakRow.label}
                        />
                      </label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">Start</span>
                          <input
                            className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            onChange={(event) => updateBreak(section.key, index, "startTime", event.target.value)}
                            type="time"
                            value={toTimeInputValue(breakRow.startTime)}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">End</span>
                          <input
                            className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            onChange={(event) => updateBreak(section.key, index, "endTime", event.target.value)}
                            type="time"
                            value={toTimeInputValue(breakRow.endTime)}
                          />
                        </label>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-emerald-800">
                          {breakRow.startTime}-{breakRow.endTime}
                        </span>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50"
                          onClick={() => removeBreak(section.key, index)}
                          title="Remove break"
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Schedule Print Signatories</h2>
            <p className="mt-1 text-sm text-slate-600">
              Names and positions shown at the bottom of printed class and teacher schedules.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            <Save size={16} /> {isSaving ? "Saving..." : "Save Signatories"}
          </button>
        </div>

        {message && (
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
            {message}
          </p>
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {schedulePrintSections.map((section) => (
            <div className="rounded-md border border-slate-200 p-4" key={section.key}>
              <h3 className="text-sm font-semibold text-slate-950">{section.title}</h3>
              <div className="mt-4 space-y-4">
                {signatoryFields.map((signatory) => (
                  <div className="rounded-md bg-slate-50 p-3" key={signatory.key}>
                    <p className="text-xs font-semibold uppercase text-slate-500">{signatory.label}</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Name</span>
                        <input
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          onChange={(event) =>
                            updateSignatory(section.key, signatory.key, "name", event.target.value)
                          }
                          placeholder="Full name"
                          value={settings[section.key][signatory.key].name}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-slate-600">Position</span>
                        <input
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          onChange={(event) =>
                            updateSignatory(section.key, signatory.key, "position", event.target.value)
                          }
                          placeholder="Position / designation"
                          value={settings[section.key][signatory.key].position}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
