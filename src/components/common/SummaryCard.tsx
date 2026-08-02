import type { LucideIcon } from "lucide-react";

type SummaryCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
};

export function SummaryCard({ label, value, detail, icon: Icon }: SummaryCardProps) {
  return (
    <article className="group h-full min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-red-100 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-3 break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">{value}</p>
          {detail && <p className="mt-2 break-words text-xs font-medium text-slate-500">{detail}</p>}
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-civic ring-1 ring-red-100 transition group-hover:bg-civic group-hover:text-white">
          <Icon size={20} />
        </div>
      </div>
    </article>
  );
}
