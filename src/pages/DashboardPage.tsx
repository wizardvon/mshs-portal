import { BadgeCheck, CheckCircle2, FileCheck2, Hourglass, Percent } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeLoadAssignments } from "../services/assignmentService";
import { subscribeDllRequests, subscribeDllSubmissions } from "../services/dllSubmissionService";
import { subscribeTeachers } from "../services/teacherService";
import { subscribeCollection } from "../services/firestoreCrud";
import { useAuth } from "../providers/AuthProvider";
import type { DllRequest, DllSubmission, LoadAssignment, Subject, Teacher } from "../types/loading";

function getSubmissionKey(requestId: string, teacherId: string, subjectId: string) {
  return `${requestId}:${teacherId}:${subjectId}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [requests, setRequests] = useState<DllRequest[]>([]);
  const [submissions, setSubmissions] = useState<DllSubmission[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadAssignments, setLoadAssignments] = useState<LoadAssignment[]>([]);

  const canSeeDllSummary = profile?.role === "principal" || profile?.role === "master_teacher" || profile?.role === "super_admin";

  useEffect(() => subscribeDllRequests(setRequests), []);
  useEffect(() => {
    if (!canSeeDllSummary) {
      setSubmissions([]);
      return undefined;
    }

    return subscribeDllSubmissions(setSubmissions);
  }, [canSeeDllSummary]);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<Subject>("subjects", setSubjects), []);
  useEffect(() => subscribeLoadAssignments(setLoadAssignments), []);

  const dllSummary = useMemo(() => {
    const activeRequests = requests.filter((request) => request.status === "active");
    const activeTeachers = teachers.filter((teacher) => teacher.status === "active");
    const subjectsById = new Map(subjects.map((subject) => [subject.subjectId, subject]));
    const visibleSubmissions = submissions.filter((submission) => !submission.archived);
    const submissionKeys = new Set(
      visibleSubmissions.map((submission) =>
        getSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId),
      ),
    );
    const approvedKeys = new Set(
      visibleSubmissions
        .filter((submission) => submission.status === "approved")
        .map((submission) =>
          getSubmissionKey(submission.requestId, submission.teacherId, submission.subjectId),
        ),
    );

    const requiredKeys = activeRequests.flatMap((request) =>
      activeTeachers.flatMap((teacher) => {
        const teacherSubjectIds = Array.from(
          new Set(loadAssignments.filter((assignment) => assignment.teacherId === teacher.teacherId).map((assignment) => assignment.subjectId)),
        ).filter((subjectId) => subjectsById.has(subjectId));

        return teacherSubjectIds.map((subjectId) => getSubmissionKey(request.requestId, teacher.teacherId, subjectId));
      }),
    );

    const submitted = requiredKeys.filter((key) => submissionKeys.has(key)).length;
    const approved = requiredKeys.filter((key) => approvedKeys.has(key)).length;
    const total = requiredKeys.length;
    const pending = total - submitted;
    const submittedPercentage = total === 0 ? 0 : Math.round((submitted / total) * 100);
    const approvedPercentage = total === 0 ? 0 : Math.round((approved / total) * 100);

    return { total, submitted, approved, pending, submittedPercentage, approvedPercentage };
  }, [loadAssignments, requests, submissions, subjects, teachers]);

  const dllCards = [
    { label: "DLL Requests", value: dllSummary.total, detail: "active requirements", icon: FileCheck2 },
    { label: "DLL Submitted", value: dllSummary.submitted, detail: "submitted requirements", icon: CheckCircle2 },
    { label: "DLL Pending", value: dllSummary.pending, detail: "unaccomplished requirements", icon: Hourglass },
    { label: "DLL Submitted %", value: `${dllSummary.submittedPercentage}%`, detail: "submitted rate", icon: Percent },
    { label: "DLL Approved %", value: `${dllSummary.approvedPercentage}%`, detail: `${dllSummary.approved} approved`, icon: BadgeCheck },
  ];

  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {["Enrollment", "Attendance", "Approvals"].map((item, index) => (
          <article key={item} className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">{item}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{[1284, 96, 7][index]}</p>
          </article>
        ))}
      </div>

      {canSeeDllSummary && (
        <>
          <h2 className="mt-6 text-sm font-semibold text-slate-950">DLL Submission Status</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {dllCards.map(({ label, value, detail, icon: Icon }) => (
              <button
                className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
                key={label}
                onClick={() => navigate("/dll-submissions")}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
                    <p className="mt-2 text-xs text-slate-500">{detail}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-blue-700">
                    <Icon size={20} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
