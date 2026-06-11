type PrintableColumn<T> = {
  header: string;
  getValue: (row: T) => string | number;
};

type PrintTableOptions<T> = {
  title: string;
  subtitle?: string;
  columns: PrintableColumn<T>[];
  rows: T[];
};

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function printTable<T>({ title, subtitle, columns, rows }: PrintTableOptions<T>) {
  const printWindow = window.open("", "_blank", "width=1100,height=800");

  if (!printWindow) {
    window.print();
    return;
  }

  const generatedAt = new Date().toLocaleString();
  const headerCells = columns
    .map((column) => `<th>${escapeHtml(column.header)}</th>`)
    .join("");
  const bodyRows = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${columns
              .map((column) => `<td>${escapeHtml(column.getValue(row))}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${columns.length}" class="empty">No records found.</td></tr>`;

  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        color: #0f172a;
        font-family: Arial, Helvetica, sans-serif;
        margin: 28px;
      }
      header {
        border-bottom: 2px solid #0f172a;
        margin-bottom: 18px;
        padding-bottom: 12px;
      }
      h1 {
        font-size: 22px;
        margin: 0 0 6px;
      }
      p {
        color: #475569;
        font-size: 12px;
        margin: 3px 0;
      }
      table {
        border-collapse: collapse;
        font-size: 11px;
        width: 100%;
      }
      th,
      td {
        border: 1px solid #cbd5e1;
        padding: 7px 8px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: #e2e8f0;
        color: #0f172a;
        font-weight: 700;
      }
      tr:nth-child(even) td {
        background: #f8fafc;
      }
      .empty {
        color: #64748b;
        padding: 18px;
        text-align: center;
      }
      @page {
        margin: 16mm;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      <p>Records: ${rows.length} | Printed: ${escapeHtml(generatedAt)}</p>
    </header>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <script>
      window.onload = () => {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);
  printWindow.document.close();
}
