import { BriefcaseBusiness, CalendarClock, LocateFixed, MapPin, Save, Search, Umbrella, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { subscribeCollection } from "../services/firestoreCrud";
import { subscribePersonnelAttendanceByDate } from "../services/personnelAttendanceService";
import {
  subscribePersonnelLocations,
  upsertPersonnelLocation,
} from "../services/personnelLocatorService";
import { subscribeClassSchedulesByPeriod } from "../services/scheduleService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeTeachers } from "../services/teacherService";
import { useAuth } from "../providers/AuthProvider";
import type { UserProfile } from "../types";
import type {
  AcademicSettings,
  ClassScheduleEntry,
  PersonnelAttendanceRecord,
  PersonnelLocation,
  PersonnelLocatorStatus,
  PersonnelStaffType,
  ScheduleDay,
  Section,
  Subject,
  Teacher,
} from "../types/loading";
import { getRoleLabel } from "../utils/accessControl";

type StaffRow = {
  staffId: string;
  staffName: string;
  roleOrPosition: string;
  staffType: PersonnelStaffType;
};

type LocatorResult = {
  label: string;
  detail: string;
  tone: "green" | "blue" | "amber" | "red" | "slate";
  source: string;
};

const scheduleDays: ScheduleDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const statusOptions: Array<{ value: PersonnelLocatorStatus; label: string }> = [
  { value: "available", label: "Available" },
  { value: "on_leave", label: "On leave" },
  { value: "official_business", label: "On official business" },
];

const staffTypeLabels: Record<PersonnelStaffType, string> = {
  teaching: "Teaching",
  non_teaching: "Non-teaching",
};

const statusStyles: Record<LocatorResult["tone"], string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-50 text-slate-700 ring-slate-200",
};

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function getPersonalStaffId(profile: UserProfile | null | undefined) {
  if (!profile) return "";
  return profile.assignedTeacherId || profile.userId;
}

function timeToMinutes(time: string) {
  const [hours = "0", minutes = "0"] = time.split(":");
  const parsedHours = Number(hours);
  const normalizedHours = parsedHours > 0 && parsedHours < 6 ? parsedHours + 12 : parsedHours;
  return normalizedHours * 60 + Number(minutes);
}

function formatTimeRange(entry: Pick<ClassScheduleEntry, "startTime" | "endTime">) {
  return `${entry.startTime}-${entry.endTime}`;
}

function getCurrentSchedulePosition() {
  const now = new Date();
  const calendarDay = now.getDay();
  const day = scheduleDays[calendarDay - 1] ?? scheduleDays[0];
  const isWeekend = calendarDay === 0 || calendarDay === 6;

  return {
    day,
    minutes: isWeekend ? -1 : now.getHours() * 60 + now.getMinutes(),
    isWeekend,
  };
}

function getUpdatedAtLabel(location?: PersonnelLocation) {
  const updatedAt = location?.updatedAt;
  if (!updatedAt || typeof updatedAt !== "object" || !("toDate" in updatedAt)) return "";
  const date = updatedAt.toDate();
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function buildStaffRows(teachers: Teacher[], users: UserProfile[]) {
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
        !user.assignedTeacherId &&
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
    first.staffName.localeCompare(second.staffName),
  );
}

function getCurrentScheduleEntry(staffId: string, scheduleEntries: ClassScheduleEntry[]) {
  const current = getCurrentSchedulePosition();
  if (current.isWeekend) return undefined;

  return scheduleEntries.find(
    (entry) =>
      entry.teacherId === staffId &&
      entry.day === current.day &&
      timeToMinutes(entry.startTime) <= current.minutes &&
      timeToMinutes(entry.endTime) > current.minutes,
  );
}

