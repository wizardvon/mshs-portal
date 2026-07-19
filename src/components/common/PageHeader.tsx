import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-red-100 bg-white/90 shadow-sm shadow-slate-200/70">
      <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <div className="mb-3 h-1 w-14 rounded-full bg-signal" />
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
