import type { ReactNode } from "react";

export type DataColumn<T> = {
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
};

type DataTableProps<T> = {
  data: T[];
  columns: DataColumn<T>[];
  emptyText?: string;
  getKey: (row: T) => string;
};

export function DataTable<T>({
  data,
  columns,
  emptyText = "No records found.",
  getKey,
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
      {data.length === 0 ? (
        <div className="p-6 text-sm font-medium text-slate-600">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-gradient-to-r from-wine to-civic text-white">
              <tr>
                {columns.map((column) => (
                  <th
                    className={[
                      "px-4 py-3 text-xs font-bold uppercase tracking-wide",
                      column.align === "right" ? "text-right" : "text-left",
                    ].join(" ")}
                    key={column.header}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {data.map((row) => (
                <tr className="transition hover:bg-red-50/40" key={getKey(row)}>
                  {columns.map((column) => (
                    <td
                      className={[
                        "px-4 py-3.5 align-middle",
                        column.align === "right" ? "text-right" : "text-left",
                      ].join(" ")}
                      key={column.header}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
