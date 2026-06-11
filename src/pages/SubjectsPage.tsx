import { Plus, Pencil, Printer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataColumn } from "../components/common/DataTable";
import { ExcelImportButton } from "../components/common/ExcelImportButton";
import { ModalForm } from "../components/common/ModalForm";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import { createSubject, deleteSubject, subscribeSubjects, updateSubject } from "../services/subjectService";
import type { AcademicTerm, Subject, SubjectCategory } from "../types/loading";
import { defaultTerm, subjectCategories, termOptions } from "../types/loading";
import {
  optionalStatus,
  requireNumber,
  requireText,
  type ImportColumn,
} from "../utils/excelImport";
import { printTable } from "../utils/printTable";

const emptySubject = {
  subjectCode: "",
  subjectName: "",
  category: "Core Subjects" as SubjectCategory,
  units: 3,
  gradeLevel: "11",
  strand: "All",
  term: defaultTerm,
  status: "active" as Subject["status"],
};

export function SubjectsPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState(emptySubject);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [strandFilter, setStrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("subjectCode");

  useEffect(() => subscribeSubjects(setSubjects), []);

  const strandOptions = useMemo(
    () => [...new Set(subjects.map((subject) => subject.strand).filter(Boolean))].sort(),
    [subjects],
  );

  const visibleSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();

    return subjects
      .filter((subject) => {
        const matchesSearch = [
          subject.subjectCode,
          subject.subjectName,
          subject.category,
          subject.gradeLevel,
          subject.strand,
          subject.term,
          subject.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

        return (
          matchesSearch &&
          (categoryFilter === "all" || subject.category === categoryFilter) &&
          (termFilter === "all" || subject.term === termFilter) &&
          (gradeFilter === "all" || subject.gradeLevel === gradeFilter) &&
          (strandFilter === "all" || subject.strand === strandFilter) &&
          (statusFilter === "all" || subject.status === statusFilter)
        );
      })
      .sort((first, second) => {
        if (sortBy === "subjectName") {
          return first.subjectName.localeCompare(second.subjectName);
        }
        if (sortBy === "category") {
          return `${first.category} ${first.subjectCode}`.localeCompare(
            `${second.category} ${second.subjectCode}`,
          );
        }
        if (sortBy === "units") {
          return first.units - second.units || first.subjectCode.localeCompare(second.subjectCode);
        }
        if (sortBy === "gradeLevel") {
          return `${first.gradeLevel} ${first.strand} ${first.subjectCode}`.localeCompare(
            `${second.gradeLevel} ${second.strand} ${second.subjectCode}`,
          );
        }
        if (sortBy === "term") {
          return `${first.term} ${first.subjectCode}`.localeCompare(
            `${second.term} ${second.subjectCode}`,
          );
        }
        if (sortBy === "status") {
          return `${first.status} ${first.subjectCode}`.localeCompare(
            `${second.status} ${second.subjectCode}`,
          );
        }
        return first.subjectCode.localeCompare(second.subjectCode);
      });
  }, [categoryFilter, gradeFilter, search, sortBy, statusFilter, strandFilter, subjects, termFilter]);

  function startCreate() {
    setEditing(null);
    setForm(emptySubject);
    setOpen(true);
  }

  function startEdit(subject: Subject) {
    setEditing(subject);
    setForm({
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      category: subject.category,
      units: subject.units,
      gradeLevel: subject.gradeLevel,
      strand: subject.strand,
      term: subject.term,
      status: subject.status,
    });
    setOpen(true);
  }

  async function saveSubject() {
    if (editing) await updateSubject(editing.subjectId, form);
    else await createSubject(form);
    setOpen(false);
  }

  async function importSubjects(records: Omit<Subject, "subjectId" | "createdAt" | "updatedAt">[]) {
    for (const subject of records) {
      await createSubject(subject);
    }
  }

  function printSubjects() {
    printTable({
      title: "Subjects",
      subtitle: "Filtered subject list",
      rows: visibleSubjects,
      columns: [
        { header: "Code", getValue: (subject) => subject.subjectCode },
        { header: "Subject", getValue: (subject) => subject.subjectName },
        { header: "Category", getValue: (subject) => subject.category },
        { header: "Units", getValue: (subject) => subject.units },
        {
          header: "Grade / Strand",
          getValue: (subject) => `G${subject.gradeLevel} - ${subject.strand}`,
        },
        { header: "Term", getValue: (subject) => subject.term },
        { header: "Status", getValue: (subject) => subject.status },
      ],
    });
  }

  const importColumns: ImportColumn[] = [
    { key: "subjectCode", label: "subjectCode", required: true },
    { key: "subjectName", label: "subjectName", required: true },
    { key: "category", label: "category", required: true },
    { key: "units", label: "units", required: true },
    { key: "gradeLevel", label: "gradeLevel", required: true },
    { key: "strand", label: "strand", required: true },
    { key: "term", label: "term", required: true },
    { key: "status", label: "status" },
  ];

  const columns: DataColumn<Subject>[] = [
    { header: "Code", render: (subject) => <span className="font-semibold text-slate-950">{subject.subjectCode}</span> },
    { header: "Subject", render: (subject) => subject.subjectName },
    { header: "Category", render: (subject) => subject.category },
    { header: "Units", render: (subject) => subject.units },
    { header: "Grade / Strand", render: (subject) => `G${subject.gradeLevel} - ${subject.strand}` },
    { header: "Term", render: (subject) => subject.term },
    { header: "Status", render: (subject) => <StatusBadge label={subject.status} tone={subject.status === "active" ? "green" : "slate"} /> },
    {
      header: "Actions",
      align: "right",
      render: (subject) => canEdit && (
        <div className="flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" onClick={() => startEdit(subject)} type="button"><Pencil size={16} /></button>
          <button className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => deleteSubject(subject.subjectId)} type="button"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={printSubjects} type="button">
              <Printer size={16} /> Print
            </button>
            {canEdit && <button className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" onClick={startCreate} type="button"><Plus size={16} /> Add Subject</button>}
          </>
        }
        description="Maintain subject offerings, categories, units, strands, and terms."
        title="Subjects"
      />
      {canEdit && (
        <div className="mb-5">
          <ExcelImportButton
            columns={importColumns}
            formatNote='Accepted files: .xlsx, .xls, .csv. First sheet headers: subjectCode, subjectName, category, units, gradeLevel, strand, term, status. Category must be one of: Core Subjects; Applied / Specialized Subjects; Track / Strand Subjects; Electives / Others. Status is optional.'
            onImport={importSubjects}
            transform={(row, rowNumber) => {
              const category = requireText(row.category, rowNumber, "category") as SubjectCategory;
              if (!subjectCategories.includes(category)) {
                throw new Error(`Row ${rowNumber}: category must match one of the listed categories.`);
              }
              const term = requireText(row.term, rowNumber, "term") as AcademicTerm;
              if (!termOptions.includes(term)) {
                throw new Error(`Row ${rowNumber}: term must be 1st Term, 2nd Term, or 3rd Term.`);
              }
              return {
                subjectCode: requireText(row.subjectCode, rowNumber, "subjectCode"),
                subjectName: requireText(row.subjectName, rowNumber, "subjectName"),
                category,
                units: requireNumber(row.units, rowNumber, "units"),
                gradeLevel: requireText(row.gradeLevel, rowNumber, "gradeLevel"),
                strand: requireText(row.strand, rowNumber, "strand"),
                term,
                status: optionalStatus(row.status) as Subject["status"],
              };
            }}
          />
        </div>
      )}
      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(6,minmax(120px,170px))]">
          <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Search subjects" value={search} />
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
            <option value="all">All categories</option>
            {subjectCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setTermFilter(event.target.value)} value={termFilter}>
            <option value="all">All terms</option>
            {termOptions.map((term) => <option key={term} value={term}>{term}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setGradeFilter(event.target.value)} value={gradeFilter}>
            <option value="all">All grades</option>
            <option value="11">Grade 11</option>
            <option value="12">Grade 12</option>
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setStrandFilter(event.target.value)} value={strandFilter}>
            <option value="all">All strands</option>
            {strandOptions.map((strand) => <option key={strand} value={strand}>{strand}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
            <option value="subjectCode">Sort by code</option>
            <option value="subjectName">Sort by subject</option>
            <option value="category">Sort by category</option>
            <option value="units">Sort by units</option>
            <option value="gradeLevel">Sort by grade</option>
            <option value="term">Sort by term</option>
            <option value="status">Sort by status</option>
          </select>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Showing {visibleSubjects.length} of {subjects.length} subjects
        </p>
      </div>
      <DataTable columns={columns} data={visibleSubjects} getKey={(subject) => subject.subjectId} />
      <ModalForm onClose={() => setOpen(false)} onSubmit={saveSubject} open={open} title={editing ? "Edit Subject" : "Add Subject"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, subjectCode: event.target.value })} placeholder="Subject Code" required value={form.subjectCode} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, subjectName: event.target.value })} placeholder="Subject Name" required value={form.subjectName} />
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, category: event.target.value as SubjectCategory })} value={form.category}>
            {subjectCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <input className="h-11 rounded-md border border-slate-300 px-3" min={0} onChange={(event) => setForm({ ...form, units: Number(event.target.value) })} placeholder="Units" type="number" value={form.units} />
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, gradeLevel: event.target.value })} value={form.gradeLevel}>
            <option value="11">Grade 11</option>
            <option value="12">Grade 12</option>
          </select>
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, strand: event.target.value })} placeholder="Strand" value={form.strand} />
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, term: event.target.value as AcademicTerm })} value={form.term}>
            {termOptions.map((term) => <option key={term} value={term}>{term}</option>)}
          </select>
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setForm({ ...form, status: event.target.value as Subject["status"] })} value={form.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </ModalForm>
    </section>
  );
}
