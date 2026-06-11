import { BookOpen, ClipboardList, GraduationCap, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { SummaryCard } from "../components/common/SummaryCard";
import { LoadSummaryPanel } from "../components/loading/LoadSummaryPanel";
import { subscribeLoadAssignmentsByPeriod } from "../services/assignmentService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import { subscribeTeachers } from "../services/teacherService";
import type { LoadAssignment, Section, Subject, Teacher } from "../types/loading";
import { defaultSchoolYear, defaultTerm } from "../types/loading";

export function LoadingDashboardPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(
    () => subscribeLoadAssignmentsByPeriod(defaultSchoolYear, defaultTerm, setAssignments),
    [],
  );

  return (
    <section>
      <PageHeader
        description="Senior High School loading overview, current assignments, and faculty load health."
        title="SHS Loading Management System"
      />
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard detail="active faculty" icon={GraduationCap} label="Teachers" value={teachers.length} />
        <SummaryCard detail="subject offerings" icon={BookOpen} label="Subjects" value={subjects.length} />
        <SummaryCard detail={defaultSchoolYear} icon={ClipboardList} label="Sections" value={sections.length} />
        <SummaryCard detail={defaultTerm} icon={Table2} label="Assignments" value={assignments.length} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Assignment Coverage</h2>
          <div className="mt-5 h-64 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5">
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-4xl font-semibold text-blue-700">{assignments.length}</p>
                <p className="mt-2 text-sm text-slate-600">subject-section cells currently assigned</p>
              </div>
            </div>
          </div>
        </div>
        <LoadSummaryPanel assignments={assignments} schoolYear={defaultSchoolYear} teachers={teachers} term={defaultTerm} />
      </div>
    </section>
  );
}
