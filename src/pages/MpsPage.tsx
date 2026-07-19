import { BarChart3, CheckCircle2, ClipboardList, Pencil, Plus, Save, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { SummaryCard } from "../components/common/SummaryCard";
import { useAuth } from "../providers/AuthProvider";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeCollection } from "../services/firestoreCrud";
import {
  createMpsRequest,
  deleteAllMpsRecords,
  deleteMpsRequest,
  subscribeMpsRequests,
  subscribeMpsSubmissions,
  updateMpsRequest,
  upsertMpsSubmission,
} from "../services/mpsService";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import { subscribeTeachers } from "../services/teacherService";
import type {
  AcademicSettings,
  AcademicTerm,
  LoadAssignment,
  MpsRequest,
  MpsRequestStatus,
  MpsSubmission,
  Section,
  Subject,
  Teacher,
} from "../types/loading";
import { defaultTerm, termOptions } from "../types/loading";

type RequestForm = {
  title: string;
  schoolYear: string;
  term: AcademicTerm;
  testName: string;
  dueDate: string;
  instructions: string;
};

type SubmissionDraft = {
  mps: string;
  leastMasteredCompetency: string;
  plannedIntervention: string;
};

type TeacherClassRow = {
  assignment: LoadAssignment;
  subject: Subject;
  section: Section;
};

const emptyRequestForm: RequestForm = {
  title: "MPS Submission",
  schoolYear: defaultAcademicSettings.currentSchoolYear,
  term: defaultAcademicSettings.currentTerm,
  testName: "",
  dueDate: "",
  instructions: "",
};

const deleteAllPassword = "dxuxihnfwcls";

function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getSubmissionKey(requestId: string, teacherId: string, subjectId: string, sectionId: string) {
  return `${requestId}:${teacherId}:${subjectId}:${sectionId}`;
}

