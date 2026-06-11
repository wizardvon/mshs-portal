export type ImportColumn = {
  key: string;
  label: string;
  required?: boolean;
};

export type ParsedImportResult<T> = {
  records: T[];
  errors: string[];
};

type ParseOptions<T> = {
  file: File;
  columns: ImportColumn[];
  transform: (row: Record<string, unknown>, rowNumber: number) => T;
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function parseSpreadsheet<T>({
  file,
  columns,
  transform,
}: ParseOptions<T>): Promise<ParsedImportResult<T>> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const requiredLabels = columns
    .filter((column) => column.required)
    .map((column) => column.label);
  const errors: string[] = [];

  if (rows.length === 0) {
    return { records: [], errors: ["The spreadsheet has no data rows."] };
  }

  const firstRowHeaders = Object.keys(rows[0]).map(normalizeHeader);
  const missingHeaders = requiredLabels.filter(
    (label) => !firstRowHeaders.includes(normalizeHeader(label)),
  );

  if (missingHeaders.length > 0) {
    return {
      records: [],
      errors: [`Missing required columns: ${missingHeaders.join(", ")}.`],
    };
  }

  const records = rows
    .map((rawRow, index) => {
      const normalizedRow = Object.entries(rawRow).reduce<Record<string, unknown>>(
        (nextRow, [header, value]) => {
          nextRow[normalizeHeader(header)] = value;
          return nextRow;
        },
        {},
      );

      const mappedRow = columns.reduce<Record<string, unknown>>((nextRow, column) => {
        nextRow[column.key] = normalizedRow[normalizeHeader(column.label)];
        return nextRow;
      }, {});

      try {
        return transform(mappedRow, index + 2);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Row ${index + 2}: Invalid data.`);
        return null;
      }
    })
    .filter((record): record is T => Boolean(record));

  return { records, errors };
}

export function requireText(
  value: unknown,
  rowNumber: number,
  columnName: string,
) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`Row ${rowNumber}: ${columnName} is required.`);
  }
  return text;
}

export function optionalStatus(value: unknown) {
  const status = String(value || "active").trim().toLowerCase();
  if (status !== "active" && status !== "inactive") {
    throw new Error('Status must be "active" or "inactive".');
  }
  return status;
}

export function requireNumber(
  value: unknown,
  rowNumber: number,
  columnName: string,
) {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    throw new Error(`Row ${rowNumber}: ${columnName} must be a number.`);
  }
  return numberValue;
}
