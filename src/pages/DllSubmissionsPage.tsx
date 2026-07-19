import { Archive, CheckCircle2, Link, Pencil, Plus, Save, Send, Trash2, XCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DataTable, type DataColumn } from "../components/common/DataTable";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import {
  archiveAllDllSubmissions,
  createDllRequest,
  deleteAllDllSubmissions,
  reviewDllSubmission,
  subscribeDllRequests,
  subscribeDllSubmissions,
  updateDllRequest,
  upsertDllSubmission,
} from "../services/dllSubmissionService";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeTeachers } from "../services/teacherService";
import { subscribeCollection } from "../services/firestoreCrud";
import { defaultAcademicSettings, subscribeAcademicSettings } from "../services/settingsService";
import type {
  AcademicSettings,
  AcademicTerm,
  DllRequest,
  DllRequestStatus,
  DllSubmission,
  DllSubmissionStatus,
  DllSubmissionType,
  LoadAssignment,
  Subject,
  Teacher,
} from "../types/loading";
import { defaultTerm, termOptions } from "../types/loading";

type RequestForm = {
  title: string;
  schoolYear: string;
  term: AcademicTerm;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  dueDate: string;
  instructions: string;
};

type SubmissionForm = {
  submissionType: DllSubmissionType;
  link: string;
  submittedTo: string;
};

type ReviewDraft = {
  status: DllSubmissionStatus;
  remarks: string;
};

type ReviewerDetailRow = {
  request: DllRequest;
  teacher: Teacher;
  subject: Subject;
  submission?: DllSubmission;
};

type TeacherSummaryRow = {
  teacher: Teacher;
  details: ReviewerDetailRow[];
  requestCount: number;
  submittedCount: number;
  approvedCount: number;
  pendingCount: number;
  submittedPercentage: number;
  approvedPercentage: number;
  remarks: string;
};

const emptyRequestForm: RequestForm = {
  title: "Weekly DLL Submission",
  schoolYear: defaultAcademicSettings.currentSchoolYear,
  term: defaultAcademicSettings.currentTerm,
  weekLabel: "",
  weekStart: "",
  weekEnd: "",
  dueDate: "",
  instructions: "",
};

const submissionTypeLabels: Record<DllSubmissionType, string> = {
  soft_copy: "Soft copy",
  hard_copy: "Hard copy",
};

const submissionStatusTone: Record<DllSubmissionStatus, "blue" | "green" | "amber"> = {
  submitted: "blue",
  approved: "green",
  returned: "amber",
};

const deleteAllPassword = "dxuxihnfwcls";

