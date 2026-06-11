import { BookOpenCheck, CheckSquare, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { useAuth } from "../providers/AuthProvider";
import {
  createCurriculumMapping,
  deleteCurriculumMapping,
  subscribeCurriculumMappings,
} from "../services/curriculumService";
import { subscribeSections } from "../services/sectionService";
import { subscribeSubjects } from "../services/subjectService";
import type { AcademicTerm, CurriculumMapping, Section, Subject } from "../types/loading";
import { defaultSchoolYear, defaultTerm, subjectCategories, termOptions } from "../types/loading";

export function CurriculumMappingPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear);
  const [term, setTerm] = useState(defaultTerm);
  const [mappings, setMappings] = useState<CurriculumMapping[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => subscribeCurriculumMappings(setMappings), []);
  useEffect(() => subscribeSections(setSections), []);
  useEffect(() => subscribeSubjects(setSubjects), []);

  const activeSections = useMemo(
    () =>
      sections
        .filter((section) => section.status === "active" && section.schoolYear === schoolYear)
        .sort((first, second) => first.sectionName.localeCompare(second.sectionName)),
    [schoolYear, sections],
  );

  const activeSubjects = useMemo(
    () =>
      subjects
        .filter((subject) => subject.status === "active" && subject.term === term)
        .sort((first, second) => first.subjectName.localeCompare(second.subjectName)),
    [subjects, term],
  );

  const subjectsById = useMemo(
    () => new Map(activeSubjects.map((subject) => [subject.subjectId, subject])),
    [activeSubjects],
  );

  const sectionsById = useMemo(
    () => new Map(activeSections.map((section) => [section.sectionId, section])),
    [activeSections],
  );

  const visibleMappings = useMemo(
    () =>
      mappings.filter(
        (mapping) =>
          mapping.schoolYear === schoolYear &&
          mapping.term === term &&
          Boolean(mapping.sectionId) &&
          sectionsById.get(mapping.sectionId)?.gradeLevel ===
            subjectsById.get(mapping.subjectId)?.gradeLevel,
      ),
    [mappings, schoolYear, sectionsById, subjectsById, term],
  );

  const mappingsBySectionSubject = useMemo(
    () =>
      new Map(
        visibleMappings.map((mapping) => [
          `${mapping.sectionId}:${mapping.subjectId}`,
          mapping,
        ]),
      ),
    [visibleMappings],
  );

  async function toggleSubject(section: Section, subject: Subject) {
    if (section.gradeLevel !== subject.gradeLevel) return;

    const mapping = mappingsBySectionSubject.get(`${section.sectionId}:${subject.subjectId}`);

    if (mapping) {
      await deleteCurriculumMapping(mapping.mappingId);
      return;
    }

    await createCurriculumMapping({
      schoolYear,
      gradeLevel: section.gradeLevel,
      strand: section.strand,
      term,
      sectionId: section.sectionId,
      subjectId: subject.subjectId,
    });
  }

  function isMapped(sectionId: string, subjectId: string) {
    return mappingsBySectionSubject.has(`${sectionId}:${subjectId}`);
  }

  function sectionMappedCount(sectionId: string) {
    return visibleMappings.filter((mapping) => mapping.sectionId === sectionId).length;
  }

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
            <select
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              onChange={(event) => setTerm(event.target.value as AcademicTerm)}
              value={term}
            >
              {termOptions.map((termOption) => (
                <option key={termOption} value={termOption}>
                  {termOption}
                </option>
              ))}
            </select>
          </div>
        }
        description="Choose the subjects handled by each section. These selections become the basis for Load Assignment."
        title="Curriculum Mapping"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Sections</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{activeSections.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Available Subjects</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{activeSubjects.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Mapped Loads</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{visibleMappings.length}</p>
        </div>
      </div>

      <div className="space-y-4">
        {activeSections.map((section) => (
          <div
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            key={section.sectionId}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">{section.sectionName}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Grade {section.gradeLevel} - {section.strand}
                  {section.room ? ` - Room ${section.room}` : ""}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                <BookOpenCheck size={14} />
                {sectionMappedCount(section.sectionId)} subjects
              </span>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {subjectCategories.map((category) => {
                const categorySubjects = activeSubjects.filter(
                  (subject) =>
                    subject.category === category && subject.gradeLevel === section.gradeLevel,
                );

                if (categorySubjects.length === 0) return null;

                return (
                  <div className="rounded-md border border-slate-200" key={category}>
                    <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase text-slate-500">
                      {category}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {categorySubjects.map((subject) => {
                        const checked = isMapped(section.sectionId, subject.subjectId);

                        return (
                          <button
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
                              checked ? "bg-blue-50 text-blue-950" : "hover:bg-slate-50"
                            }`}
                            disabled={!canEdit}
                            key={subject.subjectId}
                            onClick={() => toggleSubject(section, subject)}
                            type="button"
                          >
                            {checked ? (
                              <CheckSquare className="shrink-0 text-blue-600" size={18} />
                            ) : (
                              <Square className="shrink-0 text-slate-400" size={18} />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-slate-950">
                                {subject.subjectName}
                              </span>
                              <span className="block text-xs text-slate-500">
                                {subject.subjectCode} - {subject.units} units
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {activeSections.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No active sections found for {schoolYear}.
          </div>
        )}
      </div>
    </section>
  );
}
