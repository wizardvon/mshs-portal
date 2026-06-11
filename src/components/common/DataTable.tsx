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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {data.length === 0 ? (
        <div className="p-5 text-sm text-slate-600">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {columns.map((column) => (
                  <th
                    className={[
                      "px-4 py-3 font-semibold",
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
                <tr className="hover:bg-slate-50/70" key={getKey(row)}>
                  {columns.map((column) => (
                    <td
                      className={[
                        "px-4 py-3 align-middle",
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
