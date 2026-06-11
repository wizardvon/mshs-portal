import { Settings } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { defaultSchoolYear, defaultTerm } from "../types/loading";

export function SettingsPage() {
  return (
    <section>
      <PageHeader description="Default configuration for the SHS loading module." title="Settings" />
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
    </section>
  );
}
