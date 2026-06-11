import type { LoadAssignment, Teacher } from "../types/loading";
import { getLoadStatus } from "./statusRules";

export function getTeacherTotalLoad(
  teacherId: string,
  assignments: LoadAssignment[],
  schoolYear: string,
  term: string,
) {
  return assignments
    .filter(
      (assignment) =>
        assignment.teacherId === teacherId &&
        assignment.schoolYear === schoolYear &&
        assignment.term === term,
    )
    .reduce((sum, assignment) => sum + Number(assignment.units || 0), 0);
}

export function buildTeacherLoadSummaries(
  teachers: Teacher[],
  assignments: LoadAssignment[],
  schoolYear: string,
  term: string,
) {
  return teachers.map((teacher) => {
    const totalLoad = getTeacherTotalLoad(
      teacher.teacherId,
      assignments,
      schoolYear,
      term,
    );

    return {
      teacher,
      totalLoad,
      status: getLoadStatus(totalLoad),
    };
  });
}
