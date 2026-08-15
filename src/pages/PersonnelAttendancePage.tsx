import { BriefcaseBusiness, CalendarDays, CheckCircle2, ClipboardList, Minus, Plus, Save, Search, Trash2, UsersRound, XCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { subscribeCollection } from "../services/firestoreCrud";
import {
  deleteAllPersonnelAttendance,
  deletePersonnelAttendanceByDate,
  adjustPersonnelCredit,
  getAttendanceId,
  subscribePersonnelCreditLogs,
  subscribePersonnelCredits,
  upsertPersonnelAttendanceBatch,
} from "../services/personnelAttendanceService";
import { subscribeTeachers } from "../services/teacherService";
import { useAuth } from "../providers/AuthProvider";
import type { UserProfile } from "../types";
import type {
  PersonnelAttendanceRecord,
  PersonnelAttendanceStatus,
  PersonnelCreditBalance,
  PersonnelCreditLog,
  PersonnelCreditType,
  PersonnelStaffType,
  Teacher,
} from "../types/loading";
import { getRoleLabel } from "../utils/accessControl";

type StaffRow = {
  staffId: string;
  staffName: string;
  roleOrPosition: string;
  staffType: PersonnelStaffType;
};

type AttendanceDraft = Pick<PersonnelAttendanceRecord, "status" | "remarks" | "absenceCreditType">;
type DailyAttendanceSummary = {
  attendanceDate: string;
  recorded: number;
  present: number;
  absent: number;
  officialBusiness: number;
  teaching: number;
  nonTeaching: number;
  remarks: string[];
};

const attendanceStatuses: Array<{ value: PersonnelAttendanceStatus; label: string }> = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "official_business", label: "Official Business" },
];

const creditTypes: Array<{ value: PersonnelCreditType; label: string }> = [
  { value: "specialOrderServiceCredit", label: "Special Order Service Credit" },
  { value: "localServiceCredit", label: "Local Service Credit" },
  { value: "wellnessBreak", label: "Wellness Break" },
  { value: "leaveCredits", label: "Leave Credits" },
];

const staffTypeLabels: Record<PersonnelStaffType, string> = {
  teaching: "Teaching",
  non_teaching: "Non-teaching",
};
const deleteAttendancePassword = "dxuxihnfwcls";

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAttendanceKey(staffType: PersonnelStaffType, staffId: string) {
  return `${staffType}:${staffId}`;
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTimestamp(value: PersonnelCreditLog["createdAt"]) {
  if (!value?.toDate) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value.toDate());
}