function resolveLocatorResult(
  staff: StaffRow | undefined,
  attendance: PersonnelAttendanceRecord | undefined,
  location: PersonnelLocation | undefined,
  scheduleEntry: ClassScheduleEntry | undefined,
  subjectsById: Map<string, Subject>,
  sectionsById: Map<string, Section>,
): LocatorResult {
  if (!staff) {
    return {
      label: "No personnel selected",
      detail: "Choose a personnel name from the dropdown.",
      tone: "slate",
      source: "Selection",
    };
  }

  if (location?.status === "on_leave" || attendance?.status === "absent") {
    return {
      label: "On leave",
      detail: location?.note || attendance?.remarks || "Personnel is not available today.",
      tone: "red",
      source: location?.status === "on_leave" ? "Personnel update" : "Attendance",
    };
  }

  if (location?.status === "official_business" || attendance?.status === "official_business") {
    return {
      label: "On official business",
      detail: location?.note || location?.currentLocation || attendance?.remarks || "Personnel is on official business.",
      tone: "blue",
      source: location?.status === "official_business" ? "Personnel update" : "Attendance",
    };
  }

  if (location?.currentLocation.trim()) {
    return {
      label: location.currentLocation.trim(),
      detail: location.note?.trim() || `Self-reported location${getUpdatedAtLabel(location) ? ` as of ${getUpdatedAtLabel(location)}` : ""}.`,
      tone: "green",
      source: "Personnel update",
    };
  }

  if (scheduleEntry) {
    const subject = subjectsById.get(scheduleEntry.subjectId);
    const section = sectionsById.get(scheduleEntry.sectionId);
    const room = scheduleEntry.room || section?.room || "No room listed";

    return {
      label: room,
      detail: `${scheduleEntry.customTitle || subject?.subjectName || "Scheduled Activity"} with ${section?.sectionName || scheduleEntry.customDetails || "assigned section"} (${formatTimeRange(scheduleEntry)})`,
      tone: "amber",
      source: "Current schedule",
    };
  }

  return {
    label: "No current schedule",
    detail: staff.staffType === "teaching" ? "No class is scheduled for this personnel right now." : "No class schedule is assigned to this personnel.",
    tone: "slate",
    source: "Current schedule",
  };
}

