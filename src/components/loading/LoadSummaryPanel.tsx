import type { LoadAssignment, Teacher } from "../../types/loading";
import { buildTeacherLoadSummaries } from "../../utils/loadCalculations";
import { getLoadStatusClass } from "../../utils/statusRules";

type LoadSummaryPanelProps = {
  teachers: Teacher[];
  assignments: LoadAssignment[];
  schoolYear: string;
  term: string;
};

export function LoadSummaryPanel({
  teachers,
  assignments,
  schoolYear,
  term,
}: LoadSummaryPanelProps) {
  const summaries = buildTeacherLoadSummaries(teachers, assignments, schoolYear, term);

  return (
    <aside className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Teacher List</h2>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {teachers.map((teacher) => (
            <div className="rounded-md border border-slate-100 px-3 py-2" key={teacher.teacherId}>
              <p className="text-sm font-medium text-slate-900">{teacher.fullName}</p>
              <p className="mt-1 text-xs text-slate-500">{teacher.specialization}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Load Summary</h2>
        <div className="mt-3 space-y-2">
          {summaries.map(({ teacher, totalLoad, status }) => (
            <div
              className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2"
              key={teacher.teacherId}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{teacher.fullName}</p>
                <p className="text-xs text-slate-500">{totalLoad} units</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${getLoadStatusClass(status)}`}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