function normalizeStaffName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getStaffNameSignature(value: string) {
  const parts = normalizeStaffName(value)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function getDefaultDraft(record?: PersonnelAttendanceRecord): AttendanceDraft {
  return {
    status: attendanceStatuses.some((status) => status.value === record?.status) ? record?.status ?? "present" : "present",
    absenceCreditType: record?.absenceCreditType,
    remarks: record?.remarks ?? "",
  };
}

function getNumberInputValue(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function getCreditLabel(value?: PersonnelCreditType) {
  return creditTypes.find((type) => type.value === value)?.label ?? "None";
}

export function PersonnelAttendancePage() {
  const { profile } = useAuth();
  const [attendanceDate, setAttendanceDate] = useState(getTodayInputValue);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<PersonnelAttendanceRecord[]>([]);
  const [credits, setCredits] = useState<PersonnelCreditBalance[]>([]);
  const [creditLogs, setCreditLogs] = useState<PersonnelCreditLog[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [staffTypeFilter, setStaffTypeFilter] = useState<"all" | PersonnelStaffType>("all");
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCredits, setIsSavingCredits] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canDeleteAllAttendance = profile?.role === "super_admin";

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<UserProfile>("users", setUsers), []);
  useEffect(() => subscribeCollection<PersonnelAttendanceRecord>("personnelAttendance", setAllAttendanceRecords), []);
  useEffect(() => subscribePersonnelCredits(setCredits), []);
  useEffect(() => subscribePersonnelCreditLogs(setCreditLogs), []);
  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (Object.keys(drafts).length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [drafts]);

  const selectedAttendanceRecords = useMemo(
    () =>
      allAttendanceRecords
        .filter((record) => record.attendanceDate === attendanceDate)
        .sort((first, second) => first.staffName.localeCompare(second.staffName)),
    [allAttendanceRecords, attendanceDate],
  );
  const recordsByStaffKey = useMemo(
    () => new Map(selectedAttendanceRecords.map((record) => [getAttendanceKey(record.staffType, record.staffId), record])),
    [selectedAttendanceRecords],
  );
  const creditsByStaffId = useMemo(
    () => new Map(credits.map((credit) => [credit.staffId, credit])),
    [credits],
  );

  const staffRows = useMemo<StaffRow[]>(() => {
    const teachingRows = teachers
      .filter((teacher) => teacher.status === "active")
      .map((teacher) => ({
        staffId: teacher.teacherId,
        staffName: teacher.fullName,
        roleOrPosition: teacher.position || "Teacher",
        staffType: "teaching" as const,
      }));
    const teachingNames = new Set(teachingRows.map((row) => normalizeStaffName(row.staffName)));
    const teachingNameSignatures = new Set(teachingRows.map((row) => getStaffNameSignature(row.staffName)));

    const masterTeacherRows = users
      .filter(
        (user) =>
          user.status === "approved" &&
          user.role === "master_teacher" &&
          !teachingNames.has(normalizeStaffName(user.fullName)) &&
          !teachingNameSignatures.has(getStaffNameSignature(user.fullName)),
      )
      .map((user) => ({
        staffId: user.userId,
        staffName: user.fullName,
        roleOrPosition: getRoleLabel(user.role),
        staffType: "teaching" as const,
      }));

    const nonTeachingRows = users
      .filter(
        (user) =>
          user.status === "approved" &&
          user.role !== "teacher" &&
          user.role !== "master_teacher" &&
          user.role !== "super_admin",
      )
      .map((user) => ({
        staffId: user.userId,
        staffName: user.fullName,
        roleOrPosition: getRoleLabel(user.role),
        staffType: "non_teaching" as const,
      }));

    return [...teachingRows, ...masterTeacherRows, ...nonTeachingRows].sort((first, second) =>
      `${first.staffType} ${first.staffName}`.localeCompare(`${second.staffType} ${second.staffName}`),
    );
  }, [teachers, users]);

  const visibleRows = useMemo(
    () =>
      staffRows.filter((row) => {
        const matchesType = staffTypeFilter === "all" || row.staffType === staffTypeFilter;
        const searchable = `${row.staffName} ${row.roleOrPosition} ${staffTypeLabels[row.staffType]}`.toLowerCase();
        return matchesType && searchable.includes(search.trim().toLowerCase());
      }),
    [search, staffRows, staffTypeFilter],
  );

  const summary = useMemo(
    () => ({
      totalStaff: staffRows.length,
      recorded: selectedAttendanceRecords.length,
      present: selectedAttendanceRecords.filter((record) => record.status === "present").length,
      absent: selectedAttendanceRecords.filter((record) => record.status === "absent").length,
      officialBusiness: selectedAttendanceRecords.filter((record) => record.status === "official_business").length,
    }),
    [selectedAttendanceRecords, staffRows.length],
  );

  const dailySummaries = useMemo<DailyAttendanceSummary[]>(() => {
    const summariesByDate = new Map<string, DailyAttendanceSummary>();

    allAttendanceRecords.forEach((record) => {
      const summaryForDate = summariesByDate.get(record.attendanceDate) ?? {
        attendanceDate: record.attendanceDate,
        recorded: 0,
        present: 0,
        absent: 0,
        officialBusiness: 0,
        teaching: 0,
        nonTeaching: 0,
        remarks: [],
      };

      summaryForDate.recorded += 1;
      if (record.status === "present") summaryForDate.present += 1;
      if (record.status === "absent") summaryForDate.absent += 1;
      if (record.status === "official_business") summaryForDate.officialBusiness += 1;
      if (record.staffType === "teaching") summaryForDate.teaching += 1;
      if (record.staffType === "non_teaching") summaryForDate.nonTeaching += 1;
      if (record.remarks.trim() && !summaryForDate.remarks.includes(record.remarks.trim())) {
        summaryForDate.remarks.push(record.remarks.trim());
      }
      summariesByDate.set(record.attendanceDate, summaryForDate);
    });

    return Array.from(summariesByDate.values()).sort((first, second) => second.attendanceDate.localeCompare(first.attendanceDate));
  }, [allAttendanceRecords]);

  function updateDraft(row: StaffRow, updates: Partial<AttendanceDraft>) {
    const key = getAttendanceKey(row.staffType, row.staffId);
    const record = recordsByStaffKey.get(key);
    const nextUpdates = updates.status && updates.status !== "absent"
      ? { ...updates, absenceCreditType: undefined }
      : updates;
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...getDefaultDraft(record),
        ...current[key],
        ...nextUpdates,
      },
    }));
  }

  function getDraft(row: StaffRow) {
    const key = getAttendanceKey(row.staffType, row.staffId);
    return drafts[key] ?? getDefaultDraft(recordsByStaffKey.get(key));
  }

  function selectAttendanceDate(nextDate: string) {
    if (nextDate === attendanceDate) return;
    if (Object.keys(drafts).length > 0 && !window.confirm("You have unsaved attendance changes. Continue without saving?")) return;
    setDrafts({});
    setAttendanceDate(nextDate);
  }

  function getCreditBalance(row: StaffRow, creditType: PersonnelCreditType) {
    return creditsByStaffId.get(row.staffId)?.[creditType] ?? 0;
  }

  function getCreditRecordForRow(row: StaffRow, overrides: Partial<PersonnelCreditBalance> = {}) {
    const currentCredit = creditsByStaffId.get(row.staffId);
    return {
      staffId: row.staffId,
      staffName: row.staffName,
      staffType: row.staffType,
      roleOrPosition: row.roleOrPosition,
      specialOrderServiceCredit: currentCredit?.specialOrderServiceCredit ?? 0,
      localServiceCredit: currentCredit?.localServiceCredit ?? 0,
      wellnessBreak: currentCredit?.wellnessBreak ?? 0,
      leaveCredits: currentCredit?.leaveCredits ?? 0,
      remarks: currentCredit?.remarks ?? "",
      updatedBy: profile?.userId ?? "",
      updaterName: profile?.fullName ?? "",
      ...overrides,
    };
  }

  async function saveAttendanceForDate(dateToSave = attendanceDate, remarkOverride?: string) {
    if (!profile) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const attendanceRecords = staffRows.map((row) => {
        const draft = getDraft(row);
        const status = dateToSave === attendanceDate ? draft.status : "present";

        return {
          attendanceDate: dateToSave,
          staffType: row.staffType,
          staffId: row.staffId,
          staffName: row.staffName,
          roleOrPosition: row.roleOrPosition,
          status,
          ...(status === "absent" && draft.absenceCreditType ? { absenceCreditType: draft.absenceCreditType } : {}),
          remarks: typeof remarkOverride === "string" ? remarkOverride.trim() : draft.remarks.trim(),
          recordedBy: profile.userId,
          recorderName: profile.fullName,
        };
      });
      const previousRecordsByStaffKey = new Map(
        allAttendanceRecords
          .filter((record) => record.attendanceDate === dateToSave)
          .map((record) => [getAttendanceKey(record.staffType, record.staffId), record]),
      );
      const creditUpdatesByStaffId = new Map<string, ReturnType<typeof getCreditRecordForRow>>();
      const creditLogs: Array<Omit<PersonnelCreditLog, "logId" | "createdAt">> = [];

      for (const row of staffRows) {
        const nextRecord = attendanceRecords.find((record) => record.staffId === row.staffId && record.staffType === row.staffType);
        const previousRecord = previousRecordsByStaffKey.get(getAttendanceKey(row.staffType, row.staffId));
        const previousCreditType = previousRecord?.status === "absent" ? previousRecord.absenceCreditType : undefined;
        const nextCreditType = nextRecord?.status === "absent" ? nextRecord.absenceCreditType : undefined;

        if (nextRecord?.status === "absent" && !nextCreditType) {
          throw new Error(`Choose a credit type for ${row.staffName}'s absence.`);
        }

        const creditChanges: Array<{ creditType: PersonnelCreditType; amount: number; source: PersonnelCreditLog["source"] }> = [];
        if (previousCreditType) creditChanges.push({ creditType: previousCreditType, amount: 1, source: "absence_refund" });
        if (nextCreditType) creditChanges.push({ creditType: nextCreditType, amount: -1, source: "absence_deduction" });
        if (creditChanges.length === 0) continue;

        let creditRecord = creditUpdatesByStaffId.get(row.staffId) ?? getCreditRecordForRow(row);
        creditChanges.forEach((change) => {
          const previousBalance = creditRecord[change.creditType];
          const newBalance = previousBalance + change.amount;
          if (newBalance < 0) {
            throw new Error(`${row.staffName} does not have enough ${getCreditLabel(change.creditType)}.`);
          }

          creditLogs.push({
            staffId: row.staffId,
            staffName: row.staffName,
            staffType: row.staffType,
            roleOrPosition: row.roleOrPosition,
            creditType: change.creditType,
            source: change.source,
            amount: change.amount,
            previousBalance,
            newBalance,
            attendanceId: getAttendanceId(dateToSave, row.staffType, row.staffId),
            attendanceDate: dateToSave,
            remarks: change.source === "absence_deduction"
              ? `Deducted for absence on ${formatDate(dateToSave)}.`
              : `Returned after attendance change on ${formatDate(dateToSave)}.`,
            createdBy: profile.userId,
            creatorName: profile.fullName,
          });
          creditRecord = {
            ...creditRecord,
            [change.creditType]: newBalance,
          };
        });
        creditUpdatesByStaffId.set(row.staffId, creditRecord);
      }

      const savedCount = await upsertPersonnelAttendanceBatch(
        attendanceRecords,
        Array.from(creditUpdatesByStaffId.values()),
        creditLogs,
      );
      setAttendanceDate(dateToSave);
      setDrafts({});
      setMessage(`Saved attendance for ${savedCount} personnel on ${formatDate(dateToSave)}${creditLogs.length ? ` and logged ${creditLogs.length} credit transaction${creditLogs.length === 1 ? "" : "s"}.` : "."}`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to save attendance.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createAttendance() {
    if (!profile) return;
    if (staffRows.length === 0) {
      setMessage("");
      setError("No personnel available for attendance.");
      return;
    }

    const dateValue = window.prompt("Choose attendance date (YYYY-MM-DD).", attendanceDate || getTodayInputValue());
    if (dateValue === null) return;

    const trimmedDate = dateValue.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate) || Number.isNaN(new Date(`${trimmedDate}T00:00:00`).getTime())) {
      setMessage("");
      setError("Enter a valid attendance date using YYYY-MM-DD.");
      return;
    }

    const existingSummary = dailySummaries.find((day) => day.attendanceDate === trimmedDate);
    if (existingSummary && !window.confirm(`Attendance for ${formatDate(trimmedDate)} already exists. Create/update this attendance date?`)) {
      return;
    }

    const remarkValue = window.prompt("Attendance remark (optional).", existingSummary?.remarks.join("; ") ?? "");
    if (remarkValue === null) return;

    await saveAttendanceForDate(trimmedDate, remarkValue);
  }

  async function saveSelectedSummaryDate(dateToSave: string) {
    if (!window.confirm(`Save attendance changes for ${formatDate(dateToSave)}?`)) return;
    await saveAttendanceForDate(dateToSave);
  }

  async function deleteSummaryDate(dateToDelete: string) {
    if (!window.confirm(`Delete attendance records for ${formatDate(dateToDelete)}?`)) return;

    setIsDeleting(true);
    setMessage("");
    setError("");

    try {
      const deletedCount = await deletePersonnelAttendanceByDate(dateToDelete);
      setDrafts({});
      setMessage(`Deleted ${deletedCount} attendance record${deletedCount === 1 ? "" : "s"} for ${formatDate(dateToDelete)}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete attendance for the selected date.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function adjustCreditForRow(row: StaffRow, direction: 1 | -1) {
    if (!profile) return;
    const selectedType = window.prompt(
      `Which credit should be ${direction > 0 ? "added" : "subtracted"}?\n\n${creditTypes.map((type, index) => `${index + 1}. ${type.label}`).join("\n")}`,
      "1",
    );
    if (selectedType === null) return;

    const optionIndex = Number(selectedType.trim()) - 1;
    const creditType = creditTypes[optionIndex]?.value;
    if (!creditType) {
      setMessage("");
      setError("Choose a valid credit option number.");
      return;
    }

    const amountValue = window.prompt(`Enter credit amount to ${direction > 0 ? "add" : "subtract"}.`, "1");
    if (amountValue === null) return;

    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("");
      setError("Enter a valid credit amount greater than zero.");
      return;
    }

    const remarks = window.prompt("Reason for this credit adjustment.", "");
    if (remarks === null) return;

    setIsSavingCredits(true);
    setMessage("");
    setError("");

    try {
      await adjustPersonnelCredit(
        getCreditRecordForRow(row, {
          updatedBy: profile.userId,
          updaterName: profile.fullName,
        }),
        creditType,
        amount * direction,
        remarks.trim() || `${direction > 0 ? "Added" : "Subtracted"} ${getCreditLabel(creditType)}.`,
      );
      setMessage(`${direction > 0 ? "Added" : "Subtracted"} ${amount} ${getCreditLabel(creditType)} for ${row.staffName}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to adjust credit balance.");
    } finally {
      setIsSavingCredits(false);
    }
  }

  async function deleteAllAttendance() {
    const password = window.prompt("Enter password to delete all personnel attendance records.");
    if (password === null) return;

    if (password !== deleteAttendancePassword) {
      setMessage("");
      setError("Incorrect password. Attendance records were not deleted.");
      return;
    }

    const confirmed = window.confirm("Delete ALL personnel attendance records? This cannot be undone.");
    if (!confirmed) return;

    setIsDeleting(true);
    setMessage("");
    setError("");

    try {
      const deletedCount = await deleteAllPersonnelAttendance();
      setDrafts({});
      setMessage(`Deleted ${deletedCount} attendance record${deletedCount === 1 ? "" : "s"}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete attendance records.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
              disabled={isSaving || isSavingCredits || isDeleting || staffRows.length === 0}
              onClick={() => void createAttendance()}
              type="button"
            >
              <Plus size={16} /> {isSaving ? "Creating..." : "Create Attendance"}
            </button>
            {canDeleteAllAttendance && (
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving || isSavingCredits || isDeleting}
                onClick={() => void deleteAllAttendance()}
                type="button"
              >
                <Trash2 size={16} /> {isDeleting ? "Deleting..." : "Delete All Attendance"}
              </button>
            )}
          </div>
        }
        description="Record daily attendance for teaching and non-teaching personnel."
        title="Personnel Attendance"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard detail="teaching and non-teaching" icon={UsersRound} label="Personnel" value={summary.totalStaff} />
        <SummaryCard detail="records saved today" icon={CalendarDays} label="Recorded" value={summary.recorded} />
        <SummaryCard detail="present for duty" icon={CheckCircle2} label="Present" value={summary.present} />
        <SummaryCard detail="not present" icon={XCircle} label="Absent" value={summary.absent} />
        <SummaryCard detail="official business" icon={BriefcaseBusiness} label="Official Business" value={summary.officialBusiness} />
      </div>

      {(message || error) && (
        <p className={`mt-5 rounded-md px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </p>
      )}

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            onChange={(event) => setStaffTypeFilter(event.target.value as "all" | PersonnelStaffType)}
            value={staffTypeFilter}
          >
            <option value="all">All personnel</option>
            <option value="teaching">Teaching staff</option>
            <option value="non_teaching">Non-teaching staff</option>
          </select>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              className="h-10 w-full rounded-md border border-slate-300 px-10 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search personnel"
              value={search}
            />
          </label>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Daily Summary</h2>
            <p className="mt-1 text-xs text-slate-500">Select a date to show personnel cards inside the summary.</p>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
            <ClipboardList size={16} /> {dailySummaries.length} date{dailySummaries.length === 1 ? "" : "s"} recorded
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Recorded</th>
                <th className="px-4 py-3 font-semibold">Present</th>
                <th className="px-4 py-3 font-semibold">Absent</th>
                <th className="px-4 py-3 font-semibold">Official Business</th>
                <th className="px-4 py-3 font-semibold">Teaching</th>
                <th className="px-4 py-3 font-semibold">Non-teaching</th>
                <th className="px-4 py-3 font-semibold">Unrecorded</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {dailySummaries.map((day) => {
                const isSelected = day.attendanceDate === attendanceDate;
                const unrecorded = Math.max(staffRows.length - day.recorded, 0);

                return (
                  <Fragment key={day.attendanceDate}>
                    <tr
                      className={`cursor-pointer transition hover:bg-civic/5 ${isSelected ? "bg-civic/10" : ""}`}
                      onClick={() => selectAttendanceDate(day.attendanceDate)}
                      title="View attendance for this date"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{formatDate(day.attendanceDate)}</p>
                        <p className="mt-1 text-xs text-slate-500">{day.attendanceDate}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold">{day.recorded}</td>
                      <td className="px-4 py-3 text-emerald-700">{day.present}</td>
                      <td className="px-4 py-3 text-red-700">{day.absent}</td>
                      <td className="px-4 py-3 text-amber-700">{day.officialBusiness}</td>
                      <td className="px-4 py-3">{day.teaching}</td>
                      <td className="px-4 py-3">{day.nonTeaching}</td>
                      <td className="px-4 py-3">{unrecorded}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-slate-500">{day.remarks.join("; ") || "None"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                          <button
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving || isDeleting || !isSelected}
                            onClick={() => void saveSelectedSummaryDate(day.attendanceDate)}
                            type="button"
                          >
                            <Save size={14} /> Save
                          </button>
                          <button
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving || isDeleting}
                            onClick={() => void deleteSummaryDate(day.attendanceDate)}
                            type="button"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isSelected && (
                      <tr key={`${day.attendanceDate}-personnel`}>
                        <td className="bg-slate-50 px-4 py-4" colSpan={10}>
                          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                            <table className="w-full min-w-[760px] text-left text-sm">
                              <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                  <th className="px-4 py-3 font-semibold">Personnel</th>
                                  <th className="px-4 py-3 font-semibold">Type</th>
                                  <th className="px-4 py-3 font-semibold">Status</th>
                                  <th className="px-4 py-3 font-semibold">Credit Used</th>
                                  <th className="px-4 py-3 font-semibold">Remarks</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {visibleRows.map((row) => {
                                  const key = getAttendanceKey(row.staffType, row.staffId);
                                  const draft = getDraft(row);

                                  return (
                                    <tr key={key}>
                                      <td className="px-4 py-3">
                                        <p className="font-medium text-slate-950">{row.staffName}</p>
                                        <p className="mt-1 text-xs text-slate-500">{row.roleOrPosition}</p>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                                          {staffTypeLabels[row.staffType]}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <select
                                          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                                          onChange={(event) => updateDraft(row, { status: event.target.value as PersonnelAttendanceStatus })}
                                          value={draft.status}
                                        >
                                          {attendanceStatuses.map((status) => (
                                            <option key={status.value} value={status.value}>{status.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="px-4 py-3">
                                        {draft.status === "absent" ? (
                                          <select
                                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                                            onChange={(event) => updateDraft(row, { absenceCreditType: event.target.value as PersonnelCreditType })}
                                            value={draft.absenceCreditType ?? ""}
                                          >
                                            <option value="">Choose credit</option>
                                            {creditTypes.map((type) => (
                                              <option key={type.value} value={type.value}>
                                                {type.label} ({getCreditBalance(row, type.value)})
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span className="text-xs font-medium text-slate-400">Not applicable</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3">
                                        <input
                                          className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                                          onChange={(event) => updateDraft(row, { remarks: event.target.value })}
                                          placeholder="Optional notes"
                                          value={draft.remarks}
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {visibleRows.length === 0 && (
                            <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">No personnel found for this filter.</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {dailySummaries.length === 0 && (
          <div className="p-5 text-sm text-slate-600">No personnel attendance dates have been recorded yet.</div>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Credit Balances</h2>
            <p className="mt-1 text-xs text-slate-500">Balances are locked. Use the + and - buttons to add or subtract credits with a log entry.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Personnel</th>
                <th className="px-4 py-3 font-semibold">Special Order Service Credit</th>
                <th className="px-4 py-3 font-semibold">Local Service Credit</th>
                <th className="px-4 py-3 font-semibold">Wellness Break</th>
                <th className="px-4 py-3 font-semibold">Leave Credits</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {visibleRows.map((row) => {
                const credit = creditsByStaffId.get(row.staffId);

                return (
                  <tr key={`${row.staffId}-credits`}>
                    <td className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">{row.staffName}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.roleOrPosition}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving || isSavingCredits || isDeleting}
                            onClick={() => void adjustCreditForRow(row, 1)}
                            title="Add credit"
                            type="button"
                          >
                            <Plus size={16} />
                          </button>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving || isSavingCredits || isDeleting}
                            onClick={() => void adjustCreditForRow(row, -1)}
                            title="Subtract credit"
                            type="button"
                          >
                            <Minus size={16} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{getNumberInputValue(credit?.specialOrderServiceCredit ?? 0)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{getNumberInputValue(credit?.localServiceCredit ?? 0)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{getNumberInputValue(credit?.wellnessBreak ?? 0)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{getNumberInputValue(credit?.leaveCredits ?? 0)}</td>
                    <td className="px-4 py-3 text-slate-500">{credit?.remarks || "None"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleRows.length === 0 && (
          <div className="p-5 text-sm text-slate-600">No personnel found for credit balances.</div>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Credit Transaction Log</h2>
          <p className="mt-1 text-xs text-slate-500">Manual adjustments and automatic absence deductions are recorded here for transparency.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date / Time</th>
                <th className="px-4 py-3 font-semibold">Personnel</th>
                <th className="px-4 py-3 font-semibold">Credit Type</th>
                <th className="px-4 py-3 font-semibold">Change</th>
                <th className="px-4 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
                <th className="px-4 py-3 font-semibold">Encoded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {creditLogs.slice(0, 80).map((log) => (
                <tr key={log.logId}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{formatTimestamp(log.createdAt) || "Pending"}</p>
                    {log.attendanceDate && <p className="mt-1 text-xs text-slate-500">Attendance: {formatDate(log.attendanceDate)}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{log.staffName}</p>
                    <p className="mt-1 text-xs text-slate-500">{log.roleOrPosition}</p>
                  </td>
                  <td className="px-4 py-3">{getCreditLabel(log.creditType)}</td>
                  <td className={`px-4 py-3 font-bold ${log.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {log.amount >= 0 ? "+" : ""}{log.amount}
                  </td>
                  <td className="px-4 py-3">{log.previousBalance} → {log.newBalance}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                      {log.source.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{log.remarks || "None"}</td>
                  <td className="px-4 py-3">{log.creatorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {creditLogs.length === 0 && (
          <div className="p-5 text-sm text-slate-600">No credit transactions have been logged yet.</div>
        )}
      </div>
    </section>
  );
}
