import { BriefcaseBusiness, CalendarDays, CheckCircle2, HeartPulse, ScrollText, Umbrella, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import {
  subscribePersonnelAttendanceByStaff,
  subscribePersonnelCredit,
} from "../services/personnelAttendanceService";
import { useAuth } from "../providers/AuthProvider";
import type { PersonnelAttendanceRecord, PersonnelCreditBalance } from "../types/loading";

const attendanceStatusLabels: Record<PersonnelAttendanceRecord["status"], string> = {
  present: "Present",
  absent: "Absent",
  official_business: "Official Business",
};

const attendanceStatusStyles: Record<PersonnelAttendanceRecord["status"], string> = {
  present: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  absent: "bg-red-50 text-red-700 ring-red-200",
  official_business: "bg-blue-50 text-blue-700 ring-blue-200",
};

function getPersonalStaffId(profile: ReturnType<typeof useAuth>["profile"]) {
  if (!profile) return "";
  return profile.assignedTeacherId || profile.userId;
}

function formatNumber(value?: number) {
  return Number.isFinite(value) ? value ?? 0 : 0;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MyPersonnelAttendancePage() {
  const { profile } = useAuth();
  const staffId = getPersonalStaffId(profile);
  const [records, setRecords] = useState<PersonnelAttendanceRecord[]>([]);
  const [credit, setCredit] = useState<PersonnelCreditBalance | null>(null);

  useEffect(() => subscribePersonnelAttendanceByStaff(staffId, setRecords), [staffId]);
  useEffect(() => subscribePersonnelCredit(staffId, setCredit), [staffId]);

  const summary = useMemo(
    () => ({
      total: records.length,
      present: records.filter((record) => record.status === "present").length,
      absent: records.filter((record) => record.status === "absent").length,
      officialBusiness: records.filter((record) => record.status === "official_business").length,
    }),
    [records],
  );

  return (
    <section>
      <PageHeader
        description="View your personal attendance and remaining personnel credits."
        title="My Attendance"
      />

      {profile?.role === "teacher" && !profile.assignedTeacherId && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your account is not linked to a teacher record yet, so your personal attendance may not appear here.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          detail="Special Order"
          icon={ScrollText}
          label="Service Credit"
          value={formatNumber(credit?.specialOrderServiceCredit)}
        />
        <SummaryCard
          detail="Local"
          icon={BriefcaseBusiness}
          label="Service Credit"
          value={formatNumber(credit?.localServiceCredit)}
        />
        <SummaryCard
          detail="remaining balance"
          icon={HeartPulse}
          label="Wellness Break"
          value={formatNumber(credit?.wellnessBreak)}
        />
        <SummaryCard
          detail="for non-teaching personnel"
          icon={Umbrella}
          label="Leave Credits"
          value={formatNumber(credit?.leaveCredits)}
        />
      </div>

      {credit?.remarks && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          <span className="font-semibold text-slate-950">Credit remarks:</span> {credit.remarks}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard detail="saved attendance records" icon={CalendarDays} label="Total Records" value={summary.total} />
        <SummaryCard detail="present for duty" icon={CheckCircle2} label="Present" value={summary.present} />
        <SummaryCard detail="not present" icon={XCircle} label="Absent" value={summary.absent} />
        <SummaryCard detail="official business" icon={BriefcaseBusiness} label="Official Business" value={summary.officialBusiness} />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Attendance History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
                <th className="px-4 py-3 font-semibold">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {records.map((record) => (
                <tr key={record.attendanceId}>
                  <td className="px-4 py-3 font-medium text-slate-950">{formatDate(record.attendanceDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${attendanceStatusStyles[record.status]}`}>
                      {attendanceStatusLabels[record.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{record.remarks || "No remarks"}</td>
                  <td className="px-4 py-3">{record.recorderName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.length === 0 && (
          <div className="p-5 text-sm text-slate-600">No attendance records found for your account yet.</div>
        )}
      </div>
    </section>
  );
}
