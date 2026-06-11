import type { LucideIcon } from "lucide-react";

type SummaryCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
};

export function SummaryCard({ label, value, detail, icon: Icon }: SummaryCardProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
          {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-blue-700">
          <Icon size={20} />
        </div>
      </div>
    </article>
  );
}
