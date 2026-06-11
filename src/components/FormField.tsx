import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function TextField({ label, id, ...props }: TextFieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        id={id}
        className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-civic focus:ring-2 focus:ring-civic/15"
        {...props}
      />
    </label>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

export function SelectField({ label, id, children, ...props }: SelectFieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        id={id}
        className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-civic focus:ring-2 focus:ring-civic/15"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
