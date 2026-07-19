import { Save, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { useAuth } from "../providers/AuthProvider";
import {
  defaultUserPortalSettings,
  saveUserPortalSettings,
  subscribeUserPortalSettings,
  type UserPortalSettings,
} from "../services/userSettingsService";

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
