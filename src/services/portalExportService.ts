import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

type ExportRow = Record<string, unknown>;

type ExportModule = {
  sheetName: string;
  collections: string[];
};

const excelCellCharacterLimit = 32767;
const truncatedCellSuffix = "\n[Truncated for Excel cell limit]";

const portalExportModules: ExportModule[] = [
  { sheetName: "Settings", collections: ["appSettings"] },
  { sheetName: "Users", collections: ["users"] },
  { sheetName: "Personnel", collections: ["teachers", "personnelCredits"] },
  { sheetName: "Subjects Sections", collections: ["subjects", "sections", "curriculumMappings"] },
  { sheetName: "Loading", collections: ["loadAssignments", "ancillaryLoads"] },
  { sheetName: "Schedules", collections: ["classSchedules", "savedSchedules"] },
  { sheetName: "Enrollment", collections: ["enrollmentStudents", "classEnrollments"] },
  { sheetName: "Grades", collections: ["gradeComputations", "gradeComputationSettings"] },
  { sheetName: "DLL", collections: ["dllRequests", "dllSubmissions"] },
  { sheetName: "MPS", collections: ["mpsRequests", "mpsSubmissions"] },
  { sheetName: "Documents", collections: ["documentRequests", "documentRequestSubmissions"] },
  { sheetName: "Attendance", collections: ["personnelAttendance"] },
  { sheetName: "Observations", collections: ["observationSchedules"] },
  { sheetName: "Certificates", collections: ["certificates", "certificateParticipants", "certificatePeople"] },
];

function getTimestampLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

function getSheetName(sheetName: string) {
  return sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

function normalizeCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return "";

  let normalizedValue: unknown = value;

  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      normalizedValue = maybeTimestamp.toDate().toISOString();
    } else {
      normalizedValue = JSON.stringify(value, (_key, nestedValue) => {
        if (nestedValue && typeof nestedValue === "object" && typeof nestedValue.toDate === "function") {
          return nestedValue.toDate().toISOString();
        }
        return nestedValue;
      });
    }
  }

  if (typeof normalizedValue === "string" && normalizedValue.length > excelCellCharacterLimit) {
    return `${normalizedValue.slice(0, excelCellCharacterLimit - truncatedCellSuffix.length)}${truncatedCellSuffix}`;
  }

  return normalizedValue;
}

function normalizeRow(collectionName: string, docId: string, data: ExportRow): ExportRow {
  const row: ExportRow = {
    _collection: collectionName,
    _docId: docId,
  };

  Object.entries(data).forEach(([key, value]) => {
    row[key] = normalizeCellValue(value);
  });

  return row;
}

function createEmptySheetRow(collectionName: string): ExportRow {
  return {
    _collection: collectionName,
    _docId: "",
    note: "No records found.",
  };
}

export async function exportPortalWorkbook() {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const errors: ExportRow[] = [];

  await Promise.all(portalExportModules.map(async (module) => {
    const moduleRows: ExportRow[] = [];

    await Promise.all(module.collections.map(async (collectionName) => {
      try {
        const snapshot = await getDocs(collection(db, collectionName));
        const rows = snapshot.docs.map((item) => normalizeRow(collectionName, item.id, item.data() as ExportRow));
        moduleRows.push(...(rows.length ? rows : [createEmptySheetRow(collectionName)]));
      } catch (caught) {
        errors.push({
          module: module.sheetName,
          collection: collectionName,
          error: caught instanceof Error ? caught.message : "Unable to export collection.",
        });
      }
    }));

    const sheet = XLSX.utils.json_to_sheet(moduleRows.length ? moduleRows : [{ note: "No readable records found for this module." }]);
    XLSX.utils.book_append_sheet(workbook, sheet, getSheetName(module.sheetName));
  }));

  if (errors.length > 0) {
    const errorSheet = XLSX.utils.json_to_sheet(errors);
    XLSX.utils.book_append_sheet(workbook, errorSheet, "export_errors");
  }

  XLSX.writeFile(workbook, `mshs-portal-full-export-${getTimestampLabel()}.xlsx`);

  return {
    collectionCount: portalExportModules.reduce((count, module) => count + module.collections.length, 0),
    errorCount: errors.length,
  };
}
