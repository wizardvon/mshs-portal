import { Archive } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";

export function BackupRestorePage() {
  return (
    <section>
      <PageHeader description="Administrative backup and restore controls for loading records." title="Backup & Restore" />
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid h-14 w-14 place-items-center rounded-md bg-blue-50 text-blue-700">
          <Archive size={28} />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">Backup workflow ready</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          This page is reserved for export, restore, and audit tooling once the core loading data model is populated.
        </p>
      </div>
    </section>
  );
}
