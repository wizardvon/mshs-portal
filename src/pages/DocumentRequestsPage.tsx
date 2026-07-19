import { CheckCircle2, FileText, Link, Plus, Save, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import {
  createDocumentRequest,
  reviewDocumentRequestSubmission,
  subscribeDocumentRequests,
  subscribeDocumentRequestSubmissions,
  updateDocumentRequest,
  upsertDocumentRequestSubmission,
} from "../services/documentRequestService";
import { subscribeCollection } from "../services/firestoreCrud";
import type { UserProfile, UserRole } from "../types";
import type {
  DocumentRequest,
  DocumentRequestSubmission,
  DocumentRequestSubmissionStatus,
  DocumentRequestType,
} from "../types/loading";
import { getRoleLabel } from "../utils/accessControl";

type RequestForm = {
  title: string;
  description: string;
  dueDate: string;
  requestType: DocumentRequestType;
  targetGroup: DocumentRequest["targetGroup"];
  targetUserIds: string[];
};

type SubmissionForm = {
  submissionType: DocumentRequestType;
  link: string;
  hardCopyNote: string;
};

const emptyRequestForm: RequestForm = {
  title: "",
  description: "",
  dueDate: "",
  requestType: "soft_copy",
  targetGroup: "manual",
  targetUserIds: [],
};

const requestTypeLabels: Record<DocumentRequestType, string> = {
  soft_copy: "Soft copy",
  hard_copy: "Hard copy",
  both: "Soft and hard copy",
};

const statusTone: Record<DocumentRequestSubmissionStatus, "blue" | "green" | "amber"> = {
  submitted: "blue",
  confirmed: "green",
  returned: "amber",
};

const adminRoles: UserRole[] = ["principal", "registrar", "administrative_officer", "administrative_assistant", "admin", "super_admin"];
const teacherRoles: UserRole[] = ["teacher", "master_teacher"];

function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getSubmissionKey(requestId: string, targetUserId: string) {
  return `${requestId}:${targetUserId}`;
}

function getTargetUsers(group: RequestForm["targetGroup"], users: UserProfile[], manualIds: string[]) {
  const approvedUsers = users.filter((user) => user.status === "approved");
  if (group === "all_personnel") return approvedUsers;
  if (group === "all_teachers") return approvedUsers.filter((user) => teacherRoles.includes(user.role));
  if (group === "all_admin") return approvedUsers.filter((user) => adminRoles.includes(user.role));
  return approvedUsers.filter((user) => manualIds.includes(user.userId));
}

export function DocumentRequestsPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [submissions, setSubmissions] = useState<DocumentRequestSubmission[]>([]);
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm);
  const [isRequestDetailsOpen, setIsRequestDetailsOpen] = useState(false);
  const [submissionForms, setSubmissionForms] = useState<Record<string, SubmissionForm>>({});
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canCreateRequest = !!profile && profile.role !== "teacher";

  useEffect(() => subscribeCollection<UserProfile>("users", setUsers), []);
  useEffect(() => subscribeDocumentRequests(setRequests), []);
  useEffect(() => subscribeDocumentRequestSubmissions(setSubmissions), []);

  const approvedUsers = useMemo(
    () => users.filter((user) => user.status === "approved").sort((first, second) => first.fullName.localeCompare(second.fullName)),
    [users],
  );

  const selectedTargets = useMemo(
    () => getTargetUsers(requestForm.targetGroup, approvedUsers, requestForm.targetUserIds),
    [approvedUsers, requestForm.targetGroup, requestForm.targetUserIds],
  );

  const activeRequests = useMemo(
    () => requests.filter((request) => request.status === "active"),
    [requests],
  );

  const submissionsByRequestAndUser = useMemo(
    () => new Map(submissions.map((submission) => [getSubmissionKey(submission.requestId, submission.targetUserId), submission])),
    [submissions],
  );

  const myRequests = useMemo(
    () =>
      profile
        ? activeRequests
            .filter((request) => request.targetUserIds.includes(profile.userId))
            .map((request) => ({
              request,
              submission: submissionsByRequestAndUser.get(getSubmissionKey(request.requestId, profile.userId)),
            }))
        : [],
    [activeRequests, profile, submissionsByRequestAndUser],
  );

  const requestorRows = useMemo(
    () =>
      profile
        ? requests
            .filter((request) => request.createdBy === profile.userId)
            .flatMap((request) =>
              request.targetUserIds.map((targetUserId) => ({
                request,
                target: approvedUsers.find((user) => user.userId === targetUserId),
                submission: submissionsByRequestAndUser.get(getSubmissionKey(request.requestId, targetUserId)),
              })),
            )
        : [],
    [approvedUsers, profile, requests, submissionsByRequestAndUser],
  );

  function setTargetChecked(userId: string, checked: boolean) {
    setRequestForm((current) => ({
      ...current,
      targetUserIds: checked
        ? Array.from(new Set([...current.targetUserIds, userId]))
        : current.targetUserIds.filter((id) => id !== userId),
    }));
  }

  function updateSubmissionForm(key: string, updates: Partial<SubmissionForm>, requestType: DocumentRequestType) {
    setSubmissionForms((current) => ({
      ...current,
      [key]: {
        submissionType: current[key]?.submissionType ?? requestType,
        link: current[key]?.link ?? "",
        hardCopyNote: current[key]?.hardCopyNote ?? "",
        ...updates,
      },
    }));
  }

  async function saveRequest() {
    if (!profile || !canCreateRequest) return;
    const targets = selectedTargets;

    if (!requestForm.title.trim()) {
      setError("Enter the document request title.");
      return;
    }
    if (targets.length === 0) {
      setError("Select at least one personnel.");
      return;
    }

    setSaving("request");
    setError("");
    setNotice("");

    try {
      await createDocumentRequest({
        title: requestForm.title.trim(),
        description: requestForm.description.trim(),
        dueDate: requestForm.dueDate,
        requestType: requestForm.requestType,
        status: "active",
        targetUserIds: targets.map((target) => target.userId),
        targetGroup: requestForm.targetGroup,
        createdBy: profile.userId,
        creatorName: profile.fullName,
      });
      setRequestForm(emptyRequestForm);
      setIsRequestDetailsOpen(false);
      setNotice("Document request created.");
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to create document request.");
    } finally {
      setSaving("");
    }
  }

  async function submitDocument(request: DocumentRequest) {
    if (!profile) return;
    const key = getSubmissionKey(request.requestId, profile.userId);
    const existing = submissionsByRequestAndUser.get(key);
    const form = submissionForms[key] ?? {
      submissionType: request.requestType,
      link: existing?.link ?? "",
      hardCopyNote: existing?.hardCopyNote ?? "",
    };

    if ((form.submissionType === "soft_copy" || form.submissionType === "both") && !form.link.trim()) {
      setError("Paste the soft copy link.");
      return;
    }
    if ((form.submissionType === "hard_copy" || form.submissionType === "both") && !form.hardCopyNote.trim()) {
      setError("Enter the hard copy receiving note.");
      return;
    }

    setSaving(key);
    setError("");
    setNotice("");

    try {
      await upsertDocumentRequestSubmission({
        submissionId: existing?.submissionId,
        requestId: request.requestId,
        requestTitle: request.title,
        targetUserId: profile.userId,
        targetName: profile.fullName,
        submittedBy: profile.userId,
        submissionType: form.submissionType,
        link: form.link.trim(),
        hardCopyNote: form.hardCopyNote.trim(),
      });
      setNotice("Document submitted.");
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to submit document.");
    } finally {
      setSaving("");
    }
  }

  async function reviewSubmission(submission: DocumentRequestSubmission, status: DocumentRequestSubmissionStatus) {
    if (!profile) return;
    setSaving(`${submission.submissionId}:${status}`);
    setError("");
    setNotice("");

    try {
      await reviewDocumentRequestSubmission(submission.submissionId, {
        status,
        remarks: status === "returned" ? "Returned for correction." : "",
        confirmedBy: profile.userId,
        confirmerName: profile.fullName,
      });
      setNotice(status === "confirmed" ? "Submission confirmed." : "Submission returned.");
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to update submission.");
    } finally {
      setSaving("");
    }
  }

  async function toggleRequestStatus(request: DocumentRequest) {
    setSaving(request.requestId);
    setError("");
    setNotice("");

    try {
      await updateDocumentRequest(request.requestId, { status: request.status === "active" ? "closed" : "active" });
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to update request.");
    } finally {
      setSaving("");
    }
  }

  return (
    <section>
      <PageHeader
        actions={<StatusBadge label={`${activeRequests.length} active`} tone={activeRequests.length > 0 ? "green" : "slate"} />}
        description="Request documents from selected personnel, receive submissions, and confirm compliance."
        title="Document Requests"
      />

      {error && <p className="mb-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {canCreateRequest && (
        <>
          <div className="mb-5 flex justify-end">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90"
              onClick={() => {
                setRequestForm(emptyRequestForm);
                setIsRequestDetailsOpen(true);
              }}
              type="button"
            >
              <Plus size={16} /> Create Request
            </button>
          </div>

          {isRequestDetailsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
              <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Plus className="text-blue-700" size={18} />
                    <h2 className="text-sm font-semibold text-slate-950">Request Details</h2>
                  </div>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                    onClick={() => setIsRequestDetailsOpen(false)}
                    type="button"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <label className="grid gap-1 text-sm lg:col-span-2">
                    <span className="font-medium text-slate-700">Title</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, title: event.target.value })} value={requestForm.title} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Request Type</span>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3" onChange={(event) => setRequestForm({ ...requestForm, requestType: event.target.value as DocumentRequestType })} value={requestForm.requestType}>
                      <option value="soft_copy">Soft copy</option>
                      <option value="hard_copy">Hard copy</option>
                      <option value="both">Both</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Due Date</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, dueDate: event.target.value })} type="date" value={requestForm.dueDate} />
                  </label>
                  <label className="grid gap-1 text-sm lg:col-span-2">
                    <span className="font-medium text-slate-700">Instruction</span>
                    <input className="h-10 rounded-md border border-slate-300 px-3" onChange={(event) => setRequestForm({ ...requestForm, description: event.target.value })} value={requestForm.description} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Bulk Request</span>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3" onChange={(event) => setRequestForm({ ...requestForm, targetGroup: event.target.value as RequestForm["targetGroup"] })} value={requestForm.targetGroup}>
                      <option value="manual">Choose personnel</option>
                      <option value="all_personnel">All Personnel</option>
                      <option value="all_teachers">All Teachers</option>
                      <option value="all_admin">All Admin</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 rounded-md border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Personnel</p>
                    <StatusBadge label={`${selectedTargets.length} selected`} tone={selectedTargets.length > 0 ? "green" : "slate"} />
                  </div>
                  <div className="grid max-h-64 gap-2 overflow-y-auto p-3 md:grid-cols-2 xl:grid-cols-3">
                    {approvedUsers.map((user) => {
                      const bulkSelected = requestForm.targetGroup !== "manual" && selectedTargets.some((target) => target.userId === user.userId);
                      const checked = requestForm.targetGroup === "manual" ? requestForm.targetUserIds.includes(user.userId) : bulkSelected;

                      return (
                        <label className={["flex items-start gap-2 rounded-md border px-3 py-2 text-sm", checked ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"].join(" ")} key={user.userId}>
                          <input
                            checked={checked}
                            className="mt-1"
                            disabled={requestForm.targetGroup !== "manual"}
                            onChange={(event) => setTargetChecked(user.userId, event.target.checked)}
                            type="checkbox"
                          />
                          <span>
                            <span className="block font-semibold text-slate-950">{user.fullName}</span>
                            <span className="text-xs text-slate-500">{getRoleLabel(user.role)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setIsRequestDetailsOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50" disabled={saving === "request"} onClick={saveRequest} type="button">
                    <Save size={16} /> Confirm Request
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">My Required Documents</h2>
          {myRequests.map(({ request, submission }) => {
            const key = getSubmissionKey(request.requestId, profile?.userId ?? "");
            const form = submissionForms[key] ?? {
              submissionType: submission?.submissionType ?? request.requestType,
              link: submission?.link ?? "",
              hardCopyNote: submission?.hardCopyNote ?? "",
            };
            const canSubmit = request.status === "active";

            return (
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={request.requestId}>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-950">{request.title}</h3>
                      <StatusBadge label={requestTypeLabels[request.requestType]} tone="blue" />
                      {submission ? <StatusBadge label={submission.status} tone={statusTone[submission.status]} /> : <StatusBadge label="Pending" tone="amber" />}
                    </div>
                    <p className="text-sm text-slate-600">Due {formatDate(request.dueDate)}</p>
                    {request.description && <p className="mt-2 text-sm text-slate-600">{request.description}</p>}
                  </div>
                  {submission?.link && (
                    <a className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100" href={submission.link} rel="noreferrer" target="_blank">
                      <Link size={16} /> Open
                    </a>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[170px_1fr_auto] md:items-end">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-700">Submit As</span>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3" disabled={!canSubmit} onChange={(event) => updateSubmissionForm(key, { submissionType: event.target.value as DocumentRequestType }, request.requestType)} value={form.submissionType}>
                      <option value="soft_copy">Soft copy</option>
                      <option value="hard_copy">Hard copy</option>
                      <option value="both">Both</option>
                    </select>
                  </label>
                  <div className="grid gap-2">
                    {(form.submissionType === "soft_copy" || form.submissionType === "both") && (
                      <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" disabled={!canSubmit} onChange={(event) => updateSubmissionForm(key, { link: event.target.value }, request.requestType)} placeholder="Soft copy link" value={form.link} />
                    )}
                    {(form.submissionType === "hard_copy" || form.submissionType === "both") && (
                      <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" disabled={!canSubmit} onChange={(event) => updateSubmissionForm(key, { hardCopyNote: event.target.value }, request.requestType)} placeholder="Hard copy submitted to / receiving note" value={form.hardCopyNote} />
                    )}
                  </div>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-civic/90 disabled:opacity-50" disabled={!canSubmit || saving === key} onClick={() => submitDocument(request)} type="button">
                    <Send size={16} /> Submit
                  </button>
                </div>
              </article>
            );
          })}
          {myRequests.length === 0 && <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No document requests assigned to you.</p>}
        </section>

        {canCreateRequest && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Requests I Created</h2>
            {requests.filter((request) => request.createdBy === profile?.userId).map((request) => {
              const rows = requestorRows.filter((row) => row.request.requestId === request.requestId);
              const submittedCount = rows.filter((row) => row.submission).length;
              const confirmedCount = rows.filter((row) => row.submission?.status === "confirmed").length;

              return (
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={request.requestId}>
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="text-blue-700" size={18} />
                        <h3 className="font-semibold text-slate-950">{request.title}</h3>
                        <StatusBadge label={request.status} tone={request.status === "active" ? "green" : "slate"} />
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{submittedCount}/{rows.length} submitted · {confirmedCount}/{rows.length} confirmed</p>
                    </div>
                    <button className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={saving === request.requestId} onClick={() => toggleRequestStatus(request)} type="button">
                      {request.status === "active" ? "Close" : "Reopen"}
                    </button>
                  </div>
                  <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
                    {rows.map(({ target, submission }) => (
                      <div className="grid gap-3 px-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center" key={target?.userId ?? `${request.requestId}:missing`}>
                        <div>
                          <p className="font-semibold text-slate-950">{target?.fullName ?? "Unknown personnel"}</p>
                          <p className="text-xs text-slate-500">{target ? getRoleLabel(target.role) : "No user profile"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {submission ? <StatusBadge label={submission.status} tone={statusTone[submission.status]} /> : <StatusBadge label="Pending" tone="amber" />}
                          {submission?.link && (
                            <a className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline" href={submission.link} rel="noreferrer" target="_blank">
                              <Link size={14} /> Open
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2 md:justify-end">
                          <button className="inline-flex h-9 items-center gap-1 rounded-md bg-civic px-3 text-xs font-bold text-white hover:bg-civic/90 disabled:opacity-50" disabled={!submission || saving === `${submission.submissionId}:confirmed`} onClick={() => submission && reviewSubmission(submission, "confirmed")} type="button">
                            <CheckCircle2 size={15} /> Confirm
                          </button>
                          <button className="inline-flex h-9 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50" disabled={!submission || saving === `${submission.submissionId}:returned`} onClick={() => submission && reviewSubmission(submission, "returned")} type="button">
                            <XCircle size={15} /> Return
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </section>
  );
}
