import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  parseSpreadsheet,
  type ImportColumn,
  type ParsedImportResult,
} from "../../utils/excelImport";

type ExcelImportButtonProps<T> = {
  columns: ImportColumn[];
  disabled?: boolean;
  formatNote: string;
  label?: string;
  onImport: (records: T[]) => Promise<void>;
  transform: (row: Record<string, unknown>, rowNumber: number) => T;
};

export function ExcelImportButton<T>({
  columns,
  disabled,
  formatNote,
  label = "Upload Excel",
  onImport,
  transform,
}: ExcelImportButtonProps<T>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  async function handleFile(file: File) {
    setMessage("");
    setError("");
    setImporting(true);

    try {
      const result: ParsedImportResult<T> = await parseSpreadsheet({
        file,
        columns,
        transform,
      });

      if (result.errors.length > 0) {
        setError(result.errors.slice(0, 4).join(" "));
        return;
      }

      await onImport(result.records);
      setMessage(`Imported ${result.records.length} record(s).`);
    } catch {
      setError("Unable to import this file. Use .xlsx, .xls, or .csv with the required headers.");
    } finally {
      setImporting(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Excel import format</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{formatNote}</p>
        </div>
        <button
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || importing}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload size={16} /> {importing ? "Importing..." : label}
        </button>
      </div>
      {message && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <input
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}
