import type { CurriculumMapping, LoadAssignment, Section, Subject, Teacher } from "../../types/loading";
import { subjectCategories } from "../../types/loading";
import { TeacherDropdown } from "./TeacherDropdown";

type LoadMatrixProps = {
  subjects: Subject[];
  sections: Section[];
  teachers: Teacher[];
  assignments: LoadAssignment[];
  mappings: CurriculumMapping[];
  canEdit: boolean;
  gradeLevel?: string;
  onAssign: (subject: Subject, section: Section, teacherId: string) => void;
};

const categoryClass: Record<string, string> = {
  "Core Subjects": "border-l-blue-500 bg-blue-50/70",
  "Applied / Specialized Subjects": "border-l-emerald-500 bg-emerald-50/70",
  "Track / Strand Subjects": "border-l-amber-500 bg-amber-50/70",
  "Electives / Others": "border-l-slate-500 bg-slate-50",
};

export function LoadMatrix({
  subjects,
  sections,
  teachers,
  assignments,
  mappings,
  canEdit,
  gradeLevel,
  onAssign,
}: LoadMatrixProps) {
  const mappedSubjectIds = new Set(mappings.map((mapping) => mapping.subjectId));
  const mappedCells = new Set(
    mappings.map((mapping) => `${mapping.sectionId}:${mapping.subjectId}`),
  );

  function getAssignedTeacher(subjectId: string, sectionId: string) {
    return assignments.find(
      (assignment) =>
        assignment.subjectId === subjectId && assignment.sectionId === sectionId,
    )?.teacherId;
  }

  function isMapped(subjectId: string, sectionId: string) {
    return mappedCells.has(`${sectionId}:${subjectId}`);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Load Assignment Matrix</h2>
          <p className="mt-1 text-xs text-slate-500">
            {gradeLevel ? `Grade ${gradeLevel} only. ` : ""}
            Teacher selectors appear only for subject-section pairs from Curriculum Mapping.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {mappings.length} mapped cells
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="w-56 px-3 py-2 font-semibold">Subject</th>
              {sections.map((section) => (
                <th className="px-2 py-2 font-semibold" key={section.sectionId}>
                  <div>{section.sectionName}</div>
                  <div className="mt-0.5 text-[11px] font-normal text-slate-300">
                    G{section.gradeLevel} {section.strand}
                  </div>
                  {section.room && (
                    <div className="mt-0.5 text-[11px] font-normal text-slate-300">
                      Room {section.room}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subjectCategories.map((category) => {
              const categorySubjects = subjects.filter(
                (subject) =>
                  subject.category === category && mappedSubjectIds.has(subject.subjectId),
              );

              if (categorySubjects.length === 0) return null;

              return categorySubjects.map((subject, index) => (
                <tr className={categoryClass[category]} key={subject.subjectId}>
                  <td className="border-l-4 px-3 py-2">
                    {index === 0 && (
                      <p className="mb-0.5 text-[10px] font-bold uppercase text-slate-500">
                        {category}
                      </p>
                    )}
                    <p className="font-semibold text-slate-950">{subject.subjectName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {subject.subjectCode} - {subject.units} units
                    </p>
                  </td>
                  {sections.map((section) => {
                    const mapped = isMapped(subject.subjectId, section.sectionId);
                    const assignedTeacherId = getAssignedTeacher(
                      subject.subjectId,
                      section.sectionId,
                    );

                    return (
                      <td
                        className={[
                          "min-w-36 px-2 py-1.5",
                          mapped && assignedTeacherId
                            ? "bg-emerald-50/80"
                            : mapped
                              ? "bg-red-50/80"
                              : "",
                        ].join(" ")}
                        key={section.sectionId}
                      >
                        {mapped ? (
                          <TeacherDropdown
                            disabled={!canEdit}
                            onChange={(teacherId) => onAssign(subject, section, teacherId)}
                            teachers={teachers}
                            value={assignedTeacherId ?? ""}
                          />
                        ) : (
                          <span className="inline-flex h-8 w-full items-center rounded-md border border-dashed border-slate-200 bg-white/70 px-2 text-[11px] font-medium text-slate-400">
                            Not mapped
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
        {mappings.length === 0 && (
          <div className="border-t border-slate-100 p-8 text-center text-sm text-slate-500">
            No curriculum mappings yet for this school year and term.
          </div>
        )}
      </div>
    </div>
  );
}