function getAverage(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function getUniqueClassCount(assignments: LoadAssignment[]) {
  return new Set(assignments.map((assignment) => `${assignment.subjectId}:${assignment.sectionId}`)).size;
}

export function MpsPage() {
  const { profile } = useAuth();
  const [academicSettings, setAcademicSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [selectedSchoolYear, setSelectedSchoolYear] = useState(defaultAcademicSettings.currentSchoolYear);
  const [selectedTerm, setSelectedTerm] = useState<AcademicTerm>(defaultAcademicSettings.currentTerm);
  const [requests, setRequests] = useState<MpsRequest[]>([]);
  const [submissions, setSubmissions] = useState<MpsSubmission[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm);
  const [editingRequestId, setEditingRequestId] = useState("");
  const [isRequestDetailsOpen, setIsRequestDetailsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, SubmissionDraft>>({});
  const [gradeFilter, setGradeFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isTeacherSubmitter = profile?.role === "teacher" || profile?.role === "master_teacher";
  const submitterTeacherId = isTeacherSubmitter ? profile?.assignedTeacherId ?? "" : "";
  const scopedTeacherId = profile?.role === "teacher" ? submitterTeacherId : "";
  const isSuperAdmin = profile?.role === "super_admin";
  const isReviewer = profile?.role === "principal" || profile?.role === "master_teacher" || profile?.role === "super_admin";

  useEffect(() => subscribeAcademicSettings(setAcademicSettings), []);
  useEffect(() => subscribeLoadAssignments(setAssignments), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeCollection<Section>("sections", setSections), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeMpsRequests(setRequests), []);
  useEffect(() => subscribeMpsSubmissions(setSubmissions, scopedTeacherId || undefined), [scopedTeacherId]);

  useEffect(() => {
    setSelectedSchoolYear(academicSettings.currentSchoolYear);
    setSelectedTerm(academicSettings.currentTerm);
    setRequestForm((current) => ({
      ...current,
      schoolYear: academicSettings.currentSchoolYear,
      term: academicSettings.currentTerm,
    }));
  }, [academicSettings.currentSchoolYear, academicSettings.currentTerm]);

  const subjectsById = useMemo(() => new Map(subjects.map((subject) => [subject.subjectId, subject])), [subjects]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]);
  const teachersById = useMemo(() => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])), [teachers]);

  const selectedRequests = useMemo(
    () => requests.filter((request) => request.schoolYear === selectedSchoolYear && request.term === selectedTerm),
    [requests, selectedSchoolYear, selectedTerm],
  );

  const activeRequests = useMemo(
    () => selectedRequests.filter((request) => request.status === "active"),
    [selectedRequests],
  );
  const hasMpsRecords = requests.length > 0 || submissions.length > 0;

  const submissionsByKey = useMemo(
    () =>
      new Map(
        submissions.map((submission) => [
          getSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId, submission.sectionId),
          submission,
        ]),
      ),
    [submissions],
  );

  const teacherClasses = useMemo<TeacherClassRow[]>(() => {
    if (!submitterTeacherId) return [];

    return assignments
      .filter((assignment) => assignment.teacherId === submitterTeacherId && assignment.schoolYear === selectedSchoolYear && assignment.term === selectedTerm)
      .map((assignment) => ({
        assignment,
        subject: subjectsById.get(assignment.subjectId),
        section: sectionsById.get(assignment.sectionId),
      }))
      .filter((row): row is TeacherClassRow => Boolean(row.subject && row.section))
      .sort((first, second) => `${first.section.sectionName} ${first.subject.subjectName}`.localeCompare(`${second.section.sectionName} ${second.subject.subjectName}`));
  }, [assignments, submitterTeacherId, sectionsById, selectedSchoolYear, selectedTerm, subjectsById]);

  const teacherRows = useMemo(
    () =>
      activeRequests.flatMap((request) =>
        teacherClasses.map((classRow) => ({
          request,
            ...classRow,
            submission: submissionsByKey.get(
            getSubmissionKey(request.requestId, submitterTeacherId, classRow.subject.subjectId, classRow.section.sectionId),
          ),
        })),
      ),
    [activeRequests, submitterTeacherId, submissionsByKey, teacherClasses],
  );

  const filteredSubmissions = useMemo(
    () =>
      submissions
        .filter((submission) => submission.schoolYear === selectedSchoolYear && submission.term === selectedTerm)
        .filter((submission) => gradeFilter === "all" || submission.gradeLevel === gradeFilter)
        .filter((submission) => subjectFilter === "all" || submission.subjectId === subjectFilter),
    [gradeFilter, selectedSchoolYear, selectedTerm, subjectFilter, submissions],
  );

  const gradeOptions = useMemo(
    () => Array.from(new Set(submissions.filter((submission) => submission.schoolYear === selectedSchoolYear && submission.term === selectedTerm).map((submission) => submission.gradeLevel))).sort(),
    [selectedSchoolYear, selectedTerm, submissions],
  );

  const subjectOptions = useMemo(() => {
    const options = new Map<string, string>();
    submissions
      .filter((submission) => submission.schoolYear === selectedSchoolYear && submission.term === selectedTerm)
      .forEach((submission) => options.set(submission.subjectId, submission.subjectName));
    return Array.from(options.entries()).sort((first, second) => first[1].localeCompare(second[1]));
  }, [selectedSchoolYear, selectedTerm, submissions]);

  const subjectAverages = useMemo(() => {
    const grouped = new Map<string, MpsSubmission[]>();
    const expectedClassCounts = new Map<string, number>();

    assignments
      .filter((assignment) => assignment.schoolYear === selectedSchoolYear && assignment.term === selectedTerm)
      .filter((assignment) => gradeFilter === "all" || assignment.gradeLevel === gradeFilter)
      .filter((assignment) => subjectFilter === "all" || assignment.subjectId === subjectFilter)
      .forEach((assignment) => {
        expectedClassCounts.set(
          assignment.subjectId,
          getUniqueClassCount(
            assignments.filter(
              (item) =>
                item.schoolYear === selectedSchoolYear &&
                item.term === selectedTerm &&
                item.subjectId === assignment.subjectId &&
                (gradeFilter === "all" || item.gradeLevel === gradeFilter),
            ),
          ),
        );
      });

    filteredSubmissions.forEach((submission) => {
      grouped.set(submission.subjectId, [...(grouped.get(submission.subjectId) ?? []), submission]);
    });

    return Array.from(grouped.values())
      .map((records) => ({
        subjectId: records[0].subjectId,
        subjectName: records[0].subjectName,
        gradeLevels: Array.from(new Set(records.map((record) => record.gradeLevel))).join(", "),
        classCount: records.length,
        expectedClassCount: expectedClassCounts.get(records[0].subjectId) ?? records.length,
        averageMps: getAverage(records.map((record) => Number(record.mps || 0))),
      }))
      .sort((first, second) => first.subjectName.localeCompare(second.subjectName));
  }, [assignments, filteredSubmissions, gradeFilter, selectedSchoolYear, selectedTerm, subjectFilter]);

  const summary = useMemo(
    () => ({
      requests: selectedRequests.length,
      activeRequests: activeRequests.length,
      submissions: filteredSubmissions.length,
      averageMps: getAverage(filteredSubmissions.map((submission) => Number(submission.mps || 0))),
    }),
    [activeRequests.length, filteredSubmissions, selectedRequests.length],
  );

  function updateDraft(key: string, submission: MpsSubmission | undefined, updates: Partial<SubmissionDraft>) {
    setDrafts((current) => {
      const draft = current[key] ?? {
        mps: submission ? String(submission.mps) : "",
        leastMasteredCompetency: submission?.leastMasteredCompetency ?? "",
        plannedIntervention: submission?.plannedIntervention ?? "",
      };

      return {
        ...current,
        [key]: {
          ...draft,
          ...updates,
        },
      };
    });
  }

  function getDraft(key: string, submission?: MpsSubmission) {
    return drafts[key] ?? {
      mps: submission ? String(submission.mps) : "",
      leastMasteredCompetency: submission?.leastMasteredCompetency ?? "",
      plannedIntervention: submission?.plannedIntervention ?? "",
    };
  }

  async function saveRequest() {
    if (!profile || !isReviewer) return;
    if (!requestForm.testName.trim()) {
      setError("Enter the test name for the MPS request.");
      return;
    }

    setSaving("request");
    setMessage("");
    setError("");

    try {
      if (editingRequestId) {
        await updateMpsRequest(editingRequestId, {
          title: requestForm.title,
          schoolYear: selectedSchoolYear,
          term: selectedTerm,
          testName: requestForm.testName,
          dueDate: requestForm.dueDate,
          instructions: requestForm.instructions,
        });
        setMessage("MPS request updated.");
      } else {
        await createMpsRequest({
          ...requestForm,
          schoolYear: selectedSchoolYear,
          term: selectedTerm,
          status: "active",
          createdBy: profile.userId,
          creatorName: profile.fullName,
        });
        setMessage("MPS request created.");
      }
      setRequestForm({ ...emptyRequestForm, schoolYear: selectedSchoolYear, term: selectedTerm });
      setEditingRequestId("");
      setIsRequestDetailsOpen(false);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : editingRequestId ? "Unable to update MPS request." : "Unable to create MPS request.");
    } finally {
      setSaving("");
    }
  }

  function editRequest(request: MpsRequest) {
    setEditingRequestId(request.requestId);
    setSelectedSchoolYear(request.schoolYear);
    setSelectedTerm(request.term);
    setRequestForm({
      title: request.title,
      schoolYear: request.schoolYear,
      term: request.term,
      testName: request.testName,
      dueDate: request.dueDate,
      instructions: request.instructions ?? "",
    });
    setIsRequestDetailsOpen(true);
    setMessage("");
    setError("");
  }

  function cancelEditRequest() {
    setEditingRequestId("");
    setRequestForm({ ...emptyRequestForm, schoolYear: selectedSchoolYear, term: selectedTerm });
    setIsRequestDetailsOpen(false);
  }

  async function setRequestStatus(request: MpsRequest, status: MpsRequestStatus) {
    if (!isReviewer) return;
    setSaving(request.requestId);
    setMessage("");
    setError("");

    try {
      await updateMpsRequest(request.requestId, { status });
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to update MPS request.");
    } finally {
      setSaving("");
    }
  }

  async function deleteRequest(request: MpsRequest) {
    if (!isSuperAdmin) return;
    const confirmed = window.confirm(`Delete "${request.testName}" and all MPS submissions for this request? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(request.requestId);
    setMessage("");
    setError("");

    try {
      const deletedSubmissionCount = await deleteMpsRequest(request.requestId);
      if (editingRequestId === request.requestId) cancelEditRequest();
      setMessage(`Deleted MPS request and ${deletedSubmissionCount} submission${deletedSubmissionCount === 1 ? "" : "s"}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete MPS request.");
    } finally {
      setSaving("");
    }
  }

  async function deleteAllRecords() {
    if (!isSuperAdmin) return;
    const password = window.prompt("Enter the Super Admin delete password to delete all MPS records.");
    if (password === null) return;

    if (password !== deleteAllPassword) {
      setError("Incorrect password. MPS records were not deleted.");
      setMessage("");
      return;
    }

    const confirmed = window.confirm("Delete all MPS requests and submissions permanently? This cannot be undone.");
    if (!confirmed) return;

    setSaving("delete-all");
    setMessage("");
    setError("");

    try {
      const { requestCount, submissionCount } = await deleteAllMpsRecords();
      setEditingRequestId("");
      setRequestForm({ ...emptyRequestForm, schoolYear: selectedSchoolYear, term: selectedTerm });
      setMessage(
        `Deleted ${requestCount} MPS request${requestCount === 1 ? "" : "s"} and ${submissionCount} submission${submissionCount === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete MPS records.");
    } finally {
      setSaving("");
    }
  }

  async function submitMps(request: MpsRequest, classRow: TeacherClassRow, submission?: MpsSubmission) {
    if (!profile || !submitterTeacherId) {
      setError("Your user account must be linked to a teacher record before submitting MPS.");
      return;
    }

    const key = getSubmissionKey(request.requestId, submitterTeacherId, classRow.subject.subjectId, classRow.section.sectionId);
    const draft = getDraft(key, submission);
    const mpsValue = Number(draft.mps);

    if (!Number.isFinite(mpsValue) || mpsValue < 0 || mpsValue > 100) {
      setError("Enter an MPS from 0 to 100.");
      return;
    }

    if (!draft.leastMasteredCompetency.trim()) {
      setError("Enter the least mastered competency.");
      return;
    }

    setSaving(key);
    setMessage("");
    setError("");

    try {
      await upsertMpsSubmission({
        submissionId: submission?.submissionId,
        requestId: request.requestId,
        schoolYear: request.schoolYear,
        term: request.term,
        teacherId: submitterTeacherId,
        teacherName: teachersById.get(submitterTeacherId)?.fullName ?? profile.fullName,
        subjectId: classRow.subject.subjectId,
        subjectName: classRow.subject.subjectName,
        sectionId: classRow.section.sectionId,
        sectionName: classRow.section.sectionName,
        gradeLevel: classRow.section.gradeLevel,
        strand: classRow.section.strand,
        mps: mpsValue,
        leastMasteredCompetency: draft.leastMasteredCompetency.trim(),
        plannedIntervention: draft.plannedIntervention.trim(),
        submittedBy: profile.userId,
      });
      setMessage("MPS submitted.");
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to submit MPS.");
    } finally {
      setSaving("");
    }
  }

  return (
    <section>
      <PageHeader
        description="Submit and review Mean Percentage Score by class, subject, and assessment."
        title="MPS"
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          onChange={(event) => setSelectedSchoolYear(event.target.value)}
          value={selectedSchoolYear}
        >
          {Array.from(new Set([academicSettings.currentSchoolYear, ...requests.map((request) => request.schoolYear)])).map((schoolYear) => (
            <option key={schoolYear} value={schoolYear}>{schoolYear}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          onChange={(event) => setSelectedTerm(event.target.value as AcademicTerm)}
          value={selectedTerm}
        >
          {termOptions.map((term) => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>
        {isSuperAdmin && (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            disabled={saving === "delete-all" || !hasMpsRecords}
            onClick={() => void deleteAllRecords()}
            type="button"
          >
            <Trash2 size={16} /> {saving === "delete-all" ? "Deleting..." : "Delete All"}
          </button>
        )}
      </div>

      {(message || error) && (
        <p className={`mb-5 rounded-md px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </p>
      )}

      {isReviewer && (
        <>
          <div className="mb-6 flex justify-end">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90"
              onClick={() => {
                setEditingRequestId("");
                setRequestForm({ ...emptyRequestForm, schoolYear: selectedSchoolYear, term: selectedTerm });
                setIsRequestDetailsOpen(true);
              }}
              type="button"
            >
              <Plus size={16} /> Create Request
            </button>
          </div>

          {isRequestDetailsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
              <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-950">{editingRequestId ? "Edit MPS Request" : "Request Details"}</h2>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                    onClick={cancelEditRequest}
                    type="button"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Title</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, title: event.target.value })} value={requestForm.title} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Test Name</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, testName: event.target.value })} placeholder="1st Summative Test" value={requestForm.testName} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Due Date</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, dueDate: event.target.value })} type="date" value={requestForm.dueDate} />
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-3">
                    <span className="font-medium text-slate-700">Instructions</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, instructions: event.target.value })} value={requestForm.instructions} />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  {editingRequestId && (
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={cancelEditRequest}
                      type="button"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
                    disabled={saving === "request"}
                    onClick={() => void saveRequest()}
                    type="button"
                  >
                    {editingRequestId ? <Save size={16} /> : <Plus size={16} />} {editingRequestId ? "Update Request" : "Confirm Request"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isTeacherSubmitter && (
        <div className="space-y-4">
          {!submitterTeacherId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Your account is not linked to a teacher record yet.
            </div>
          )}
          {teacherRows.map(({ request, assignment, subject, section, submission }) => {
            const key = getSubmissionKey(request.requestId, submitterTeacherId, subject.subjectId, section.sectionId);
            const draft = getDraft(key, submission);

            return (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={key}>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-950">{request.testName}</h2>
                      <StatusBadge label={submission ? "Submitted" : "Pending"} tone={submission ? "green" : "amber"} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{section.sectionName} | {subject.subjectName}</p>
                    <p className="mt-1 text-xs text-slate-500">Due {formatDate(request.dueDate)} | {assignment.gradeLevel} {assignment.strand}</p>
                    {request.instructions && <p className="mt-2 text-sm text-slate-600">{request.instructions}</p>}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr_1fr_auto] md:items-end">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">MPS</span>
                    <input
                      className="h-10 rounded-md border border-slate-300 px-3"
                      max="100"
                      min="0"
                      onChange={(event) => updateDraft(key, submission, { mps: event.target.value })}
                      step="0.01"
                      type="number"
                      value={draft.mps}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Least Mastered Competency</span>
                    <input
                      className="h-10 rounded-md border border-slate-300 px-3"
                      onChange={(event) => updateDraft(key, submission, { leastMasteredCompetency: event.target.value })}
                      value={draft.leastMasteredCompetency}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Planned Intervention</span>
                    <input
                      className="h-10 rounded-md border border-slate-300 px-3"
                      onChange={(event) => updateDraft(key, submission, { plannedIntervention: event.target.value })}
                      value={draft.plannedIntervention}
                    />
                  </label>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
                    disabled={saving === key}
                    onClick={() => void submitMps(request, { assignment, subject, section }, submission)}
                    type="button"
                  >
                    <Save size={16} /> {submission ? "Update" : "Submit"}
                  </button>
                </div>
              </div>
            );
          })}
          {teacherRows.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
              No active MPS requests or handled classes for this term.
            </div>
          )}
        </div>
      )}

      {isReviewer && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard detail="for selected term" icon={ClipboardList} label="Requests" value={summary.requests} />
            <SummaryCard detail="open to teachers" icon={CheckCircle2} label="Active Requests" value={summary.activeRequests} />
            <SummaryCard detail="filtered records" icon={BarChart3} label="Submissions" value={summary.submissions} />
            <SummaryCard detail="filtered average" icon={BarChart3} label="Average MPS" value={summary.averageMps} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setGradeFilter(event.target.value)} value={gradeFilter}>
                <option value="all">All grade levels</option>
                {gradeOptions.map((gradeLevel) => (
                  <option key={gradeLevel} value={gradeLevel}>{gradeLevel}</option>
                ))}
              </select>
              <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setSubjectFilter(event.target.value)} value={subjectFilter}>
                <option value="all">All subjects</option>
                {subjectOptions.map(([subjectId, subjectName]) => (
                  <option key={subjectId} value={subjectId}>{subjectName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">Subject Averages</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Grade Level</th>
                    <th className="px-4 py-3 font-semibold">No. of Classes</th>
                    <th className="px-4 py-3 font-semibold">Average MPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {subjectAverages.map((row) => (
                    <tr key={row.subjectId}>
                      <td className="px-4 py-3 font-medium text-slate-950">{row.subjectName}</td>
                      <td className="px-4 py-3">{row.gradeLevels}</td>
                      <td className="px-4 py-3">{row.classCount}/{row.expectedClassCount}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">{row.averageMps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {subjectAverages.length === 0 && <div className="p-5 text-sm text-slate-600">No MPS submissions found for this filter.</div>}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">MPS Submissions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Teacher</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">MPS</th>
                    <th className="px-4 py-3 font-semibold">Least Mastered Competency</th>
                    <th className="px-4 py-3 font-semibold">Planned Intervention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredSubmissions.map((submission) => (
                    <tr key={submission.submissionId}>
                      <td className="px-4 py-3 font-medium text-slate-950">{submission.teacherName}</td>
                      <td className="px-4 py-3">{submission.sectionName}<br /><span className="text-xs text-slate-500">{submission.gradeLevel} {submission.strand}</span></td>
                      <td className="px-4 py-3">{submission.subjectName}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">{submission.mps}</td>
                      <td className="px-4 py-3">{submission.leastMasteredCompetency}</td>
                      <td className="px-4 py-3">{submission.plannedIntervention || "No intervention encoded"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredSubmissions.length === 0 && <div className="p-5 text-sm text-slate-600">No MPS submissions found.</div>}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">Requests</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {selectedRequests.map((request) => (
                    <tr key={request.requestId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">{request.testName}</p>
                        <p className="mt-1 text-xs text-slate-500">{request.title}</p>
                      </td>
                      <td className="px-4 py-3">{formatDate(request.dueDate)}</td>
                      <td className="px-4 py-3"><StatusBadge label={request.status === "active" ? "Active" : "Closed"} tone={request.status === "active" ? "green" : "slate"} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            disabled={saving === request.requestId}
                            onClick={() => editRequest(request)}
                            type="button"
                          >
                            <Pencil size={16} /> Edit
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            disabled={saving === request.requestId}
                            onClick={() => void setRequestStatus(request, request.status === "active" ? "closed" : "active")}
                            type="button"
                          >
                            {request.status === "active" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                            {request.status === "active" ? "Close" : "Reopen"}
                          </button>
                          {isSuperAdmin && (
                            <button
                              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                              disabled={saving === request.requestId}
                              onClick={() => void deleteRequest(request)}
                              type="button"
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedRequests.length === 0 && <div className="p-5 text-sm text-slate-600">No MPS requests yet.</div>}
          </div>
        </div>
      )}
    </section>
  );
}
