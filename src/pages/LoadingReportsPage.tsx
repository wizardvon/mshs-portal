import { useEffect, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { subscribeLoadAssignmentsByPeriod } from "../services/assignmentService";
import { subscribeTeachers } from "../services/teacherService";
import type { LoadAssignment, Teacher } from "../types/loading";
import { defaultSchoolYear, defaultTerm } from "../types/loading";
import { buildTeacherLoadSummaries } from "../utils/loadCalculations";
import { AlertTriangle, BarChart3, CheckCircle2, Clock } from "lucide-react";

export function LoadingReportsPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(
    () => subscribeLoadAssignmentsByPeriod(defaultSchoolYear, defaultTerm, setAssignments),
    [],
  );

  const summaries = buildTeacherLoadSummaries(teachers, assignments, defaultSchoolYear, defaultTerm);

  return (
    <section>
      <PageHeader description="View-only loading summaries and faculty load distribution." title="Loading Reports" />
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={BarChart3} label="Assignments" value={assignments.length} />
        <SummaryCard icon={Clock} label="Under Teaching Load" value={summaries.filter((row) => row.status === "Under Teaching Load").length} />
        <SummaryCard icon={CheckCircle2} label="Normal / Full Teaching Load" value={summaries.filter((row) => row.status === "Normal Teaching Load" || row.status === "Full Teaching Load").length} />
        <SummaryCard icon={AlertTriangle} label="Over Teaching Load" value={summaries.filter((row) => row.status === "Over Teaching Load").length} />
      </div>
    </section>
  );
}