export function PersonnelLocatorPage() {
  const { profile } = useAuth();
  const today = getTodayInputValue();
  const ownStaffId = getPersonalStaffId(profile);
  const [settings, setSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ClassScheduleEntry[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<PersonnelAttendanceRecord[]>([]);
  const [locations, setLocations] = useState<PersonnelLocation[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PersonnelLocatorStatus>("available");
  const [currentLocation, setCurrentLocation] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => subscribeAcademicSettings(setSettings), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<UserProfile>("users", setUsers), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeCollection<Section>("sections", setSections), []);
  useEffect(
    () => subscribeClassSchedulesByPeriod(settings.currentSchoolYear, settings.currentTerm, "all", setScheduleEntries),
    [settings.currentSchoolYear, settings.currentTerm],
  );
  useEffect(() => subscribePersonnelAttendanceByDate(today, setAttendanceRecords), [today]);
  useEffect(() => subscribePersonnelLocations(setLocations), []);

  const staffRows = useMemo(() => buildStaffRows(teachers, users), [teachers, users]);
  const locationsByStaffId = useMemo(
    () => new Map(locations.map((location) => [location.staffId, location])),
    [locations],
  );
  const attendanceByStaffId = useMemo(
    () => new Map(attendanceRecords.map((record) => [record.staffId, record])),
    [attendanceRecords],
  );
  const subjectsById = useMemo(() => new Map(subjects.map((subject) => [subject.subjectId, subject])), [subjects]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]);
  const ownStaff = useMemo(() => staffRows.find((row) => row.staffId === ownStaffId), [ownStaffId, staffRows]);
  const selectedStaff = useMemo(
    () => staffRows.find((row) => row.staffId === selectedStaffId) ?? staffRows[0],
    [selectedStaffId, staffRows],
  );

  useEffect(() => {
    if (!selectedStaffId && staffRows.length > 0) {
      setSelectedStaffId(ownStaffId && staffRows.some((row) => row.staffId === ownStaffId) ? ownStaffId : staffRows[0].staffId);
    }
  }, [ownStaffId, selectedStaffId, staffRows]);

  useEffect(() => {
    const ownLocation = ownStaffId ? locationsByStaffId.get(ownStaffId) : undefined;
    setStatus(ownLocation?.status ?? "available");
    setCurrentLocation(ownLocation?.currentLocation ?? "");
    setNote(ownLocation?.note ?? "");
  }, [locationsByStaffId, ownStaffId]);

  const selectedScheduleEntry = selectedStaff
    ? getCurrentScheduleEntry(selectedStaff.staffId, scheduleEntries)
    : undefined;
  const selectedResult = resolveLocatorResult(
    selectedStaff,
    selectedStaff ? attendanceByStaffId.get(selectedStaff.staffId) : undefined,
    selectedStaff ? locationsByStaffId.get(selectedStaff.staffId) : undefined,
    selectedScheduleEntry,
    subjectsById,
    sectionsById,
  );

  const visibleRows = useMemo(
    () =>
      staffRows.filter((row) => {
        const searchable = `${row.staffName} ${row.roleOrPosition} ${staffTypeLabels[row.staffType]}`.toLowerCase();
        return searchable.includes(search.trim().toLowerCase());
      }),
    [search, staffRows],
  );

  const summary = useMemo(
    () => ({
      total: staffRows.length,
      selfReported: locations.filter((location) => location.status === "available" && location.currentLocation.trim()).length,
      onLeave: staffRows.filter((row) => locationsByStaffId.get(row.staffId)?.status === "on_leave" || attendanceByStaffId.get(row.staffId)?.status === "absent").length,
      officialBusiness: staffRows.filter((row) => locationsByStaffId.get(row.staffId)?.status === "official_business" || attendanceByStaffId.get(row.staffId)?.status === "official_business").length,
    }),
    [attendanceByStaffId, locations, locationsByStaffId, staffRows],
  );

  async function saveOwnLocation() {
    if (!profile || !ownStaff) {
      setMessage("");
      setError("Your account is not linked to a personnel record yet.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      await upsertPersonnelLocation({
        staffId: ownStaff.staffId,
        staffName: ownStaff.staffName,
        staffType: ownStaff.staffType,
        roleOrPosition: ownStaff.roleOrPosition,
        status,
        currentLocation: currentLocation.trim(),
        note: note.trim(),
        updatedBy: profile.userId,
        updaterName: profile.fullName,
      });
      setMessage("Your current personnel location was saved.");
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to save your current location.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <PageHeader
        description="Find personnel by name and compare their current update with the active schedule."
        title="Personnel Locator"
      />

      {(message || error) && (
        <p className={`mt-5 rounded-md px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </p>
      )}

      <div className="mt-5 grid min-w-0 gap-5">
        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,360px)_1fr]">
            <select
              className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm"
              onChange={(event) => setSelectedStaffId(event.target.value)}
              value={selectedStaff?.staffId ?? ""}
            >
              {staffRows.map((row) => (
                <option key={row.staffId} value={row.staffId}>
                  {row.staffName}
                </option>
              ))}
            </select>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-10 text-sm"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search personnel list"
                value={search}
              />
            </label>
          </div>

          <div className="mt-4 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="flex min-w-0 flex-col justify-between gap-3 md:flex-row md:items-start">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Selected Personnel</p>
                <h2 className="mt-1 break-words text-xl font-bold text-slate-950">{selectedStaff?.staffName ?? "No personnel"}</h2>
                <p className="mt-1 break-words text-sm text-slate-600">
                  {selectedStaff ? `${selectedStaff.roleOrPosition} - ${staffTypeLabels[selectedStaff.staffType]}` : "No personnel records found."}
                </p>
              </div>
              <span className={`inline-flex w-fit max-w-full shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[selectedResult.tone]}`}>
                {selectedResult.source}
              </span>
            </div>
            <div className="mt-5 min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-red-50 text-civic ring-1 ring-red-100">
                  <LocateFixed size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-500">Current Location / Status</p>
                  <p className="mt-1 break-words text-xl font-bold text-slate-950 sm:text-2xl">{selectedResult.label}</p>
                  <p className="mt-2 break-words text-sm text-slate-600">{selectedResult.detail}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            <div className="divide-y divide-slate-100 md:hidden">
              {visibleRows.map((row) => {
                const result = resolveLocatorResult(
                  row,
                  attendanceByStaffId.get(row.staffId),
                  locationsByStaffId.get(row.staffId),
                  getCurrentScheduleEntry(row.staffId, scheduleEntries),
                  subjectsById,
                  sectionsById,
                );

                return (
                  <button
                    className="block w-full min-w-0 bg-white p-3 text-left hover:bg-slate-50"
                    key={row.staffId}
                    onClick={() => setSelectedStaffId(row.staffId)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-slate-950">{row.staffName}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">{row.roleOrPosition}</p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-slate-500">{staffTypeLabels[row.staffType]}</span>
                    </div>
                    <p className="mt-3 break-words text-sm font-semibold text-slate-950">{result.label}</p>
                    <p className="mt-1 break-words text-xs text-slate-500">{result.detail}</p>
                    <span className={`mt-3 inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyles[result.tone]}`}>
                      {result.source}
                    </span>
                  </button>
                );
              })}
            </div>
            <table className="hidden w-full table-fixed text-left text-sm md:table">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-[28%] px-4 py-3 font-semibold">Personnel</th>
                  <th className="w-[16%] px-4 py-3 font-semibold">Type</th>
                  <th className="w-[38%] px-4 py-3 font-semibold">Location / Status</th>
                  <th className="w-[18%] px-4 py-3 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visibleRows.map((row) => {
                  const result = resolveLocatorResult(
                    row,
                    attendanceByStaffId.get(row.staffId),
                    locationsByStaffId.get(row.staffId),
                    getCurrentScheduleEntry(row.staffId, scheduleEntries),
                    subjectsById,
                    sectionsById,
                  );

                  return (
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      key={row.staffId}
                      onClick={() => setSelectedStaffId(row.staffId)}
                    >
                      <td className="px-4 py-3">
                        <p className="break-words font-medium text-slate-950">{row.staffName}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">{row.roleOrPosition}</p>
                      </td>
                      <td className="break-words px-4 py-3">{staffTypeLabels[row.staffType]}</td>
                      <td className="px-4 py-3">
                        <p className="break-words font-semibold text-slate-950">{result.label}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">{result.detail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex max-w-full break-words rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyles[result.tone]}`}>
                          {result.source}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleRows.length === 0 && (
              <div className="p-5 text-sm text-slate-600">No personnel found for this search.</div>
            )}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-civic ring-1 ring-red-100">
              <MapPin size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950">Set My Current Location</h2>
              <p className="mt-1 break-words text-xs text-slate-500">
                {ownStaff ? `${ownStaff.staffName} - ${ownStaff.roleOrPosition}` : "Your account is not linked to a personnel record."}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Status</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                onChange={(event) => setStatus(event.target.value as PersonnelLocatorStatus)}
                value={status}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Current location</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                onChange={(event) => setCurrentLocation(event.target.value)}
                placeholder="Office, room, field, library"
                value={currentLocation}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Note</span>
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional detail"
                value={note}
              />
            </label>
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving || !ownStaff}
              onClick={() => void saveOwnLocation()}
              type="button"
            >
              <Save size={16} /> {isSaving ? "Saving..." : "Save My Location"}
            </button>
          </div>

          <div className="mt-5 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 shrink-0" size={16} />
              <p className="min-w-0 break-words">
                Schedule lookup uses {settings.currentSchoolYear}, {settings.currentTerm}; attendance and self-reported leave/OB override the schedule.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard detail="teaching and non-teaching" icon={UserRoundCheck} label="Personnel" value={summary.total} />
        <SummaryCard detail="self-reported locations" icon={MapPin} label="Located" value={summary.selfReported} />
        <SummaryCard detail="today" icon={Umbrella} label="On Leave" value={summary.onLeave} />
        <SummaryCard detail="today" icon={BriefcaseBusiness} label="Official Business" value={summary.officialBusiness} />
      </div>
    </section>
  );
}
