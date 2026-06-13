import { Save, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import {
  defaultSchedulePrintSettings,
  saveSchedulePrintSettings,
  subscribeSchedulePrintSettings,
} from "../services/settingsService";
import { defaultSchoolYear, defaultTerm, type SchedulePrintSettings } from "../types/loading";

type SchedulePrintKey = "classSchedule" | "teacherSchedule";
type SignatoryKey = "preparedBy" | "checkedBy" | "notedBy";
type SignatoryField = "name" | "position";

const schedulePrintSections: Array<{ key: SchedulePrintKey; title: string }> = [
  { key: "classSchedule", title: "Class Schedule Signatories" },
  { key: "teacherSchedule", title: "Teacher Schedule Signatories" },
];

const signatoryFields: Array<{ key: SignatoryKey; label: string }> = [
  { key: "preparedBy", label: "Prepared by" },
  { key: "checkedBy", label: "Checked by" },
  { key: "notedBy", label: "Noted by" },
];

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
      setMessage("Schedule print signatories saved.");
    } catch {
      setMessage("Unable to save signatories. Please check your connection and permissions.");
    } finally {
      setIsSaving(false);
    }
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
