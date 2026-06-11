import { Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { LoadMatrix } from "../components/loading/LoadMatrix";
import { useAuth } from "../providers/AuthProvider";
import {
  removeLoadAssignment,
  saveLoadAssignment,
  subscribeLoadAssignmentsByPeriod,
} from "../services/assignmentService";
import { subscribeCurriculumMappings } from "../services/curriculumService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import { subscribeTeachers } from "../services/teacherService";
import type { AcademicTerm, CurriculumMapping, LoadAssignment, Section, Subject, SubjectCategory, Teacher } from "../types/loading";
import { defaultSchoolYear, defaultTerm, subjectCategories, termOptions } from "../types/loading";

type SectionSort = "sectionName" | "gradeLevel" | "strand";
type SubjectSort = "subjectName" | "subjectCode" | "units";
type PendingAssignmentChange = {
  key: string;
  subject: Subject;
  section: Section;
  teacherId: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function LoadAssignmentPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [term, setTerm] = useState(defaultTerm);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [strandFilter, setStrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<SubjectCategory | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionSort, setSectionSort] = useState<SectionSort>("sectionName");
  const [subjectSort, setSubjectSort] = useState<SubjectSort>("subjectName");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [mappings, setMappings] = useState<CurriculumMapping[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingAssignmentChange>>({});
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeCurriculumMappings(setMappings), []);
  useEffect(
    () => subscribeLoadAssignmentsByPeriod(schoolYear, term, setAssignments),
    [schoolYear, term],
  );
  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    setPendingChanges({});
    setSaveError("");
  }, [schoolYear, term]);

  const activeSubjects = useMemo(
    () => subjects.filter((subject) => subject.status === "active" && subject.term === term),
    [subjects, term],
  );

  const activeSections = useMemo(
    () => sections.filter((section) => section.status === "active" && section.schoolYear === schoolYear),
    [sections, schoolYear],
  );

  const activeSectionIds = useMemo(
    () => new Set(activeSections.map((section) => section.sectionId)),
    [activeSections],
  );

  const sectionsById = useMemo(
    () => new Map(activeSections.map((section) => [section.sectionId, section])),
    [activeSections],
  );

  const subjectsById = useMemo(
    () => new Map(activeSubjects.map((subject) => [subject.subjectId, subject])),
    [activeSubjects],
  );

  const teachersById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])),
    [teachers],
  );

  const pendingChangeList = useMemo(
    () => Object.values(pendingChanges),
    [pendingChanges],
  );

  const effectiveAssignments = useMemo(() => {
    const assignmentMap = new Map(
      assignments.map((assignment) => [
        `${assignment.sectionId}:${assignment.subjectId}`,
        assignment,
      ]),
    );

    pendingChangeList.forEach((change) => {
      const cellKey = `${change.section.sectionId}:${change.subject.subjectId}`;

      if (!change.teacherId) {
        assignmentMap.delete(cellKey);
        return;
      }

      assignmentMap.set(cellKey, {
        assignmentId: change.key,
        schoolYear,
        term,
        gradeLevel: change.section.gradeLevel,
        strand: change.section.strand,
        subjectId: change.subject.subjectId,
        sectionId: change.section.sectionId,
        teacherId: change.teacherId,
        units: Number(change.subject.units || 0),
      });
    });

    return [...assignmentMap.values()];
  }, [assignments, pendingChangeList, schoolYear, term]);

  const effectiveAssignmentsByCell = useMemo(
    () =>
      new Map(
        effectiveAssignments.map((assignment) => [
          `${assignment.sectionId}:${assignment.subjectId}`,
          assignment,
        ]),
      ),
    [effectiveAssignments],
  );

  const visibleMappings = useMemo(
    () =>
      mappings.filter(
        (mapping) =>
          mapping.schoolYear === schoolYear &&
          mapping.term === term &&
          activeSectionIds.has(mapping.sectionId) &&
          sectionsById.get(mapping.sectionId)?.gradeLevel ===
            subjectsById.get(mapping.subjectId)?.gradeLevel,
      ),
    [activeSectionIds, mappings, schoolYear, sectionsById, subjectsById, term],
  );

  const allVisibleSections = useMemo(
    () =>
      activeSections
        .filter((section) =>
          visibleMappings.some((mapping) => mapping.sectionId === section.sectionId),
        )
        .sort((first, second) => first.sectionName.localeCompare(second.sectionName)),
    [activeSections, visibleMappings],
  );

  const gradeOptions = useMemo(
    () => [...new Set(allVisibleSections.map((section) => section.gradeLevel))].sort(),
    [allVisibleSections],
  );

  const strandOptions = useMemo(
    () => [...new Set(allVisibleSections.map((section) => section.strand))].sort(),
    [allVisibleSections],
  );

  const filteredMappings = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return visibleMappings.filter((mapping) => {
      const section = sectionsById.get(mapping.sectionId);
      const subject = subjectsById.get(mapping.subjectId);
      const assignment = effectiveAssignmentsByCell.get(`${mapping.sectionId}:${mapping.subjectId}`);
      const teacher = assignment ? teachersById.get(assignment.teacherId) : undefined;

      if (!section || !subject) return false;
      if (gradeFilter !== "all" && section.gradeLevel !== gradeFilter) return false;
      if (strandFilter !== "all" && section.strand !== strandFilter) return false;
      if (categoryFilter !== "all" && subject.category !== categoryFilter) return false;
      if (!normalizedSearch) return true;

      return [
        section.sectionName,
        section.gradeLevel,
        section.strand,
        section.room ?? "",
        subject.subjectName,
        subject.subjectCode,
        subject.category,
        teacher?.fullName ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [
    categoryFilter,
    effectiveAssignmentsByCell,
    gradeFilter,
    searchTerm,
    sectionsById,
    strandFilter,
    subjectsById,
    teachersById,
    visibleMappings,
  ]);

  const mappedSubjectIds = useMemo(
    () => new Set(filteredMappings.map((mapping) => mapping.subjectId)),
    [filteredMappings],
  );

  const mappedSectionIds = useMemo(
    () => new Set(filteredMappings.map((mapping) => mapping.sectionId)),
    [filteredMappings],
  );

  const mappedCellKeys = useMemo(
    () =>
      new Set(
        filteredMappings.map((mapping) => `${mapping.sectionId}:${mapping.subjectId}`),
      ),
    [filteredMappings],
  );

  const mappedSubjects = useMemo(
    () =>
      activeSubjects
        .filter((subject) => mappedSubjectIds.has(subject.subjectId))
        .sort((first, second) => {
          if (subjectSort === "units") return first.units - second.units;
          return String(first[subjectSort]).localeCompare(String(second[subjectSort]));
        }),
    [activeSubjects, mappedSubjectIds, subjectSort],
  );

  const visibleSections = useMemo(
    () =>
      activeSections
        .filter((section) => mappedSectionIds.has(section.sectionId))
        .sort((first, second) => {
          const primary = String(first[sectionSort]).localeCompare(String(second[sectionSort]));

          if (primary !== 0) return primary;

          return first.sectionName.localeCompare(second.sectionName);
        }),
    [activeSections, mappedSectionIds, sectionSort],
  );

  const visibleGradeLevels = useMemo(
    () => [...new Set(visibleSections.map((section) => section.gradeLevel))].sort(),
    [visibleSections],
  );

  const savePendingChanges = useCallback(async () => {
    const changesToSave = Object.values(pendingChanges);

    if (changesToSave.length === 0 || isSaving) return;

    setIsSaving(true);
    setSaveError("");

    try {
      await Promise.all(
        changesToSave.map((change) => {
          if (!change.teacherId) {
            return removeLoadAssignment(
              schoolYear,
              term,
              change.subject.subjectId,
              change.section.sectionId,
            );
          }

          return saveLoadAssignment({
            schoolYear,
            term,
            gradeLevel: change.section.gradeLevel,
            strand: change.section.strand,
            subjectId: change.subject.subjectId,
            sectionId: change.section.sectionId,
            teacherId: change.teacherId,
            units: Number(change.subject.units || 0),
          });
        }),
      );

      setPendingChanges((currentChanges) => {
        const nextChanges = { ...currentChanges };
        changesToSave.forEach((change) => {
          if (nextChanges[change.key]?.teacherId === change.teacherId) {
            delete nextChanges[change.key];
          }
        });

        return nextChanges;
      });
    } catch (error) {
      console.error(error);
      setSaveError("Changes were not saved. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, pendingChanges, schoolYear, term]);

  useEffect(() => {
    if (!isOnline || pendingChangeList.length === 0 || isSaving || saveError) return;

    void savePendingChanges();
  }, [isOnline, isSaving, pendingChangeList.length, saveError, savePendingChanges]);

  function handleAssign(subject: Subject, section: Section, teacherId: string) {
    const key = `${section.sectionId}:${subject.subjectId}`;

    setPendingChanges((currentChanges) => ({
      ...currentChanges,
      [key]: {
        key,
        subject,
        section,
        teacherId,
      },
    }));
    setSaveError("");
  }

  function openPrintableReport(title: string, body: string) {
    const reportWindow = window.open("", "_blank");

    if (!reportWindow) return;

    reportWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body {
              color: #0f172a;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 11px;
              line-height: 1.35;
              margin: 0;
            }
            h1, h2, h3, p { margin: 0; }
            .page {
              min-height: 269mm;
              page-break-after: always;
            }
            .page:last-child { page-break-after: auto; }
            .report-title {
              border-bottom: 2px solid #0f172a;
              margin-bottom: 12px;
              padding-bottom: 8px;
            }
            .report-title h1 { font-size: 18px; }
            .muted { color: #64748b; }
            .meta {
              display: grid;
              gap: 6px;
              grid-template-columns: repeat(4, 1fr);
              margin: 12px 0;
            }
            .box {
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 8px;
            }
            .box-label {
              color: #64748b;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
            }
            .box-value {
              font-size: 13px;
              font-weight: 700;
              margin-top: 2px;
            }
            table {
              border-collapse: collapse;
              margin-top: 8px;
              width: 100%;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 6px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #e2e8f0;
              font-size: 10px;
              text-transform: uppercase;
            }
            .right { text-align: right; }
            .category-row td {
              background: #f8fafc;
              color: #475569;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
            }
            .unassigned { color: #b91c1c; font-weight: 700; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()" style="margin: 12px; padding: 8px 12px;">Print / Save as PDF</button>
          ${body}
          <script>
            window.addEventListener("load", () => setTimeout(() => window.print(), 250));
          </script>
        </body>
      </html>
    `);
    reportWindow.document.close();
  }

  function printSectionAssignmentsPdf() {
    const pages = visibleSections
      .map((section) => {
        const sectionMappings = filteredMappings.filter(
          (mapping) => mapping.sectionId === section.sectionId,
        );
        const sectionSubjectIds = new Set(sectionMappings.map((mapping) => mapping.subjectId));
        const sectionSubjects = mappedSubjects.filter((subject) =>
          sectionSubjectIds.has(subject.subjectId),
        );
        const totalUnits = sectionSubjects.reduce(
          (sum, subject) => sum + Number(subject.units || 0),
          0,
        );
        const assignedCount = sectionSubjects.filter((subject) =>
          effectiveAssignmentsByCell.has(`${section.sectionId}:${subject.subjectId}`),
        ).length;
        const subjectRows = subjectCategories
          .flatMap((category) => {
            const categorySubjects = sectionSubjects.filter(
              (subject) => subject.category === category,
            );

            if (categorySubjects.length === 0) return [];

            return [
              `<tr class="category-row"><td colspan="5">${escapeHtml(category)}</td></tr>`,
              ...categorySubjects.map((subject) => {
                const assignment = effectiveAssignmentsByCell.get(
                  `${section.sectionId}:${subject.subjectId}`,
                );
                const teacher = assignment ? teachersById.get(assignment.teacherId) : undefined;

                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(subject.subjectName)}</strong><br />
                      <span class="muted">${escapeHtml(subject.subjectCode)}</span>
                    </td>
                    <td>${escapeHtml(subject.category)}</td>
                    <td class="right">${escapeHtml(subject.units)}</td>
                    <td>${teacher ? escapeHtml(teacher.fullName) : '<span class="unassigned">Unassigned</span>'}</td>
                    <td>${teacher ? escapeHtml(teacher.specialization) : ""}</td>
                  </tr>
                `;
              }),
            ];
          })
          .join("");

        return `
          <section class="page">
            <div class="report-title">
              <h1>Section Subject-Teacher Assignments</h1>
              <p class="muted">School Year ${escapeHtml(schoolYear)} - ${escapeHtml(term)}</p>
            </div>
            <h2>${escapeHtml(section.sectionName)}</h2>
            <p class="muted">Grade ${escapeHtml(section.gradeLevel)} - ${escapeHtml(section.strand)}${section.room ? ` - Room ${escapeHtml(section.room)}` : ""}</p>
            <div class="meta">
              <div class="box"><div class="box-label">Subjects</div><div class="box-value">${escapeHtml(sectionSubjects.length)}</div></div>
              <div class="box"><div class="box-label">Assigned</div><div class="box-value">${escapeHtml(assignedCount)}</div></div>
              <div class="box"><div class="box-label">Unassigned</div><div class="box-value">${escapeHtml(sectionSubjects.length - assignedCount)}</div></div>
              <div class="box"><div class="box-label">Total Units</div><div class="box-value">${escapeHtml(totalUnits)}</div></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Category</th>
                  <th class="right">Units</th>
                  <th>Teacher</th>
                  <th>Specialization</th>
                </tr>
              </thead>
              <tbody>
                ${subjectRows || `<tr><td colspan="5">No mapped subjects for this section.</td></tr>`}
              </tbody>
            </table>
          </section>
        `;
      })
      .join("");

    openPrintableReport(`Section Assignments - ${schoolYear} - ${term}`, pages);
  }

  return (
    <section>
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSchoolYear(event.target.value)} value={schoolYear} />
            <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setTerm(event.target.value as AcademicTerm)} value={term}>
              {termOptions.map((termOption) => <option key={termOption} value={termOption}>{termOption}</option>)}
            </select>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={printSectionAssignmentsPdf}
              type="button"
            >
              <Printer size={16} />
              PDF Sections
            </button>
            {canEdit && (
              <button
                className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={pendingChangeList.length === 0 || isSaving}
                onClick={() => void savePendingChanges()}
                type="button"
              >
                {isSaving
                  ? "Saving..."
                  : pendingChangeList.length > 0
                    ? `Save Changes (${pendingChangeList.length})`
                    : "Saved"}
              </button>
            )}
          </div>
        }
        description="Assign teachers to subject-section cells. Changes are staged locally and saved when online."
        title="Load Assignment"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Mapped Sections</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{visibleSections.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Mapped Subjects</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{mappedSubjects.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Mapped Cells</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{filteredMappings.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Assigned Cells</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {
              effectiveAssignments.filter((assignment) =>
                mappedCellKeys.has(`${assignment.sectionId}:${assignment.subjectId}`),
              ).length
            }
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-semibold uppercase text-slate-500">
            Search
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Subject, section, teacher"
              value={searchTerm}
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Grade
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              onChange={(event) => setGradeFilter(event.target.value)}
              value={gradeFilter}
            >
              <option value="all">All grades</option>
              {gradeOptions.map((gradeLevel) => (
                <option key={gradeLevel} value={gradeLevel}>
                  Grade {gradeLevel}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Strand
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              onChange={(event) => setStrandFilter(event.target.value)}
              value={strandFilter}
            >
              <option value="all">All strands</option>
              {strandOptions.map((strand) => (
                <option key={strand} value={strand}>
                  {strand}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Category
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              onChange={(event) => setCategoryFilter(event.target.value as SubjectCategory | "all")}
              value={categoryFilter}
            >
              <option value="all">All categories</option>
              {subjectCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Sort Sections
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              onChange={(event) => setSectionSort(event.target.value as SectionSort)}
              value={sectionSort}
            >
              <option value="sectionName">Section name</option>
              <option value="gradeLevel">Grade level</option>
              <option value="strand">Strand</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Sort Subjects
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-900"
              onChange={(event) => setSubjectSort(event.target.value as SubjectSort)}
              value={subjectSort}
            >
              <option value="subjectName">Subject name</option>
              <option value="subjectCode">Subject code</option>
              <option value="units">Units</option>
            </select>
          </label>
        </div>
        {(pendingChangeList.length > 0 || saveError) && (
          <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            {saveError ||
              (isOnline
                ? `${pendingChangeList.length} change${pendingChangeList.length === 1 ? "" : "s"} ready to save.`
                : `${pendingChangeList.length} change${pendingChangeList.length === 1 ? "" : "s"} waiting for internet connection.`)}
          </div>
        )}
      </div>

      <div className="space-y-5">
        {visibleGradeLevels.length === 0 && (
          <LoadMatrix
            assignments={effectiveAssignments}
            canEdit={canEdit}
            mappings={[]}
            onAssign={handleAssign}
            sections={[]}
            subjects={[]}
            teachers={teachers.filter((teacher) => teacher.status === "active")}
          />
        )}
        {visibleGradeLevels.map((gradeLevel) => {
          const gradeSections = visibleSections.filter(
            (section) => section.gradeLevel === gradeLevel,
          );
          const gradeMappings = filteredMappings.filter(
            (mapping) => sectionsById.get(mapping.sectionId)?.gradeLevel === gradeLevel,
          );
          const gradeSubjectIds = new Set(
            gradeMappings.map((mapping) => mapping.subjectId),
          );
          const gradeSubjects = mappedSubjects.filter(
            (subject) =>
              subject.gradeLevel === gradeLevel && gradeSubjectIds.has(subject.subjectId),
          );

          return (
            <LoadMatrix
              assignments={effectiveAssignments}
              canEdit={canEdit}
              gradeLevel={gradeLevel}
              key={gradeLevel}
              mappings={gradeMappings}
              onAssign={handleAssign}
              sections={gradeSections}
              subjects={gradeSubjects}
              teachers={teachers.filter((teacher) => teacher.status === "active")}
            />
          );
        })}
      </div>
    </section>
  );
}
