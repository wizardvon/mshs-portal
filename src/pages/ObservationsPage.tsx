import { BadgeCheck, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Eye, Plus, Save, Trash2, XCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { SummaryCard } from "../components/common/SummaryCard";
import { useAuth } from "../providers/AuthProvider";
import { createObservationSchedule, deleteAllObservationSchedules, subscribeObservationSchedules, updateObservationStatus } from "../services/observationService";
import { subscribeClassSchedulesByPeriod } from "../services/scheduleService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeCollection } from "../services/firestoreCrud";
import { subscribeTeachers } from "../services/teacherService";
import type {
  AcademicSettings,
  AcademicTerm,
  ClassroomObservationType,
  ClassScheduleEntry,
  ObservationActivityType,
  ObservationSchedule,
  ObservationStatus,
  ScheduleDay,
  Section,
  Subject,
  Teacher,
} from "../types/loading";
import { termOptions } from "../types/loading";

type TeacherSummary = {
  teacher: Teacher;
  doneObservations: number;
  pendingObservations: number;
  doneCoaching: number;
  schedules: ObservationSchedule[];
};

type ScheduleForm = {
  activityType: ObservationActivityType;
  observationType: ClassroomObservationType;
  scheduleDate: string;
  day: ScheduleDay;
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  room: string;
  notes: string;
};

const days: ScheduleDay[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const observationTypes: ClassroomObservationType[] = ["Formal (CO)", "Informal (ICO)", "Walkthrough", "Other"];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const deleteAllPassword = "dxuxihnfwcls";

const emptyForm: ScheduleForm = {
  activityType: "classroom_observation",
  observationType: "Formal (CO)",
  scheduleDate: "",
  day: "Monday",
  startTime: "",
  endTime: "",
  subjectId: "",
  subjectName: "",
  sectionId: "",
  sectionName: "",
  room: "",
  notes: "",
};

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getScheduleDayFromDate(value: string): ScheduleDay | null {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  return days.includes(dayName as ScheduleDay) ? (dayName as ScheduleDay) : null;
}

function getDefaultScheduleDate() {
  const today = getTodayInputValue();
  return getScheduleDayFromDate(today) ? today : "";
}

function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeToMinutes(value: string) {
  const [rawHour, rawMinute = "0"] = value.split(":");
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  if (hour < 7) hour += 12;
  return hour * 60 + minute;
}

function toTimeInputValue(value: string) {
  const [rawHour, rawMinute = "0"] = value.split(":");
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  if (hour < 7) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

function getCalendarCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingCells = firstDay.getDay();
  return [
    ...Array.from({ length: leadingCells }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

function getStatusTone(status: ObservationStatus): "green" | "amber" | "slate" {
  if (status === "done") return "green";
  if (status === "scheduled") return "amber";
  return "slate";
}

function getActivityLabel(schedule: Pick<ObservationSchedule, "activityType" | "observationType">) {
  return schedule.activityType === "classroom_observation"
    ? `Classroom Observation${schedule.observationType ? ` - ${schedule.observationType}` : ""}`
    : "Coaching/Mentoring";
}

function getObserverColor(schedule: ObservationSchedule) {
  if (schedule.observerRole === "principal") return "border-red-200 bg-red-50 text-red-700";
  if (schedule.observerRole === "master_teacher") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function ObservationsPage() {
  const { profile } = useAuth();
  const defaultScheduleDate = getDefaultScheduleDate();
  const currentDate = new Date();
  const [settings, setSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [schoolYear, setSchoolYear] = useState(defaultAcademicSettings.currentSchoolYear);
  const [term, setTerm] = useState<AcademicTerm>(defaultAcademicSettings.currentTerm);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [classSchedules, setClassSchedules] = useState<ClassScheduleEntry[]>([]);
  const [observationSchedules, setObservationSchedules] = useState<ObservationSchedule[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [expandedTeacherId, setExpandedTeacherId] = useState("");
  const [form, setForm] = useState<ScheduleForm>({ ...emptyForm, scheduleDate: defaultScheduleDate });
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [calendarYear, setCalendarYear] = useState(currentDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(currentDate.getMonth());

  const isReviewer = profile?.role === "principal" || profile?.role === "master_teacher" || profile?.role === "super_admin";
  const isSuperAdmin = profile?.role === "super_admin";
  const scopedTeacherId = profile?.role === "teacher" ? profile.assignedTeacherId ?? "" : "";

  useEffect(() => subscribeAcademicSettings(setSettings), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeCollection<Section>("sections", setSections), []);
  useEffect(() => subscribeClassSchedulesByPeriod(schoolYear, term, "all", setClassSchedules), [schoolYear, term]);
  useEffect(() => {
    if (isReviewer) return subscribeObservationSchedules(setObservationSchedules);
    if (scopedTeacherId) return subscribeObservationSchedules(setObservationSchedules, { teacherId: scopedTeacherId });
    setObservationSchedules([]);
    return undefined;
  }, [isReviewer, scopedTeacherId]);

  useEffect(() => {
    setSchoolYear(settings.currentSchoolYear);
    setTerm(settings.currentTerm);
  }, [settings.currentSchoolYear, settings.currentTerm]);

  const subjectsById = useMemo(() => new Map(subjects.map((subject) => [subject.subjectId, subject])), [subjects]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]);
  const selectedTeacher = teachers.find((teacher) => teacher.teacherId === selectedTeacherId);

  const filteredSchedules = useMemo(
    () =>
      observationSchedules
        .filter((schedule) => schedule.schoolYear === schoolYear && schedule.term === term)
        .sort((first, second) => `${first.scheduleDate} ${first.startTime}`.localeCompare(`${second.scheduleDate} ${second.startTime}`)),
    [observationSchedules, schoolYear, term],
  );

  const teacherSummaries = useMemo<TeacherSummary[]>(
    () =>
      teachers
        .filter((teacher) => teacher.status === "active")
        .sort((first, second) => first.fullName.localeCompare(second.fullName))
        .map((teacher) => {
          const schedules = filteredSchedules.filter((schedule) => schedule.teacherId === teacher.teacherId);
          return {
            teacher,
            schedules,
            doneObservations: schedules.filter((schedule) => schedule.activityType === "classroom_observation" && schedule.status === "done").length,
            pendingObservations: schedules.filter((schedule) => schedule.activityType === "classroom_observation" && schedule.status === "scheduled").length,
            doneCoaching: schedules.filter((schedule) => schedule.activityType === "coaching_mentoring" && schedule.status === "done").length,
          };
        }),
    [filteredSchedules, teachers],
  );

  const selectedTeacherSchedules = useMemo(
    () => filteredSchedules.filter((schedule) => schedule.teacherId === (isReviewer ? selectedTeacherId : scopedTeacherId)),
    [filteredSchedules, isReviewer, scopedTeacherId, selectedTeacherId],
  );

  const selectedTeacherClassSchedules = useMemo(
    () =>
      classSchedules
        .filter((schedule) => schedule.teacherId === selectedTeacherId)
        .sort((first, second) => days.indexOf(first.day) - days.indexOf(second.day) || timeToMinutes(first.startTime) - timeToMinutes(second.startTime)),
    [classSchedules, selectedTeacherId],
  );

  const dashboardSummary = useMemo(
    () => ({
      scheduled: filteredSchedules.filter((schedule) => schedule.status === "scheduled").length,
      observationsDone: filteredSchedules.filter((schedule) => schedule.activityType === "classroom_observation" && schedule.status === "done").length,
      coachingDone: filteredSchedules.filter((schedule) => schedule.activityType === "coaching_mentoring" && schedule.status === "done").length,
      mySchedules: filteredSchedules.filter((schedule) => schedule.teacherId === scopedTeacherId || schedule.observerId === profile?.userId).length,
    }),
    [filteredSchedules, profile?.userId, scopedTeacherId],
  );

  const calendarSchedules = useMemo(
    () =>
      filteredSchedules.filter((schedule) => {
        const parts = getDateParts(schedule.scheduleDate);
        return parts.year === calendarYear && parts.month === calendarMonth;
      }),
    [calendarMonth, calendarYear, filteredSchedules],
  );

  const calendarCells = useMemo(() => getCalendarCells(calendarYear, calendarMonth), [calendarMonth, calendarYear]);

  function selectTeacher(teacherId: string) {
    setSelectedTeacherId(teacherId);
    setExpandedTeacherId(teacherId);
    setForm({ ...emptyForm, scheduleDate: defaultScheduleDate });
    setMessage("");
    setError("");
  }

  function updateScheduleDate(scheduleDate: string) {
    const nextDay = getScheduleDayFromDate(scheduleDate);
    setForm((current) => ({
      ...current,
      scheduleDate,
      day: nextDay ?? current.day,
    }));
    setError(nextDay ? "" : "Select a Monday-Friday date for observation, coaching, or mentoring.");
  }

  function useClassSlot(slot: ClassScheduleEntry) {
    const subject = subjectsById.get(slot.subjectId);
    const section = sectionsById.get(slot.sectionId);
    setForm((current) => ({
      ...current,
      activityType: "classroom_observation",
      startTime: toTimeInputValue(slot.startTime),
      endTime: toTimeInputValue(slot.endTime),
      subjectId: slot.subjectId,
      subjectName: subject?.subjectName ?? slot.subjectId,
      sectionId: slot.sectionId,
      sectionName: section?.sectionName ?? slot.sectionId,
      room: slot.room ?? section?.room ?? "",
    }));
  }

  async function saveSchedule() {
    if (!profile || !isReviewer || !selectedTeacher) return;
    if (!form.scheduleDate || !form.startTime || !form.endTime) {
      setError("Select a date, start time, and end time.");
      return;
    }
    const scheduleDay = getScheduleDayFromDate(form.scheduleDate);
    if (!scheduleDay) {
      setError("Select a Monday-Friday date for observation, coaching, or mentoring.");
      return;
    }
    if (form.activityType === "classroom_observation" && (!form.subjectId || !form.sectionId)) {
      setError("Choose a class schedule slot for classroom observation.");
      return;
    }

    setSaving("schedule");
    setMessage("");
    setError("");

    try {
      await createObservationSchedule({
        schoolYear,
        term,
        teacherId: selectedTeacher.teacherId,
        teacherName: selectedTeacher.fullName,
        observerId: profile.userId,
        observerName: profile.fullName,
        observerRole: profile.role,
        activityType: form.activityType,
        observationType: form.activityType === "classroom_observation" ? form.observationType : undefined,
        scheduleDate: form.scheduleDate,
        day: scheduleDay,
        startTime: form.startTime,
        endTime: form.endTime,
        subjectId: form.subjectId,
        subjectName: form.subjectName,
        sectionId: form.sectionId,
        sectionName: form.sectionName,
        room: form.room,
        notes: form.notes.trim(),
        status: "scheduled",
        createdBy: profile.userId,
      });
      setForm({ ...emptyForm, scheduleDate: defaultScheduleDate });
      setMessage("Schedule created.");
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to create schedule.");
    } finally {
      setSaving("");
    }
  }

  async function setScheduleStatus(schedule: ObservationSchedule, status: ObservationStatus) {
    if (!isReviewer || schedule.observerId !== profile?.userId && profile?.role !== "super_admin") return;
    setSaving(schedule.observationId);
    setMessage("");
    setError("");

    try {
      await updateObservationStatus(schedule.observationId, status);
      setMessage("Schedule updated.");
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to update schedule.");
    } finally {
      setSaving("");
    }
  }

  async function deleteAllSchedules() {
    if (!isSuperAdmin) return;
    const password = window.prompt("Enter the Super Admin delete password to delete all observation, coaching, and mentoring schedules.");
    if (password === null) return;

    if (password !== deleteAllPassword) {
      setError("Incorrect password. Observation schedules were not deleted.");
      setMessage("");
      return;
    }

    const confirmed = window.confirm("Delete all observation, coaching, and mentoring schedules permanently? This cannot be undone.");
    if (!confirmed) return;

    setSaving("delete-all");
    setMessage("");
    setError("");

    try {
      const deletedCount = await deleteAllObservationSchedules();
      setSelectedTeacherId("");
      setExpandedTeacherId("");
      setMessage(`Deleted ${deletedCount} observation schedule${deletedCount === 1 ? "" : "s"}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete observation schedules.");
    } finally {
      setSaving("");
    }
  }

  function renderScheduleRows(rows: ObservationSchedule[]) {
    if (rows.length === 0) {
      return <div className="p-5 text-sm text-slate-600">No schedules found.</div>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Date / Time</th>
              <th className="px-4 py-3 font-semibold">Teacher</th>
              <th className="px-4 py-3 font-semibold">Activity</th>
              <th className="px-4 py-3 font-semibold">Class / Room</th>
              <th className="px-4 py-3 font-semibold">Observer</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {isReviewer && <th className="px-4 py-3 text-right font-semibold">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((schedule) => (
              <tr key={schedule.observationId}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-950">{formatDate(schedule.scheduleDate)}</p>
                  <p className="mt-1 text-xs text-slate-500">{schedule.day}, {schedule.startTime}-{schedule.endTime}</p>
                </td>
                <td className="px-4 py-3">{schedule.teacherName}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-950">{getActivityLabel(schedule)}</p>
                  {schedule.notes && <p className="mt-1 text-xs text-slate-500">{schedule.notes}</p>}
                </td>
                <td className="px-4 py-3">{schedule.sectionName || "-"}<br /><span className="text-xs text-slate-500">{schedule.subjectName || "No subject"} {schedule.room ? `| ${schedule.room}` : ""}</span></td>
                <td className="px-4 py-3">{schedule.observerName}</td>
                <td className="px-4 py-3"><StatusBadge label={schedule.status} tone={getStatusTone(schedule.status)} /></td>
                {isReviewer && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50" disabled={saving === schedule.observationId || schedule.status === "done"} onClick={() => void setScheduleStatus(schedule, "done")} type="button">
                        <CheckCircle2 size={16} /> Done
                      </button>
                      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={saving === schedule.observationId || schedule.status === "cancelled"} onClick={() => void setScheduleStatus(schedule, "cancelled")} type="button">
                        <XCircle size={16} /> Cancel
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section>
      <PageHeader description="Schedule classroom observations, coaching, and mentoring, then track completion by teacher." title="Observation & Coaching" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onChange={(event) => setSchoolYear(event.target.value)} value={schoolYear}>
          {Array.from(new Set([settings.currentSchoolYear, ...observationSchedules.map((schedule) => schedule.schoolYear)])).map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onChange={(event) => setTerm(event.target.value as AcademicTerm)} value={term}>
          {termOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {isSuperAdmin && (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            disabled={saving === "delete-all" || observationSchedules.length === 0}
            onClick={() => void deleteAllSchedules()}
            type="button"
          >
            <Trash2 size={16} /> {saving === "delete-all" ? "Deleting..." : "Delete All"}
          </button>
        )}
      </div>

      {(message || error) && <p className={`mb-5 rounded-md px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard detail="pending activities" icon={CalendarDays} label="Scheduled" value={dashboardSummary.scheduled} />
        <SummaryCard detail="classroom observations" icon={Eye} label="CO Done" value={dashboardSummary.observationsDone} />
        <SummaryCard detail="coaching or mentoring" icon={BadgeCheck} label="C/M Done" value={dashboardSummary.coachingDone} />
        <SummaryCard detail={isReviewer ? "created or visible" : "your records"} icon={ClipboardList} label="My Records" value={dashboardSummary.mySchedules} />
      </div>

      <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Observation Calendar</h2>
            <p className="mt-1 text-xs text-slate-500">Choose a month to view scheduled observation, coaching, and mentoring activities.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-label="Previous year"
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={() => setCalendarYear((year) => year - 1)}
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-16 text-center text-sm font-semibold text-slate-950">{calendarYear}</span>
            <button
              aria-label="Next year"
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={() => setCalendarYear((year) => year + 1)}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
            <div className="flex flex-wrap gap-1">
              {monthLabels.map((label, index) => (
                <button
                  className={`h-9 rounded-md px-3 text-xs font-semibold ${calendarMonth === index ? "bg-civic text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  key={label}
                  onClick={() => setCalendarMonth(index)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-3 w-3 rounded-sm bg-red-100 ring-1 ring-red-200" /> Principal schedule</span>
            <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-3 w-3 rounded-sm bg-blue-100 ring-1 ring-blue-200" /> Master Teacher schedule</span>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div className="border-r border-slate-200 px-2 py-2 last:border-r-0" key={day}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarCells.map((day, index) => {
            const daySchedules = day
              ? calendarSchedules.filter((schedule) => getDateParts(schedule.scheduleDate).day === day)
              : [];
            return (
              <div className="min-h-28 border-b border-r border-slate-200 p-2 last:border-r-0" key={`${day ?? "blank"}-${index}`}>
                {day && <p className="text-xs font-semibold text-slate-500">{day}</p>}
                <div className="mt-2 space-y-1">
                  {daySchedules.map((schedule) => (
                    <div className={`rounded-md border px-2 py-1 text-xs ${getObserverColor(schedule)}`} key={schedule.observationId}>
                      <p className="font-semibold">{schedule.startTime} {schedule.teacherName}</p>
                      <p className="mt-0.5 truncate">{getActivityLabel(schedule)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {calendarSchedules.length === 0 && (
          <div className="px-4 py-3 text-sm text-slate-600">No schedules for {monthLabels[calendarMonth]} {calendarYear}.</div>
        )}
      </div>

      {isReviewer ? (
        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">Teachers</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Teacher</th>
                    <th className="px-4 py-3 font-semibold">CO Done</th>
                    <th className="px-4 py-3 font-semibold">Pending CO</th>
                    <th className="px-4 py-3 font-semibold">C/M Done</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {teacherSummaries.map((row) => {
                    const expanded = expandedTeacherId === row.teacher.teacherId;
                    return (
                      <Fragment key={row.teacher.teacherId}>
                        <tr className={selectedTeacherId === row.teacher.teacherId ? "bg-blue-50/60" : ""}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-950">{row.teacher.fullName}</p>
                            <p className="mt-1 text-xs text-slate-500">{row.teacher.position}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-700">{row.doneObservations}</td>
                          <td className="px-4 py-3 font-semibold text-amber-700">{row.pendingObservations}</td>
                          <td className="px-4 py-3 font-semibold text-blue-700">{row.doneCoaching}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setExpandedTeacherId(expanded ? "" : row.teacher.teacherId)} type="button">
                                <Eye size={16} /> Details
                              </button>
                              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-civic/90" onClick={() => selectTeacher(row.teacher.teacherId)} type="button">
                                <Plus size={16} /> Schedule
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td className="bg-slate-50 px-4 py-4" colSpan={5}>
                              <div className="overflow-hidden rounded-md border border-slate-200 bg-white">{renderScheduleRows(row.schedules)}</div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-950">Schedule Observation, Coaching, or Mentoring</h2>
              {!selectedTeacher ? (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Select a teacher from the list to create a schedule.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-600">Scheduling for <span className="font-semibold text-slate-950">{selectedTeacher.fullName}</span></p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Activity</span>
                      <select className="h-10 rounded-md border border-slate-300 bg-white px-3" onChange={(event) => setForm({ ...form, activityType: event.target.value as ObservationActivityType })} value={form.activityType}>
                        <option value="classroom_observation">Classroom Observation</option>
                        <option value="coaching_mentoring">Coaching/Mentoring</option>
                      </select>
                    </label>
                    {form.activityType === "classroom_observation" && (
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Observation Type</span>
                        <select className="h-10 rounded-md border border-slate-300 bg-white px-3" onChange={(event) => setForm({ ...form, observationType: event.target.value as ClassroomObservationType })} value={form.observationType}>
                          {observationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Date</span>
                      <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => updateScheduleDate(event.target.value)} type="date" value={form.scheduleDate} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Day</span>
                      <select className="h-10 rounded-md border border-slate-300 bg-slate-50 px-3 text-slate-700" disabled value={form.day}>
                        {days.map((day) => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Start</span>
                      <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, startTime: event.target.value })} type="time" value={form.startTime} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">End</span>
                      <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, endTime: event.target.value })} type="time" value={form.endTime} />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className="font-medium text-slate-700">Notes</span>
                      <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, notes: event.target.value })} value={form.notes} />
                    </label>
                  </div>
                  <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50" disabled={saving === "schedule"} onClick={() => void saveSchedule()} type="button">
                    <Save size={16} /> {saving === "schedule" ? "Saving..." : "Save Schedule"}
                  </button>
                </>
              )}
            </div>

            {selectedTeacher && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-950">Teacher Class Schedule</h2>
                  <p className="mt-1 text-xs text-slate-500">Click a class slot to use it for classroom observation.</p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {days.map((day) => {
                    const slots = selectedTeacherClassSchedules.filter((slot) => slot.day === day);
                    return (
                      <div className="rounded-md border border-slate-200" key={day}>
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">{day}</div>
                        <div className="divide-y divide-slate-100">
                          {slots.map((slot) => {
                            const subject = subjectsById.get(slot.subjectId);
                            const section = sectionsById.get(slot.sectionId);
                            return (
                              <button className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50" key={slot.scheduleId} onClick={() => useClassSlot(slot)} type="button">
                                <span className="block font-semibold text-slate-950">{slot.startTime}-{slot.endTime}</span>
                                <span className="mt-1 block text-xs text-slate-500">{subject?.subjectName ?? slot.subjectId} | {section?.sectionName ?? slot.sectionId}</span>
                              </button>
                            );
                          })}
                          {slots.length === 0 && <div className="px-3 py-3 text-sm text-slate-500">No classes</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">My Observation, Coaching, and Mentoring Schedule</h2>
          </div>
          {renderScheduleRows(selectedTeacherSchedules)}
          {!scopedTeacherId && <div className="p-5 text-sm text-amber-700">Your account is not linked to a teacher record yet.</div>}
        </div>
      )}
    </section>
  );
}
