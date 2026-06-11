import { FileText, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataColumn } from "../components/common/DataTable";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { subscribeAncillaryLoads } from "../services/ancillaryLoadService";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import { subscribeTeachers } from "../services/teacherService";
import type { AcademicTerm, AncillaryLoad, LoadAssignment, Section, Subject, Teacher } from "../types/loading";
import { defaultSchoolYear, termOptions } from "../types/loading";
import { getLoadStatus } from "../utils/statusRules";

type TeacherLoadRow = {
  teacher: Teacher;
  termLoads: Record<AcademicTerm, number>;
  prepCount: number;
  teachingLoad: number;
  ancillaryUnits: number;
  ancillaryLoad: number;
  totalLoad: number;
};

function TermLoadCell({ load }: { load: number }) {
  const status = getLoadStatus(load);

  return (
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-slate-950">{load} units</span>
      <StatusBadge
        label={status}
        tone={
          status === "Over Teaching Load"
            ? "red"
            : status === "Under Teaching Load"
              ? "amber"
              : status === "Full Teaching Load"
                ? "green"
                : "blue"
        }
      />
    </div>
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function TeacherLoadsPage() {
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [ancillaryLoads, setAncillaryLoads] = useState<AncillaryLoad[]>([]);

  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeSubjects(setSubjects), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeLoadAssignments(setAssignments), []);
  useEffect(() => subscribeAncillaryLoads(setAncillaryLoads), []);

  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.subjectId, subject])),
    [subjects],
  );

  const sectionsById = useMemo(
    () => new Map(sections.map((section) => [section.sectionId, section])),
    [sections],
  );

  const rows = useMemo<TeacherLoadRow[]>(
    () =>
      teachers
        .filter((teacher) => teacher.status === "active")
        .map((teacher) => {
          const teacherAssignments = assignments.filter(
            (assignment) =>
              assignment.teacherId === teacher.teacherId &&
              assignment.schoolYear === schoolYear,
          );
          const teacherAncillaryLoads = ancillaryLoads.filter(
            (load) =>
              load.teacherId === teacher.teacherId &&
              load.schoolYear === schoolYear,
          );
          const termLoads = termOptions.reduce(
            (loads, term) => {
              loads[term] = teacherAssignments
                .filter(
                  (assignment) =>
                    assignment.term === term,
                )
                .reduce((sum, assignment) => sum + Number(assignment.units || 0), 0);

              return loads;
            },
            {} as Record<AcademicTerm, number>,
          );
          const teachingLoad = termOptions.reduce((sum, term) => sum + termLoads[term], 0);
          const ancillaryUnits = teacherAncillaryLoads.reduce(
            (sum, load) => sum + Number(load.units || 0),
            0,
          );
          const ancillaryLoad = ancillaryUnits;

          return {
            teacher,
            termLoads,
            prepCount: new Set(
              teacherAssignments.map((assignment) => assignment.subjectId),
            ).size,
            teachingLoad,
            ancillaryUnits,
            ancillaryLoad,
            totalLoad: teachingLoad + ancillaryLoad,
          };
        })
        .sort((first, second) => first.teacher.fullName.localeCompare(second.teacher.fullName)),
    [ancillaryLoads, assignments, schoolYear, teachers],
  );

  const selectedRow = useMemo(
    () => rows.find((row) => row.teacher.teacherId === selectedTeacherId),
    [rows, selectedTeacherId],
  );

  const selectedAssignments = useMemo(
    () =>
      assignments
        .filter(
          (assignment) =>
            assignment.teacherId === selectedTeacherId &&
            assignment.schoolYear === schoolYear,
        )
        .sort((first, second) => {
          const termOrder =
            termOptions.indexOf(first.term as AcademicTerm) -
            termOptions.indexOf(second.term as AcademicTerm);

          if (termOrder !== 0) return termOrder;

          const firstSection = sectionsById.get(first.sectionId)?.sectionName ?? "";
          const secondSection = sectionsById.get(second.sectionId)?.sectionName ?? "";
          const sectionOrder = firstSection.localeCompare(secondSection);

          if (sectionOrder !== 0) return sectionOrder;

          const firstSubject = subjectsById.get(first.subjectId)?.subjectName ?? "";
          const secondSubject = subjectsById.get(second.subjectId)?.subjectName ?? "";

          return firstSubject.localeCompare(secondSubject);
        }),
    [assignments, schoolYear, sectionsById, selectedTeacherId, subjectsById],
  );

  const selectedAncillaryLoads = useMemo(
    () =>
      ancillaryLoads
        .filter(
          (load) =>
            load.teacherId === selectedTeacherId &&
            load.schoolYear === schoolYear,
        )
        .sort((first, second) => first.ancillary.localeCompare(second.ancillary)),
    [ancillaryLoads, schoolYear, selectedTeacherId],
  );

  function getTeacherAssignments(teacherId: string) {
    return assignments
      .filter(
        (assignment) =>
          assignment.teacherId === teacherId &&
          assignment.schoolYear === schoolYear,
      )
      .sort((first, second) => {
        const termOrder =
          termOptions.indexOf(first.term as AcademicTerm) -
          termOptions.indexOf(second.term as AcademicTerm);

        if (termOrder !== 0) return termOrder;

        const firstSection = sectionsById.get(first.sectionId)?.sectionName ?? "";
        const secondSection = sectionsById.get(second.sectionId)?.sectionName ?? "";
        const sectionOrder = firstSection.localeCompare(secondSection);

        if (sectionOrder !== 0) return sectionOrder;

        const firstSubject = subjectsById.get(first.subjectId)?.subjectName ?? "";
        const secondSubject = subjectsById.get(second.subjectId)?.subjectName ?? "";

        return firstSubject.localeCompare(secondSubject);
      });
  }

  function getTeacherAncillaryLoads(teacherId: string) {
    return ancillaryLoads
      .filter(
        (load) =>
          load.teacherId === teacherId &&
          load.schoolYear === schoolYear,
      )
      .sort((first, second) => first.ancillary.localeCompare(second.ancillary));
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
            .section-title {
              font-size: 13px;
              margin-top: 14px;
            }
            .summary-table th, .summary-table td { font-size: 10px; }
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

  function printDetailedLoadingPdf() {
    const pages = rows
      .map((row) => {
        const teacherAssignments = getTeacherAssignments(row.teacher.teacherId);
        const teacherAncillaryLoads = getTeacherAncillaryLoads(row.teacher.teacherId);
        const assignmentRows = teacherAssignments.length
          ? teacherAssignments
              .map((assignment) => {
                const subject = subjectsById.get(assignment.subjectId);
                const section = sectionsById.get(assignment.sectionId);

                return `
                  <tr>
                    <td>${escapeHtml(assignment.term)}</td>
                    <td>
                      <strong>${escapeHtml(subject?.subjectName ?? assignment.subjectId)}</strong><br />
                      <span class="muted">${escapeHtml(subject?.subjectCode ?? "")}</span>
                    </td>
                    <td>${escapeHtml(section?.sectionName ?? assignment.sectionId)}</td>
                    <td>${escapeHtml(`Grade ${section?.gradeLevel ?? assignment.gradeLevel} - ${section?.strand ?? assignment.strand}`)}</td>
                    <td class="right">${escapeHtml(assignment.units)}</td>
                  </tr>
                `;
              })
              .join("")
          : `<tr><td colspan="5">No assigned subjects for ${escapeHtml(schoolYear)}.</td></tr>`;
        const ancillaryRows = teacherAncillaryLoads.length
          ? teacherAncillaryLoads
              .map(
                (load) => `
                  <tr>
                    <td>${escapeHtml(load.ancillary)}</td>
                    <td class="right">${escapeHtml(load.units)}</td>
                    <td class="right">${escapeHtml(Number(load.units || 0))}</td>
                  </tr>
                `,
              )
              .join("")
          : `<tr><td colspan="3">No ancilliary loads for ${escapeHtml(schoolYear)}.</td></tr>`;

        return `
          <section class="page">
            <div class="report-title">
              <h1>Teacher Loading</h1>
              <p class="muted">School Year ${escapeHtml(schoolYear)}</p>
            </div>
            <h2>${escapeHtml(row.teacher.fullName)}</h2>
            <p class="muted">${escapeHtml(row.teacher.position)} - ${escapeHtml(row.teacher.specialization)}</p>
            <div class="meta">
              <div class="box"><div class="box-label">Teaching Load</div><div class="box-value">${escapeHtml(row.teachingLoad)} units</div></div>
              <div class="box"><div class="box-label">Prep</div><div class="box-value">${escapeHtml(row.prepCount)}</div></div>
              <div class="box"><div class="box-label">Ancilliary Load</div><div class="box-value">${escapeHtml(row.ancillaryLoad)} units</div></div>
              <div class="box"><div class="box-label">Total Load</div><div class="box-value">${escapeHtml(row.totalLoad)} units</div></div>
            </div>
            <h3 class="section-title">Assigned Subjects</h3>
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Subject</th>
                  <th>Section</th>
                  <th>Grade / Strand</th>
                  <th class="right">Units</th>
                </tr>
              </thead>
              <tbody>${assignmentRows}</tbody>
            </table>
            <h3 class="section-title">Ancilliary Loads</h3>
            <table>
              <thead>
                <tr>
                  <th>Ancilliary</th>
                  <th class="right">Units</th>
                  <th class="right">Added Load</th>
                </tr>
              </thead>
              <tbody>${ancillaryRows}</tbody>
            </table>
          </section>
        `;
      })
      .join("");

    openPrintableReport(`Teacher Loading - ${schoolYear}`, pages);
  }

  function printSummaryLoadingPdf() {
    const summaryRows = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.teacher.fullName)}</td>
            <td>${escapeHtml(row.teacher.position)}</td>
            <td>${escapeHtml(row.teacher.specialization)}</td>
            <td class="right">${escapeHtml(row.prepCount)}</td>
            <td class="right">${escapeHtml(row.termLoads["1st Term"])}</td>
            <td class="right">${escapeHtml(row.termLoads["2nd Term"])}</td>
            <td class="right">${escapeHtml(row.termLoads["3rd Term"])}</td>
            <td class="right">${escapeHtml(row.teachingLoad)}</td>
            <td class="right">${escapeHtml(row.ancillaryLoad)}</td>
            <td class="right">${escapeHtml(row.totalLoad)}</td>
          </tr>
        `,
      )
      .join("");
    const body = `
      <section class="page">
        <div class="report-title">
          <h1>Loading Summary</h1>
          <p class="muted">School Year ${escapeHtml(schoolYear)}</p>
        </div>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Position</th>
              <th>Specialization</th>
              <th class="right">Prep</th>
              <th class="right">1st</th>
              <th class="right">2nd</th>
              <th class="right">3rd</th>
              <th class="right">Teaching</th>
              <th class="right">Ancilliary</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </section>
    `;

    openPrintableReport(`Loading Summary - ${schoolYear}`, body);
  }

  const columns: DataColumn<TeacherLoadRow>[] = [
    {
      header: "Teacher",
      render: (row) => (
        <div>
          <button
            className={[
              "text-left font-semibold text-blue-700 hover:text-blue-900 hover:underline",
              selectedTeacherId === row.teacher.teacherId ? "underline" : "",
            ].join(" ")}
            onClick={() => setSelectedTeacherId(row.teacher.teacherId)}
            type="button"
          >
            {row.teacher.fullName}
          </button>
          <p className="text-xs text-slate-500">{row.teacher.position}</p>
        </div>
      ),
    },
    { header: "Specialization", render: (row) => row.teacher.specialization },
    { header: "Max / Term", render: (row) => `${row.teacher.maxLoad} units` },
    {
      header: "Prep",
      render: (row) => <span className="font-semibold text-slate-950">{row.prepCount}</span>,
    },
    {
      header: "Ancilliary",
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.ancillaryLoad} units</p>
        </div>
      ),
    },
    { header: "1st Term", render: (row) => <TermLoadCell load={row.termLoads["1st Term"]} /> },
    { header: "2nd Term", render: (row) => <TermLoadCell load={row.termLoads["2nd Term"]} /> },
    { header: "3rd Term", render: (row) => <TermLoadCell load={row.termLoads["3rd Term"]} /> },
    {
      header: "Total Current Load",
      render: (row) => <span className="font-bold text-slate-950">{row.totalLoad} units</span>,
    },
  ];

  return (
    <section>
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              onChange={(event) => setSchoolYear(event.target.value)}
              value={schoolYear}
            />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={printDetailedLoadingPdf}
              type="button"
            >
              <Printer size={16} />
              PDF Per Teacher
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={printSummaryLoadingPdf}
              type="button"
            >
              <FileText size={16} />
              PDF Summary
            </button>
          </div>
        }
        description="Shows teacher load per term plus the combined current load for the selected school year."
        title="Teacher Loads"
      />
      <DataTable columns={columns} data={rows} getKey={(row) => row.teacher.teacherId} />

      {selectedRow && (
        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                {selectedRow.teacher.fullName}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {selectedRow.teacher.position} - {selectedRow.teacher.specialization}
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
              {selectedRow.totalLoad} total units - {selectedRow.prepCount} prep - {selectedRow.ancillaryLoad} ancilliary units
            </span>
          </div>

          {selectedAssignments.length === 0 ? (
            <div className="p-5 text-sm text-slate-600">
              No teaching loads assigned for {schoolYear}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Term</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Section</th>
                    <th className="px-4 py-3 font-semibold">Grade / Strand</th>
                    <th className="px-4 py-3 text-right font-semibold">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {selectedAssignments.map((assignment) => {
                    const subject = subjectsById.get(assignment.subjectId);
                    const section = sectionsById.get(assignment.sectionId);

                    return (
                      <tr className="hover:bg-slate-50/70" key={assignment.assignmentId}>
                        <td className="px-4 py-3 align-middle">{assignment.term}</td>
                        <td className="px-4 py-3 align-middle">
                          <p className="font-semibold text-slate-950">
                            {subject?.subjectName ?? assignment.subjectId}
                          </p>
                          <p className="text-xs text-slate-500">
                            {subject?.subjectCode ?? "No subject code"}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {section?.sectionName ?? assignment.sectionId}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          Grade {section?.gradeLevel ?? assignment.gradeLevel} -{" "}
                          {section?.strand ?? assignment.strand}
                        </td>
                        <td className="px-4 py-3 text-right align-middle font-semibold text-slate-950">
                          {assignment.units} units
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">Ancilliary Loads</h3>
            {selectedAncillaryLoads.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                No ancilliary loads added for {schoolYear}.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Ancilliary</th>
                      <th className="px-4 py-3 text-right font-semibold">Units</th>
                      <th className="px-4 py-3 text-right font-semibold">Added Load</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {selectedAncillaryLoads.map((load) => (
                      <tr className="hover:bg-slate-50/70" key={load.ancillaryLoadId}>
                        <td className="px-4 py-3 align-middle font-semibold text-slate-950">
                          {load.ancillary}
                        </td>
                        <td className="px-4 py-3 text-right align-middle">
                          {load.units}
                        </td>
                        <td className="px-4 py-3 text-right align-middle font-semibold text-slate-950">
                          {Number(load.units || 0)} units
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
