import { Plus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataColumn } from "../components/common/DataTable";
import { ExcelImportButton } from "../components/common/ExcelImportButton";
import { ModalForm } from "../components/common/ModalForm";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import { createSection, deleteSection, subscribeSections, updateSection } from "../services/sectionService";
import type { Section } from "../types/loading";
import { defaultSchoolYear } from "../types/loading";
import {
  optionalStatus,
  requireText,
  type ImportColumn,
} from "../utils/excelImport";

const emptySection = {
  sectionName: "",
  gradeLevel: "11",
  track: "Academic",
  strand: "",
  room: "",
  schoolYear: defaultSchoolYear,
  status: "active" as Section["status"],
};

export function SectionsPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";
  const [sections, setSections] = useState<Section[]>([]);
  const [editing, setEditing] = useState<Section | null>(null);
  const [form, setForm] = useState(emptySection);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [strandFilter, setStrandFilter] = useState("all");
  const [roomFilter, setRoomFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolYearFilter, setSchoolYearFilter] = useState("all");
  const [sortBy, setSortBy] = useState("sectionName");

  useEffect(() => subscribeSections(setSections), []);

  const strandOptions = useMemo(
    () => [...new Set(sections.map((section) => section.strand).filter(Boolean))].sort(),
    [sections],
  );

  const schoolYearOptions = useMemo(
    () => [...new Set(sections.map((section) => section.schoolYear).filter(Boolean))].sort(),
    [sections],
  );

  const roomOptions = useMemo(
    () =>
      [
        ...new Set(
          sections
            .map((section) => section.room)
            .filter((room): room is string => Boolean(room)),
        ),
      ].sort(),
    [sections],
  );

  const visibleSections = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sections
      .filter((section) => {
        const matchesSearch = [
          section.sectionName,
          section.gradeLevel,
          section.track,
          section.strand,
          section.room,
          section.schoolYear,
          section.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

        return (
          matchesSearch &&
          (gradeFilter === "all" || section.gradeLevel === gradeFilter) &&
          (strandFilter === "all" || section.strand === strandFilter) &&
          (roomFilter === "all" || section.room === roomFilter) &&
          (statusFilter === "all" || section.status === statusFilter) &&
          (schoolYearFilter === "all" || section.schoolYear === schoolYearFilter)
        );
      })
      .sort((first, second) => {
        if (sortBy === "gradeLevel") {
          return `${first.gradeLevel} ${first.strand} ${first.sectionName}`.localeCompare(
            `${second.gradeLevel} ${second.strand} ${second.sectionName}`,
          );
        }
        if (sortBy === "strand") {
          return `${first.strand} ${first.sectionName}`.localeCompare(
            `${second.strand} ${second.sectionName}`,
          );
        }
        if (sortBy === "schoolYear") {
          return `${first.schoolYear} ${first.sectionName}`.localeCompare(
            `${second.schoolYear} ${second.sectionName}`,
          );
        }
        if (sortBy === "room") {
          return `${first.room ?? ""} ${first.sectionName}`.localeCompare(
            `${second.room ?? ""} ${second.sectionName}`,
          );
        }
        if (sortBy === "status") {
          return `${first.status} ${first.sectionName}`.localeCompare(
            `${second.status} ${second.sectionName}`,
          );
        }
        return first.sectionName.localeCompare(second.sectionName);
      });
  }, [gradeFilter, roomFilter, schoolYearFilter, search, sections, sortBy, statusFilter, strandFilter]);

  function startCreate() {
    setEditing(null);
    setForm(emptySection);
    setOpen(true);
  }

  function startEdit(section: Section) {
    setEditing(section);
    setForm({
      sectionName: section.sectionName,
      gradeLevel: section.gradeLevel,
      track: section.track,
      strand: section.strand,
      room: section.room ?? "",
      schoolYear: section.schoolYear,
      status: section.status,
    });
    setOpen(true);
  }

  async function saveSection() {
    if (editing) await updateSection(editing.sectionId, form);
    else await createSection(form);
    setOpen(false);
  }

  async function importSections(records: Omit<Section, "sectionId" | "createdAt" | "updatedAt">[]) {
    for (const section of records) {
      await createSection(section);
    }
  }

  const importColumns: ImportColumn[] = [
    { key: "sectionName", label: "sectionName", required: true },
    { key: "gradeLevel", label: "gradeLevel", required: true },
    { key: "track", label: "track", required: true },
    { key: "strand", label: "strand", required: true },
    { key: "room", label: "room" },
    { key: "schoolYear", label: "schoolYear", required: true },
    { key: "status", label: "status" },
  ];

  const columns: DataColumn<Section>[] = [
    { header: "Section", render: (section) => <span className="font-semibold text-slate-950">{section.sectionName}</span> },
    { header: "Grade", render: (section) => `Grade ${section.gradeLevel}` },
    { header: "Track", render: (section) => section.track },
    { header: "Strand", render: (section) => section.strand },
    { header: "Room", render: (section) => section.room || "Unassigned" },
    { header: "School Year", render: (section) => section.schoolYear },
    { header: "Status", render: (section) => <StatusBadge label={section.status} tone={section.status === "active" ? "green" : "slate"} /> },
    {
      header: "Actions",
      align: "right",
      render: (section) => canEdit && (
        <div className="flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" onClick={() => startEdit(section)} type="button"><Pencil size={16} /></button>
          <button className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => deleteSection(section.sectionId)} type="button"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        actions={canEdit && <button className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" onClick={startCreate} type="button"><Plus size={16} /> Add Section</button>}
        description="Maintain SHS sections by grade level, track, strand, and school year."
        title="Sections"
      />
      {canEdit && (
        <div className="mb-5">
          <ExcelImportButton
            columns={importColumns}
            formatNote='Accepted files: .xlsx, .xls, .csv. First sheet headers: sectionName, gradeLevel, track, strand, room, schoolYear, status. Example gradeLevel: 11 or 12. Room and status are optional; use "active" or "inactive".'
            onImport={importSections}
            transform={(row, rowNumber) => ({
              sectionName: requireText(row.sectionName, rowNumber, "sectionName"),
              gradeLevel: requireText(row.gradeLevel, rowNumber, "gradeLevel"),
              track: requireText(row.track, rowNumber, "track"),
              strand: requireText(row.strand, rowNumber, "strand"),
              room: String(row.room ?? "").trim(),
              schoolYear: requireText(row.schoolYear, rowNumber, "schoolYear"),
              status: optionalStatus(row.status) as Section["status"],
            })}
          />
        </div>
      )}
      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(6,minmax(130px,170px))]">
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sections"
            value={search}
          />
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setGradeFilter(event.target.value)} value={gradeFilter}>
            <option value="all">All grades</option>
            <option value="11">Grade 11</option>
            <option value="12">Grade 12</option>
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setStrandFilter(event.target.value)} value={strandFilter}>
            <option value="all">All strands</option>
            {strandOptions.map((strand) => <option key={strand} value={strand}>{strand}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSchoolYearFilter(event.target.value)} value={schoolYearFilter}>
            <option value="all">All years</option>
            {schoolYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setRoomFilter(event.target.value)} value={roomFilter}>
            <option value="all">All rooms</option>
            {roomOptions.map((room) => <option key={room} value={room}>{room}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
            <option value="sectionName">Sort by section</option>
            <option value="gradeLevel">Sort by grade</option>
            <option value="strand">Sort by strand</option>
            <option value="schoolYear">Sort by year</option>
            <option value="room">Sort by room</option>
            <option value="status">Sort by status</option>
          </select>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Showing {visibleSections.length} of {sections.length} sections
        </p>
      </div>
      <DataTable columns={columns} data={visibleSections} getKey={(section) => section.sectionId} />
      <ModalForm onClose={() => setOpen(false)} onSubmit={saveSection} open={open} title={editing ? "Edit Section" : "Add Section"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, sectionName: event.target.value })} placeholder="Section Name" required value={form.sectionName} />
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, gradeLevel: event.target.value })} value={form.gradeLevel}>
            <option value="11">Grade 11</option>
            <option value="12">Grade 12</option>
          </select>
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, track: event.target.value })} placeholder="Track" value={form.track} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, strand: event.target.value })} placeholder="Strand" required value={form.strand} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, room: event.target.value })} placeholder="Room" value={form.room} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, schoolYear: event.target.value })} placeholder="School Year" value={form.schoolYear} />
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, status: event.target.value as Section["status"] })} value={form.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </ModalForm>
    </section>
  );
}
