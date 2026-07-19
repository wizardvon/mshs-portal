import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
};

export function TextField({ label, id, icon, className, ...props }: TextFieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="relative mt-2">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          className={`mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-red-300 focus:border-civic focus:ring-4 focus:ring-red-100 ${icon ? "pl-11" : ""} ${className ?? ""}`}
          {...props}
        />
      </div>
    </label>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

export function SelectField({ label, id, children, ...props }: SelectFieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select
        id={id}
        className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-ink shadow-sm outline-none transition hover:border-red-300 focus:border-civic focus:ring-4 focus:ring-red-100"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
