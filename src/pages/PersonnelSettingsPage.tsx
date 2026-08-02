import { Palette, Rows3, Save, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { useAuth } from "../providers/AuthProvider";
import {
  defaultUserPortalSettings,
  saveUserPortalSettings,
  subscribeUserPortalSettings,
  type UserPortalSettings,
} from "../services/userSettingsService";

const themeOptions: Array<{ value: UserPortalSettings["theme"]; label: string; detail: string; swatch: string }> = [
  { value: "mshs_classic", label: "MSHS Classic", detail: "School red accents with clean white cards.", swatch: "bg-civic" },
  { value: "academic_blue", label: "Academic Blue", detail: "Official blue accents for a calmer workspace.", swatch: "bg-blue-700" },
  { value: "dark_mode", label: "Dark Mode", detail: "Lower-light interface for night or dim rooms.", swatch: "bg-slate-950" },
  { value: "high_contrast", label: "High Contrast", detail: "Sharper borders and stronger text for readability.", swatch: "bg-black" },
];

const densityOptions: Array<{ value: UserPortalSettings["density"]; label: string; detail: string }> = [
  { value: "comfortable", label: "Comfort View", detail: "Larger spacing and easier touch targets." },
  { value: "compact", label: "Compact Professional", detail: "Tighter cards and tables to show more information." },
];

export function PersonnelSettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<UserPortalSettings>(defaultUserPortalSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeUserPortalSettings(profile?.userId, setSettings), [profile?.userId]);

  async function handleSave() {
    if (!profile) return;

    setIsSaving(true);
    setMessage("");

    try {
      await saveUserPortalSettings(profile.userId, settings);
      setMessage("Settings saved.");
    } catch {
      setMessage("Unable to save settings. Please check your connection and permissions.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <PageHeader description="Personal portal preferences for your account." title="Settings" />

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="grid h-14 w-14 place-items-center rounded-md bg-blue-50 text-blue-700">
            <Settings size={28} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose how your dashboard cards appear when there is no pending work or active issue.
          </p>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <input
            checked={settings.hideInactiveDashboardCards}
            className="mt-1 h-4 w-4 rounded border-slate-300"
            onChange={(event) => setSettings({ ...settings, hideInactiveDashboardCards: event.target.checked })}
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Hide inactive dashboard cards</span>
            <span className="mt-1 block text-xs font-medium text-slate-500">
              Show only dashboard cards with active requests, pending work, issues, or current records.
            </span>
          </span>
        </label>

        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-red-50 text-civic">
              <Palette size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Theme</h2>
              <p className="mt-1 text-sm text-slate-600">Choose the color style used across your portal.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {themeOptions.map((option) => (
              <label
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition",
                  settings.theme === option.value ? "border-civic bg-red-50" : "border-slate-200 bg-slate-50 hover:bg-white",
                ].join(" ")}
                key={option.value}
              >
                <input
                  checked={settings.theme === option.value}
                  className="mt-1 h-4 w-4 border-slate-300 text-civic"
                  onChange={() => setSettings({ ...settings, theme: option.value })}
                  type="radio"
                />
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-full ring-1 ring-slate-200 ${option.swatch}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                    <span className="mt-1 block text-xs font-medium text-slate-500">{option.detail}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-700">
              <Rows3 size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Display Density</h2>
              <p className="mt-1 text-sm text-slate-600">Choose how much space the portal uses around cards and controls.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {densityOptions.map((option) => (
              <label
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition",
                  settings.density === option.value ? "border-civic bg-red-50" : "border-slate-200 bg-slate-50 hover:bg-white",
                ].join(" ")}
                key={option.value}
              >
                <input
                  checked={settings.density === option.value}
                  className="mt-1 h-4 w-4 border-slate-300 text-civic"
                  onChange={() => setSettings({ ...settings, density: option.value })}
                  type="radio"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSaving || !profile}
            onClick={() => void handleSave()}
            type="button"
          >
            <Save size={16} /> {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {message && (
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
