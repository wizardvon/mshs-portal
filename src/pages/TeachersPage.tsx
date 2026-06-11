import { Plus, Pencil, Printer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataColumn } from "../components/common/DataTable";
import { ExcelImportButton } from "../components/common/ExcelImportButton";
import { ModalForm } from "../components/common/ModalForm";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import {
  createAncillaryLoad,
  subscribeAncillaryLoads,
  updateAncillaryLoad,
} from "../services/ancillaryLoadService";
import {
  createTeacher,
  deleteTeacher,
  subscribeTeachers,
  updateTeacher,
} from "../services/teacherService";
import type { AncillaryLoad, Teacher } from "../types/loading";
import { defaultSchoolYear } from "../types/loading";
import {
  optionalStatus,
  requireNumber,
  requireText,
  type ImportColumn,
} from "../utils/excelImport";
import { printTable } from "../utils/printTable";

const emptyTeacher = {
  fullName: "",
  position: "",
  specialization: "",
  maxLoad: 24,
  status: "active" as Teacher["status"],
};

const emptyAncillaryForm = {
  schoolYear: defaultSchoolYear,
  ancillary: "",
  units: 0,
};

export function TeachersPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ancillaryLoads, setAncillaryLoads] = useState<AncillaryLoad[]>([]);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [editingAncillaryLoad, setEditingAncillaryLoad] = useState<AncillaryLoad | null>(null);
  const [ancillaryTeacher, setAncillaryTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState(emptyTeacher);
  const [ancillaryForm, setAncillaryForm] = useState(emptyAncillaryForm);
  const [ancillaryError, setAncillaryError] = useState("");
  const [ancillarySaving, setAncillarySaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [ancillaryOpen, setAncillaryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [specializationFilter, setSpecializationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("fullName");

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeAncillaryLoads(setAncillaryLoads), []);

  const positionOptions = useMemo(
    () => [...new Set(teachers.map((teacher) => teacher.position).filter(Boolean))].sort(),
    [teachers],
  );

  const specializationOptions = useMemo(
    () =>
      [...new Set(teachers.map((teacher) => teacher.specialization).filter(Boolean))].sort(),
    [teachers],
  );

  const ancillaryLoadsByTeacher = useMemo(() => {
    const loadMap = new Map<string, AncillaryLoad[]>();

    ancillaryLoads.forEach((load) => {
      const teacherLoads = loadMap.get(load.teacherId) ?? [];
      teacherLoads.push(load);
      loadMap.set(load.teacherId, teacherLoads);
    });

    loadMap.forEach((loads) =>
      loads.sort((first, second) => {
        const schoolYearOrder = first.schoolYear.localeCompare(second.schoolYear);

        if (schoolYearOrder !== 0) return schoolYearOrder;

        return first.ancillary.localeCompare(second.ancillary);
      }),
    );

    return loadMap;
  }, [ancillaryLoads]);

  const visibleTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return teachers
      .filter((teacher) => {
        const matchesSearch = [
          teacher.fullName,
          teacher.position,
          teacher.specialization,
          teacher.maxLoad,
          teacher.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

        return (
          matchesSearch &&
          (positionFilter === "all" || teacher.position === positionFilter) &&
          (specializationFilter === "all" || teacher.specialization === specializationFilter) &&
          (statusFilter === "all" || teacher.status === statusFilter)
        );
      })
      .sort((first, second) => {
        if (sortBy === "position") {
          return `${first.position} ${first.fullName}`.localeCompare(
            `${second.position} ${second.fullName}`,
          );
        }
        if (sortBy === "specialization") {
          return `${first.specialization} ${first.fullName}`.localeCompare(
            `${second.specialization} ${second.fullName}`,
          );
        }
        if (sortBy === "maxLoad") {
          return first.maxLoad - second.maxLoad || first.fullName.localeCompare(second.fullName);
        }
        if (sortBy === "status") {
          return `${first.status} ${first.fullName}`.localeCompare(
            `${second.status} ${second.fullName}`,
          );
        }
        return first.fullName.localeCompare(second.fullName);
      });
  }, [positionFilter, search, sortBy, specializationFilter, statusFilter, teachers]);

  function startCreate() {
    setForm(emptyTeacher);
    setEditing(null);
    setOpen(true);
  }

  function startEdit(teacher: Teacher) {
    setForm({
      fullName: teacher.fullName,
      position: teacher.position,
      specialization: teacher.specialization,
      maxLoad: teacher.maxLoad,
      status: teacher.status,
    });
    setEditing(teacher);
    setOpen(true);
  }

  function startAddAncillary(teacher: Teacher) {
    setAncillaryTeacher(teacher);
    setEditingAncillaryLoad(null);
    setAncillaryForm(emptyAncillaryForm);
    setAncillaryError("");
    setAncillaryOpen(true);
  }

  function startEditAncillary(teacher: Teacher, load: AncillaryLoad) {
    setAncillaryTeacher(teacher);
    setEditingAncillaryLoad(load);
    setAncillaryForm({
      schoolYear: load.schoolYear,
      ancillary: load.ancillary,
      units: Number(load.units || 0),
    });
    setAncillaryError("");
    setAncillaryOpen(true);
  }

  async function saveTeacher() {
    if (editing) {
      await updateTeacher(editing.teacherId, form);
    } else {
      await createTeacher(form);
    }
    setOpen(false);
  }

  async function saveAncillaryLoad() {
    if (!ancillaryTeacher) return;

    setAncillarySaving(true);
    setAncillaryError("");

    try {
      if (editingAncillaryLoad) {
        await updateAncillaryLoad(editingAncillaryLoad.ancillaryLoadId, {
          schoolYear: ancillaryForm.schoolYear,
          ancillary: ancillaryForm.ancillary,
          units: Number(ancillaryForm.units || 0),
        });
      } else {
        await createAncillaryLoad({
          teacherId: ancillaryTeacher.teacherId,
          schoolYear: ancillaryForm.schoolYear,
          ancillary: ancillaryForm.ancillary,
          units: Number(ancillaryForm.units || 0),
        });
      }
      setAncillaryOpen(false);
    } catch (error) {
      console.error(error);
      setAncillaryError(
        error instanceof Error
          ? error.message
          : "Unable to add ancilliary load. Please try again.",
      );
    } finally {
      setAncillarySaving(false);
    }
  }

  async function importTeachers(records: Omit<Teacher, "teacherId" | "createdAt" | "updatedAt">[]) {
    for (const teacher of records) {
      await createTeacher(teacher);
    }
  }

  function printTeachers() {
    printTable({
      title: "Teachers",
      subtitle: "Filtered teacher list",
      rows: visibleTeachers,
      columns: [
        { header: "Teacher", getValue: (teacher) => teacher.fullName },
        { header: "Position", getValue: (teacher) => teacher.position },
        { header: "Specialization", getValue: (teacher) => teacher.specialization },
        { header: "Max Load", getValue: (teacher) => `${teacher.maxLoad} units` },
        {
          header: "Ancilliaries",
          getValue: (teacher) => {
            const loads = ancillaryLoadsByTeacher.get(teacher.teacherId) ?? [];

            return loads.length
              ? loads
                  .map((load) => `${load.ancillary} - ${load.units} units x 3 (${load.schoolYear})`)
                  .join("; ")
              : "None";
          },
        },
        { header: "Status", getValue: (teacher) => teacher.status },
      ],
    });
  }

  const importColumns: ImportColumn[] = [
    { key: "fullName", label: "fullName", required: true },
    { key: "position", label: "position", required: true },
    { key: "specialization", label: "specialization", required: true },
    { key: "maxLoad", label: "maxLoad", required: true },
    { key: "status", label: "status" },
  ];

  const columns: DataColumn<Teacher>[] = [
    {
      header: "Teacher",
      render: (teacher) => (
        <div>
          <p className="font-medium text-slate-950">{teacher.fullName}</p>
          <p className="text-xs text-slate-500">{teacher.teacherId}</p>
        </div>
      ),
    },
    { header: "Position", render: (teacher) => teacher.position },
    { header: "Specialization", render: (teacher) => teacher.specialization },
    { header: "Max Load", render: (teacher) => `${teacher.maxLoad} units` },
    {
      header: "Ancilliaries",
      render: (teacher) => {
        const teacherAncillaryLoads = ancillaryLoadsByTeacher.get(teacher.teacherId) ?? [];

        if (teacherAncillaryLoads.length === 0) {
          return <span className="text-xs text-slate-400">None</span>;
        }

        return (
          <div className="space-y-1">
            {teacherAncillaryLoads.map((load) => (
              <button
                className="block w-full rounded-md bg-emerald-50 px-2 py-1 text-left text-xs text-emerald-800 ring-1 ring-emerald-100 hover:bg-emerald-100"
                key={load.ancillaryLoadId}
                onClick={() => startEditAncillary(teacher, load)}
                type="button"
              >
                <span className="font-semibold">{load.ancillary}</span>
                <span className="text-emerald-700"> - {load.units} units x 3</span>
                <span className="text-emerald-600"> ({load.schoolYear})</span>
              </button>
            ))}
          </div>
        );
      },
    },
    {
      header: "Status",
      render: (teacher) => (
        <StatusBadge label={teacher.status} tone={teacher.status === "active" ? "green" : "slate"} />
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (teacher) =>
        canEdit && (
          <div className="flex justify-end gap-2">
            <button className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => startAddAncillary(teacher)} type="button">
              <Plus size={14} />
              Add Ancilliary
            </button>
            <button className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" onClick={() => startEdit(teacher)} type="button">
              <Pencil size={16} />
            </button>
            <button className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => deleteTeacher(teacher.teacherId)} type="button">
              <Trash2 size={16} />
            </button>
          </div>
        ),
    },
  ];

  return (
    <section>
      <PageHeader
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={printTeachers} type="button">
              <Printer size={16} /> Print
            </button>
            {canEdit && (
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" onClick={startCreate} type="button">
                <Plus size={16} /> Add Teacher
              </button>
            )}
          </>
        }
        description="Manage SHS faculty members and load limits."
        title="Teachers"
      />
      {canEdit && (
        <div className="mb-5">
          <ExcelImportButton
            columns={importColumns}
            formatNote='Accepted files: .xlsx, .xls, .csv. First sheet headers: fullName, position, specialization, maxLoad, status. Status is optional; use "active" or "inactive".'
            onImport={importTeachers}
            transform={(row, rowNumber) => ({
              fullName: requireText(row.fullName, rowNumber, "fullName"),
              position: requireText(row.position, rowNumber, "position"),
              specialization: requireText(row.specialization, rowNumber, "specialization"),
              maxLoad: requireNumber(row.maxLoad, rowNumber, "maxLoad"),
              status: optionalStatus(row.status) as Teacher["status"],
            })}
          />
        </div>
      )}
      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(4,minmax(130px,180px))]">
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search teachers"
            value={search}
          />
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setPositionFilter(event.target.value)} value={positionFilter}>
            <option value="all">All positions</option>
            {positionOptions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSpecializationFilter(event.target.value)} value={specializationFilter}>
            <option value="all">All specializations</option>
            {specializationOptions.map((specialization) => <option key={specialization} value={specialization}>{specialization}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
            <option value="fullName">Sort by name</option>
            <option value="position">Sort by position</option>
            <option value="specialization">Sort by specialization</option>
            <option value="maxLoad">Sort by max load</option>
            <option value="status">Sort by status</option>
          </select>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Showing {visibleTeachers.length} of {teachers.length} teachers
        </p>
      </div>
      <DataTable columns={columns} data={visibleTeachers} getKey={(teacher) => teacher.teacherId} />
      <ModalForm onClose={() => setOpen(false)} onSubmit={saveTeacher} open={open} title={editing ? "Edit Teacher" : "Add Teacher"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Full Name" required value={form.fullName} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="Position" required value={form.position} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, specialization: event.target.value })} placeholder="Specialization" required value={form.specialization} />
          <input className="h-11 rounded-md border border-slate-300 px-3" min={0} onChange={(event) => setForm({ ...form, maxLoad: Number(event.target.value) })} placeholder="Max Load" type="number" value={form.maxLoad} />
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, status: event.target.value as Teacher["status"] })} value={form.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </ModalForm>
      <ModalForm
        onClose={() => setAncillaryOpen(false)}
        onSubmit={saveAncillaryLoad}
        open={ancillaryOpen}
        submitLabel={
          ancillarySaving
            ? editingAncillaryLoad
              ? "Saving..."
              : "Adding..."
            : editingAncillaryLoad
              ? "Save Ancilliary"
              : "Add Ancilliary"
        }
        title={`${editingAncillaryLoad ? "Edit" : "Add"} Ancilliary${ancillaryTeacher ? ` - ${ancillaryTeacher.fullName}` : ""}`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            className="h-11 rounded-md border border-slate-300 px-3"
            onChange={(event) => setAncillaryForm({ ...ancillaryForm, schoolYear: event.target.value })}
            placeholder="School Year"
            required
            value={ancillaryForm.schoolYear}
          />
          <input
            className="h-11 rounded-md border border-slate-300 px-3"
            onChange={(event) => setAncillaryForm({ ...ancillaryForm, ancillary: event.target.value })}
            placeholder="Ancilliary"
            required
            value={ancillaryForm.ancillary}
          />
          <input
            className="h-11 rounded-md border border-slate-300 px-3"
            min={0}
            onChange={(event) => setAncillaryForm({ ...ancillaryForm, units: Number(event.target.value) })}
            placeholder="Units"
            required
            type="number"
            value={ancillaryForm.units}
          />
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Added load: <span className="font-semibold text-slate-950">{Number(ancillaryForm.units || 0) * 3} units</span>
          </div>
          {ancillaryError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2">
              {ancillaryError}
            </p>
          )}
        </div>
      </ModalForm>
    </section>
  );
}
