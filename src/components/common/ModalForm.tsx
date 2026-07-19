import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalFormProps = {
  title: string;
  open: boolean;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
};

export function ModalForm({
  title,
  open,
  children,
  onClose,
  onSubmit,
  submitLabel = "Save",
}: ModalFormProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
      <form
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl shadow-slate-950/20"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-wine to-civic px-5 py-4 text-white">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            className="grid h-9 w-9 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto bg-slate-50/50 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-xl bg-civic px-4 text-sm font-bold text-white shadow-sm shadow-red-950/20 transition hover:bg-wine"
            type="submit"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
