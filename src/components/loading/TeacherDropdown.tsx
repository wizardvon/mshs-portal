import type { Teacher } from "../../types/loading";

type TeacherDropdownProps = {
  teachers: Teacher[];
  value?: string;
  disabled?: boolean;
  onChange: (teacherId: string) => void;
};

export function TeacherDropdown({
  teachers,
  value = "",
  disabled,
  onChange,
}: TeacherDropdownProps) {
  return (
    <select
      className="h-8 w-full min-w-32 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">Unassigned</option>
      {teachers.map((teacher) => (
        <option key={teacher.teacherId} value={teacher.teacherId}>
          {teacher.fullName}
        </option>
      ))}
    </select>
  );
}