function formatStatus(status: DllSubmissionStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getSubmissionKey(requestId: string, teacherId: string, subjectId: string) {
  return `${requestId}:${teacherId}:${subjectId}`;
}

export function DllSubmissionsPage() {
  const { profile } = useAuth();
  const [academicSettings, setAcademicSettings] = useState<AcademicSettings>(defaultAcademicSettings);
  const [selectedSchoolYear, setSelectedSchoolYear] = useState(defaultAcademicSettings.currentSchoolYear);
  const [selectedTerm, setSelectedTerm] = useState<AcademicTerm>(defaultAcademicSettings.currentTerm);
  const [requests, setRequests] = useState<DllRequest[]>([]);
  const [submissions, setSubmissions] = useState<DllSubmission[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadAssignments, setLoadAssignments] = useState<LoadAssignment[]>([]);
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm);
  const [editingRequestId, setEditingRequestId] = useState("");
  const [isRequestDetailsOpen, setIsRequestDetailsOpen] = useState(false);
  const [submissionForms, setSubmissionForms] = useState<Record<string, SubmissionForm>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [expandedTeacherId, setExpandedTeacherId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isSuperAdmin = profile?.role === "super_admin";
  const isReviewer = profile?.role === "principal" || profile?.role === "master_teacher" || profile?.role === "super_admin";
  const canCreateRequest = isReviewer;
  const isTeacherSubmitter = profile?.role === "teacher" || profile?.role === "master_teacher";
  const submitterTeacherId = isTeacherSubmitter ? profile?.assignedTeacherId ?? "" : "";
  const scopedTeacherId = profile?.role === "teacher" ? submitterTeacherId : "";

  useEffect(() => subscribeAcademicSettings(setAcademicSettings), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeLoadAssignments(setLoadAssignments), []);
  useEffect(() => subscribeDllRequests(setRequests), []);
  useEffect(() => subscribeDllSubmissions(setSubmissions, scopedTeacherId || undefined), [scopedTeacherId]);

  useEffect(() => {
    setSelectedSchoolYear(academicSettings.currentSchoolYear);
    setSelectedTerm(academicSettings.currentTerm);
    setRequestForm((current) => ({
      ...current,
      schoolYear: academicSettings.currentSchoolYear,
      term: academicSettings.currentTerm,
    }));
  }, [academicSettings.currentSchoolYear, academicSettings.currentTerm]);

  const visibleSubmissions = useMemo(
    () => submissions.filter((submission) => showArchived || !submission.archived),
    [showArchived, submissions],
  );

  const schoolYearOptions = useMemo(
    () =>
      Array.from(new Set([academicSettings.currentSchoolYear, ...requests.map((request) => request.schoolYear)].filter(Boolean)))
        .sort()
        .reverse(),
    [academicSettings.currentSchoolYear, requests],
  );

  const selectedRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.schoolYear === selectedSchoolYear &&
          (request.term ?? defaultTerm) === selectedTerm,
      ),
    [requests, selectedSchoolYear, selectedTerm],
  );

  const activeRequests = useMemo(
    () => selectedRequests.filter((request) => request.status === "active"),
    [selectedRequests],
  );
  const hasDllRecords = submissions.length > 0 || requests.length > 0;

  const teachersById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])),
    [teachers],
  );

  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.subjectId, subject])),
    [subjects],
  );

  const submissionsByRequestAndTeacherAndSubject = useMemo(
    () =>
      new Map(
        visibleSubmissions.map((submission) => [
          getSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId),
          submission,
        ]),
      ),
    [visibleSubmissions],
  );

  const teacherSubjects = useMemo(() => {
    if (!submitterTeacherId) return [];
    
    // Get all load assignments for this teacher
    const assignments = loadAssignments.filter(
      (a) => a.teacherId === submitterTeacherId && a.schoolYear === selectedSchoolYear && a.term === selectedTerm,
    );
    
    // Get unique subjects the teacher is assigned to
    const uniqueSubjects = Array.from(new Set(assignments.map((a) => a.subjectId)));
    
    // Map to subject details
    return uniqueSubjects
      .map((subjectId) => subjectsById.get(subjectId))
      .filter((subject): subject is Subject => subject != null)
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [submitterTeacherId, loadAssignments, selectedSchoolYear, selectedTerm, subjectsById]);

  const teacherRows = useMemo(() => {
    if (!submitterTeacherId) return [];

    // Create one row per request per subject the teacher teaches
    return selectedRequests.flatMap((request) =>
      teacherSubjects.map((subject) => ({
        request,
        subject,
        submission: submissionsByRequestAndTeacherAndSubject.get(
          getSubmissionKey(request.requestId, submitterTeacherId, subject.subjectId),
        ),
      })),
    );
  }, [selectedRequests, submitterTeacherId, teacherSubjects, submissionsByRequestAndTeacherAndSubject]);

  const reviewerDetailRows = useMemo<ReviewerDetailRow[]>(() => {
    const activeTeachers = teachers
      .filter((teacher) => teacher.status === "active")
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    // Create one row per request per teacher per subject they teach
    return selectedRequests.flatMap((request) =>
      activeTeachers.flatMap((teacher) => {
        const assignments = loadAssignments.filter(
          (a) => a.teacherId === teacher.teacherId && a.schoolYear === selectedSchoolYear && a.term === selectedTerm,
        );
        const uniqueSubjects = Array.from(new Set(assignments.map((a) => a.subjectId)));
        
        return uniqueSubjects
          .map((subjectId) => subjectsById.get(subjectId))
          .filter((subject): subject is Subject => subject != null)
          .map((subject) => ({
            request,
            teacher,
            subject,
            submission: submissionsByRequestAndTeacherAndSubject.get(
              getSubmissionKey(request.requestId, teacher.teacherId, subject.subjectId),
            ),
          }));
      }),
    );
  }, [selectedRequests, submissionsByRequestAndTeacherAndSubject, teachers, loadAssignments, subjectsById, selectedSchoolYear, selectedTerm]);

  const reviewerSummaryRows = useMemo<TeacherSummaryRow[]>(() => {
    const rowsByTeacher = new Map<string, ReviewerDetailRow[]>();

    reviewerDetailRows.forEach((row) => {
      rowsByTeacher.set(row.teacher.teacherId, [...(rowsByTeacher.get(row.teacher.teacherId) ?? []), row]);
    });

    return Array.from(rowsByTeacher.entries())
      .map(([teacherId, details]) => {
        const submittedCount = details.filter((row) => row.submission).length;
        const approvedCount = details.filter((row) => row.submission?.status === "approved").length;
        const requestCount = details.length;
        const pendingCount = requestCount - submittedCount;
        const remarks = details
          .map((row) => row.submission?.remarks?.trim())
          .filter((remark): remark is string => Boolean(remark));
        const latestRemark = remarks[0];

        return {
          teacher: details[0].teacher,
          details,
          requestCount,
          submittedCount,
          approvedCount,
          pendingCount,
          submittedPercentage: requestCount === 0 ? 0 : Math.round((submittedCount / requestCount) * 100),
          approvedPercentage: requestCount === 0 ? 0 : Math.round((approvedCount / requestCount) * 100),
          remarks: latestRemark ?? "No remarks",
        };
      })
      .sort((a, b) => a.teacher.fullName.localeCompare(b.teacher.fullName));
  }, [reviewerDetailRows]);

  const submittedTeacherRows = useMemo(
    () => reviewerSummaryRows.filter((row) => row.requestCount > 0 && row.pendingCount === 0),
    [reviewerSummaryRows],
  );

  const notSubmittedTeacherRows = useMemo(
    () => reviewerSummaryRows.filter((row) => row.pendingCount > 0),
    [reviewerSummaryRows],
  );

  function getSortedDetailRows(rows: ReviewerDetailRow[]) {
    return [...rows].sort((a, b) => {
      const aSubmitted = a.submission ? 1 : 0;
      const bSubmitted = b.submission ? 1 : 0;
      if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;

      const requestOrder = (a.request.weekLabel || a.request.title).localeCompare(b.request.weekLabel || b.request.title);
      if (requestOrder !== 0) return requestOrder;

      return a.subject.subjectName.localeCompare(b.subject.subjectName);
    });
  }

  function updateSubmissionForm(key: string, updates: Partial<SubmissionForm>) {
    setSubmissionForms((current) => {
      const form = current[key] ?? {
        submissionType: "soft_copy",
        link: "",
        submittedTo: "",
      };

      return {
        ...current,
        [key]: {
          ...form,
          ...updates,
        },
      };
    });
  }

  function updateReviewDraft(submission: DllSubmission, updates: Partial<ReviewDraft>) {
    setReviewDrafts((current) => ({
      ...current,
      [submission.submissionId]: {
        ...current[submission.submissionId],
        status: submission.status,
        remarks: submission.remarks ?? "",
        ...updates,
      },
    }));
  }

  async function saveRequest() {
    if (!profile || !canCreateRequest) return;
    setSaving("request");
    setError("");
    setNotice("");

    try {
      if (editingRequestId) {
        await updateDllRequest(editingRequestId, {
          title: requestForm.title,
          schoolYear: selectedSchoolYear,
          term: selectedTerm,
          weekLabel: requestForm.weekLabel,
          weekStart: requestForm.weekStart,
          weekEnd: requestForm.weekEnd,
          dueDate: requestForm.dueDate,
          instructions: requestForm.instructions,
        });
        setNotice("DLL request updated.");
      } else {
        await createDllRequest({
          ...requestForm,
          schoolYear: selectedSchoolYear,
          term: selectedTerm,
          status: "active",
          createdBy: profile.userId,
        });
        setNotice("DLL request created.");
      }
      setRequestForm({
        ...emptyRequestForm,
        schoolYear: selectedSchoolYear,
        term: selectedTerm,
      });
      setEditingRequestId("");
      setIsRequestDetailsOpen(false);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : editingRequestId ? "Unable to update DLL request." : "Unable to create DLL request.");
    } finally {
      setSaving("");
    }
  }

  function editRequest(request: DllRequest) {
    setEditingRequestId(request.requestId);
    setSelectedSchoolYear(request.schoolYear);
    setSelectedTerm(request.term ?? defaultTerm);
    setRequestForm({
      title: request.title,
      schoolYear: request.schoolYear,
      term: request.term ?? defaultTerm,
      weekLabel: request.weekLabel,
      weekStart: request.weekStart,
      weekEnd: request.weekEnd,
      dueDate: request.dueDate,
      instructions: request.instructions ?? "",
    });
    setIsRequestDetailsOpen(true);
    setError("");
    setNotice("");
  }

  function cancelEditRequest() {
    setEditingRequestId("");
    setRequestForm({
      ...emptyRequestForm,
      schoolYear: selectedSchoolYear,
      term: selectedTerm,
    });
    setIsRequestDetailsOpen(false);
  }

  async function setRequestStatus(request: DllRequest, status: DllRequestStatus) {
    if (!isSuperAdmin) return;
    setSaving(request.requestId);
    setError("");
    setNotice("");

    try {
      await updateDllRequest(request.requestId, { status });
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to update request status.");
    } finally {
      setSaving("");
    }
  }

  async function submitDll(request: DllRequest, subject: Subject) {
    if (!profile || !submitterTeacherId) {
      setError("Your user account must be linked to a teacher record before submitting DLL.");
      return;
    }

    const key = getSubmissionKey(request.requestId, submitterTeacherId, subject.subjectId);
    const existing = submissionsByRequestAndTeacherAndSubject.get(key);
    const form = submissionForms[key] ?? {
      submissionType: existing?.submissionType ?? "soft_copy",
      link: existing?.link ?? "",
      submittedTo: existing?.submittedTo ?? "",
    };

    if (form.submissionType === "soft_copy" && !form.link.trim()) {
      setError("Paste the Google Drive or OneDrive share link for soft copy submission.");
      return;
    }

    if (form.submissionType === "hard_copy" && !form.submittedTo.trim()) {
      setError("Enter who received the hard copy DLL.");
      return;
    }

    setSaving(key);
    setError("");
    setNotice("");

    try {
      await upsertDllSubmission({
        submissionId: existing?.submissionId,
        requestId: request.requestId,
        schoolYear: request.schoolYear,
        term: request.term ?? selectedTerm,
        teacherId: submitterTeacherId,
        teacherName: teachersById.get(submitterTeacherId)?.fullName ?? profile.fullName,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        submittedBy: profile.userId,
        submissionType: form.submissionType,
        link: form.submissionType === "soft_copy" ? form.link.trim() : "",
        submittedTo: form.submissionType === "hard_copy" ? form.submittedTo.trim() : "",
      });
      updateSubmissionForm(key, { link: "", submittedTo: "" });
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to submit DLL.");
    } finally {
      setSaving("");
    }
  }

  async function saveReview(submission: DllSubmission) {
    if (!profile || !isReviewer) return;

    const draft = reviewDrafts[submission.submissionId] ?? {
      status: submission.status,
      remarks: submission.remarks ?? "",
    };

    setSaving(submission.submissionId);
    setError("");
    setNotice("");

    try {
      await reviewDllSubmission(submission.submissionId, {
        status: draft.status,
        remarks: draft.remarks.trim(),
        reviewedBy: profile.userId,
        reviewerName: profile.fullName,
      });
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to save review.");
    } finally {
      setSaving("");
    }
  }

  async function archiveSubmissions() {
    if (!isSuperAdmin) return;
    const confirmed = window.confirm("Archive all DLL submissions? Archived submissions will be hidden from the active view.");
    if (!confirmed) return;

    setSaving("archive-all");
    setError("");
    setNotice("");

    try {
      const archivedCount = await archiveAllDllSubmissions();
      setShowArchived(false);
      setNotice(`Archived ${archivedCount} DLL submission${archivedCount === 1 ? "" : "s"}.`);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to archive DLL submissions.");
    } finally {
      setSaving("");
    }
  }

  async function deleteSubmissions() {
    if (!isSuperAdmin) return;
    const password = window.prompt("Enter the Super Admin delete password to delete all DLL submissions and requests.");
    if (password === null) return;

    if (password !== deleteAllPassword) {
      setError("Incorrect password. DLL submissions and requests were not deleted.");
      setNotice("");
      return;
    }

    const confirmed = window.confirm("Delete all DLL submissions and requests permanently? This cannot be undone.");
    if (!confirmed) return;

    setSaving("delete-all");
    setError("");
    setNotice("");

    try {
      const { requestCount, submissionCount } = await deleteAllDllSubmissions();
      setNotice(
        `Deleted ${submissionCount} DLL submission${submissionCount === 1 ? "" : "s"} and ${requestCount} request${requestCount === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to delete DLL submissions and requests.");
    } finally {
      setSaving("");
    }
  }

  const requestColumns: DataColumn<DllRequest>[] = [
    {
      header: "Request",
      render: (request) => (
        <div>
          <p className="font-semibold text-slate-950">{request.title}</p>
          <p className="mt-1 text-xs text-slate-500">{request.weekLabel || `${formatDate(request.weekStart)} - ${formatDate(request.weekEnd)}`}</p>
        </div>
      ),
    },
    { header: "School Year", render: (request) => request.schoolYear },
    { header: "Term", render: (request) => request.term ?? defaultTerm },
    { header: "Due Date", render: (request) => formatDate(request.dueDate) },
    {
      header: "Status",
      render: (request) => (
        <StatusBadge label={request.status === "active" ? "Active" : "Closed"} tone={request.status === "active" ? "green" : "slate"} />
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (request) => (
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
            onClick={() => setRequestStatus(request, request.status === "active" ? "closed" : "active")}
            type="button"
          >
            {request.status === "active" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
            {request.status === "active" ? "Close" : "Reopen"}
          </button>
        </div>
      ),
    },
  ];

  function renderTeacherSubmissionTable(rows: TeacherSummaryRow[], emptyText: string) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Teacher</th>
                <th className="px-4 py-3 font-semibold">Submitted / Required</th>
                <th className="px-4 py-3 font-semibold">No. of Pending</th>
                <th className="px-4 py-3 font-semibold">Percentage Submitted</th>
                <th className="px-4 py-3 font-semibold">Percentage Approved</th>
                <th className="px-4 py-3 font-semibold">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map((row) => {
                const expanded = expandedTeacherId === row.teacher.teacherId;

                return (
                  <Fragment key={row.teacher.teacherId}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setExpandedTeacherId(expanded ? "" : row.teacher.teacherId)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">{row.teacher.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.teacher.position}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        {row.submittedCount}/{row.requestCount}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-700">{row.pendingCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-600" style={{ width: `${row.submittedPercentage}%` }} />
                          </div>
                          <span className="font-semibold text-slate-900">{row.submittedPercentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${row.approvedPercentage}%` }} />
                          </div>
                          <span className="font-semibold text-slate-900">{row.approvedPercentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.remarks}</td>
                    </tr>
                    {expanded && (
                      <tr key={`${row.teacher.teacherId}-details`}>
                        <td className="bg-slate-50 px-4 py-4" colSpan={6}>
                          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                            <table className="w-full min-w-[1180px] text-left text-sm">
                              <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Request / Week</th>
                                  <th className="px-3 py-2 font-semibold">Subject</th>
                                  <th className="px-3 py-2 font-semibold">Submission</th>
                                  <th className="px-3 py-2 font-semibold">Status</th>
                                  <th className="px-3 py-2 font-semibold">Remarks</th>
                                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {getSortedDetailRows(row.details).map(({ request, teacher, subject, submission }) => {
                                  const draft = submission
                                    ? reviewDrafts[submission.submissionId] ?? {
                                        status: submission.status,
                                        remarks: submission.remarks ?? "",
                                      }
                                    : null;

                                  return (
                                    <tr key={getSubmissionKey(request.requestId, teacher.teacherId, subject.subjectId)}>
                                      <td className="px-3 py-3">
                                        <p className="font-medium text-slate-900">{request.weekLabel || request.title}</p>
                                        <p className="mt-1 text-xs text-slate-500">Due {formatDate(request.dueDate)}</p>
                                      </td>
                                      <td className="px-3 py-3">
                                        <p className="font-medium text-slate-900">{subject.subjectName}</p>
                                        <p className="mt-1 text-xs text-slate-500">{subject.subjectCode}</p>
                                      </td>
                                      <td className="px-3 py-3">
                                        {submission ? (
                                          <div className="space-y-2">
                                            <StatusBadge label={submissionTypeLabels[submission.submissionType]} tone="blue" />
                                            {submission.link && (
                                              <a className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline" href={submission.link} rel="noreferrer" target="_blank">
                                                <Link size={14} /> Open
                                              </a>
                                            )}
                                            {submission.submissionType === "hard_copy" && submission.submittedTo && (
                                              <p className="text-xs font-medium text-slate-600">Submitted to: {submission.submittedTo}</p>
                                            )}
                                          </div>
                                        ) : (
                                          <StatusBadge label="Pending" tone="amber" />
                                        )}
                                      </td>
                                      <td className="px-3 py-3">
                                        {submission && draft ? (
                                          <select
                                            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                                            onChange={(event) => updateReviewDraft(submission, { status: event.target.value as DllSubmissionStatus })}
                                            value={draft.status}
                                          >
                                            <option value="submitted">Submitted</option>
                                            <option value="approved">Approved</option>
                                            <option value="returned">Returned</option>
                                          </select>
                                        ) : (
                                          <span className="text-slate-400">No submission</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-3">
                                        {submission && draft ? (
                                          <textarea
                                            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                            onChange={(event) => updateReviewDraft(submission, { remarks: event.target.value })}
                                            value={draft.remarks}
                                          />
                                        ) : (
                                          <span className="text-slate-400">No remarks</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-3 text-right">
                                        <button
                                          className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
                                          disabled={!submission || saving === submission.submissionId}
                                          onClick={() => submission && saveReview(submission)}
                                          type="button"
                                        >
                                          <Save size={16} className={saving === submission?.submissionId ? "animate-pulse" : ""} />
                                          {saving === submission?.submissionId ? "Saving..." : "Save"}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="p-5 text-sm text-slate-600">{emptyText}</div>}
      </div>
    );
  }

  return (
    <section>
      <PageHeader
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
                onChange={(event) => {
                  const nextSchoolYear = event.target.value;
                  setSelectedSchoolYear(nextSchoolYear);
                  setRequestForm((current) => ({ ...current, schoolYear: nextSchoolYear }));
                }}
                value={selectedSchoolYear}
              >
                {schoolYearOptions.map((schoolYear) => (
                  <option key={schoolYear} value={schoolYear}>{schoolYear}</option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
                onChange={(event) => {
                  const nextTerm = event.target.value as AcademicTerm;
                  setSelectedTerm(nextTerm);
                  setRequestForm((current) => ({ ...current, term: nextTerm }));
                }}
                value={selectedTerm}
              >
                {termOptions.map((term) => (
                  <option key={term} value={term}>{term}</option>
                ))}
              </select>
            </div>
            {isSuperAdmin && (
              <>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowArchived((current) => !current)}
                  type="button"
                >
                  <Archive size={16} /> {showArchived ? "Hide Archived" : "Show Archived"}
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  disabled={saving === "archive-all" || submissions.length === 0}
                  onClick={archiveSubmissions}
                  type="button"
                >
                  <Archive size={16} /> Archive All
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  disabled={saving === "delete-all" || !hasDllRecords}
                  onClick={deleteSubmissions}
                  type="button"
                >
                  <Trash2 size={16} /> Delete All
                </button>
              </>
            )}
            <StatusBadge label={`${activeRequests.length} active`} tone={activeRequests.length > 0 ? "green" : "slate"} />
          </>
        }
        description="Manage weekly Daily Lesson Log submissions, approval status, and reviewer remarks by school year and term."
        title="DLL Submissions"
      />

      {error && <p className="mb-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {canCreateRequest && (
        <>
          <div className="mb-5 flex justify-end">
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
              <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {editingRequestId ? <Pencil size={18} className="text-blue-700" /> : <Plus size={18} className="text-blue-700" />}
                    <h2 className="text-sm font-semibold text-slate-950">{editingRequestId ? "Edit Weekly Request" : "Request Details"}</h2>
                  </div>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                    onClick={cancelEditRequest}
                    type="button"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Title</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, title: event.target.value })} value={requestForm.title} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">School Year</span>
                    <input className="h-10 rounded-md border border-slate-300 bg-slate-50 px-3" readOnly value={selectedSchoolYear} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Term</span>
                    <input className="h-10 rounded-md border border-slate-300 bg-slate-50 px-3" readOnly value={selectedTerm} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Week Label</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, weekLabel: event.target.value })} placeholder="Week 1" value={requestForm.weekLabel} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Due Date</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, dueDate: event.target.value })} type="date" value={requestForm.dueDate} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Week Start</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, weekStart: event.target.value })} type="date" value={requestForm.weekStart} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Week End</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, weekEnd: event.target.value })} type="date" value={requestForm.weekEnd} />
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
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
                    disabled={saving === "request" || !requestForm.title.trim() || !requestForm.schoolYear.trim()}
                    onClick={saveRequest}
                    type="button"
                  >
                    <Save size={16} /> {editingRequestId ? "Update Request" : "Confirm Request"}
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
          {teacherRows.map(({ request, subject, submission }) => {
            const key = getSubmissionKey(request.requestId, submitterTeacherId, subject.subjectId);
            const form = submissionForms[key] ?? {
              submissionType: submission?.submissionType ?? "soft_copy",
              link: submission?.link ?? "",
              submittedTo: submission?.submittedTo ?? "",
            };
            const canSubmit = request.status === "active" && Boolean(submitterTeacherId);

            return (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={key}>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-950">{request.title}</h2>
                      <div className="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                        {subject.subjectName}
                      </div>
                      <StatusBadge label={request.status === "active" ? "Active" : "Closed"} tone={request.status === "active" ? "green" : "slate"} />
                      {submission && <StatusBadge label={formatStatus(submission.status)} tone={submissionStatusTone[submission.status]} />}
                    </div>
                    <p className="text-sm text-slate-600">{request.weekLabel || `${formatDate(request.weekStart)} - ${formatDate(request.weekEnd)}`} - Due {formatDate(request.dueDate)}</p>
                    {request.instructions && <p className="mt-2 text-sm text-slate-600">{request.instructions}</p>}
                    {submission?.remarks && (
                      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Remarks: {submission.remarks}
                      </p>
                    )}
                    {submission?.submissionType === "hard_copy" && submission.submittedTo && (
                      <p className="mt-2 text-sm font-medium text-slate-700">
                        Submitted to: {submission.submittedTo}
                      </p>
                    )}
                  </div>
                  {submission?.link && (
                    <a className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100" href={submission.link} rel="noreferrer" target="_blank">
                      <Link size={16} /> Open Link
                    </a>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Submission Type</span>
                    <select
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 disabled:opacity-60"
                      disabled={!canSubmit}
                      onChange={(event) => updateSubmissionForm(key, { submissionType: event.target.value as DllSubmissionType })}
                      value={form.submissionType}
                    >
                      <option value="soft_copy">Soft copy</option>
                      <option value="hard_copy">Hard copy</option>
                    </select>
                  </label>
                  {form.submissionType === "soft_copy" ? (
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Share Link</span>
                      <input
                        className="h-10 rounded-md border border-slate-300 px-3 disabled:bg-slate-50 disabled:opacity-70"
                        disabled={!canSubmit}
                        onChange={(event) => updateSubmissionForm(key, { link: event.target.value })}
                        placeholder="Google Drive or OneDrive link"
                        value={form.link}
                      />
                    </label>
                  ) : (
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Submitted to</span>
                      <input
                        className="h-10 rounded-md border border-slate-300 px-3 disabled:bg-slate-50 disabled:opacity-70"
                        disabled={!canSubmit}
                        onChange={(event) => updateSubmissionForm(key, { submittedTo: event.target.value })}
                        placeholder="Name of receiving person or office"
                        value={form.submittedTo}
                      />
                    </label>
                  )}
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50"
                    disabled={!canSubmit || saving === key}
                    onClick={() => submitDll(request, subject)}
                    type="button"
                  >
                    <Send size={16} /> Submit
                  </button>
                </div>
              </div>
            );
          })}
          {teacherRows.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
              No DLL requests or subjects assigned.
            </div>
          )}
        </div>
      )}

      {isReviewer && (
        <div className="space-y-5">
          {isSuperAdmin && (
            <DataTable columns={requestColumns} data={selectedRequests} emptyText="No DLL requests for this school year and term yet." getKey={(request) => request.requestId} />
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-950">Teacher Submissions</h2>
              <StatusBadge label={`${submittedTeacherRows.length}/${reviewerSummaryRows.length} submitted`} tone={submittedTeacherRows.length === reviewerSummaryRows.length && reviewerSummaryRows.length > 0 ? "green" : "amber"} />
            </div>
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Submitted Teachers</h3>
                  <StatusBadge label={`${submittedTeacherRows.length} teacher${submittedTeacherRows.length === 1 ? "" : "s"}`} tone="green" />
                </div>
                {renderTeacherSubmissionTable(submittedTeacherRows, "No teachers have completed all required DLL submissions yet.")}
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Not Submitted Teachers</h3>
                  <StatusBadge label={`${notSubmittedTeacherRows.length} teacher${notSubmittedTeacherRows.length === 1 ? "" : "s"}`} tone="amber" />
                </div>
                {renderTeacherSubmissionTable(notSubmittedTeacherRows, "No teachers with pending DLL submissions.")}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
