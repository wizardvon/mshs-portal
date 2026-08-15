import {
  Archive,
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  Filter,
  Loader2,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import {
  acknowledgeAnnouncement,
  createAnnouncement,
  downloadAnnouncementAttachment,
  fetchAnnouncementsPage,
  getAnnouncement,
  getAnnouncementReadReport,
  markAnnouncementRead,
  permanentlyDeleteAnnouncement,
  setAnnouncementArchived,
  setAnnouncementPinned,
  subscribeAnnouncementReads,
  updateAnnouncement,
  validateAnnouncementFiles,
} from "../services/announcementService";
import { subscribeCollection } from "../services/firestoreCrud";
import { subscribeTeachers } from "../services/teacherService";
import type { UserProfile, UserRole } from "../types";
import type {
  Announcement,
  AnnouncementAttachment,
  AnnouncementAudienceType,
  AnnouncementCategory,
  AnnouncementDraft,
  AnnouncementPriority,
  AnnouncementRead,
} from "../types/announcements";
import type { LoadAssignment, Section, Teacher } from "../types/loading";
import { getRoleLabel } from "../utils/accessControl";
import { printTable } from "../utils/printTable";

const categoryLabels: Record<AnnouncementCategory, string> = {
  memorandum: "Memorandum",
  advisory: "Advisory",
  meeting: "Meeting",
  activity_event: "Activity / Event",
  deadline_submission: "Deadline / Submission",
  information: "Information",
  other: "Other",
};

const audienceLabels: Record<AnnouncementAudienceType, string> = {
  all_personnel: "All Personnel",
  teaching_personnel: "Teaching Personnel",
  non_teaching_personnel: "Non-Teaching Personnel",
  department: "Specific Department",
  grade_level: "Specific Grade Level",
  selected_personnel: "Selected Personnel",
  selected_group: "Selected Group",
};

const priorityLabels: Record<AnnouncementPriority, string> = {
  normal: "Normal",
  important: "Important",
  urgent: "Urgent",
};

const emptyDraft: AnnouncementDraft = {
  title: "",
  source: "",
  message: "",
  audienceType: "all_personnel",
  audienceIds: [],
  audienceNames: ["All Personnel"],
  targetUserIds: [],
  category: "information",
  priority: "normal",
  requireAcknowledgment: false,
};

function formatDate(value?: { toDate?: () => Date }) {
  if (!value?.toDate) return "Just now";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value.toDate());
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function priorityTone(priority: AnnouncementPriority): "slate" | "amber" | "red" {
  return priority === "urgent" ? "red" : priority === "important" ? "amber" : "slate";
}

const openModalIds: symbol[] = [];
let bodyOverflowBeforeModals = "";

function ModalShell({
  children,
  title,
  onClose,
  maxWidth = "max-w-4xl",
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  maxWidth?: string;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const modalId = Symbol(title);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openModalIds[openModalIds.length - 1] === modalId) onCloseRef.current();
    };

    if (openModalIds.length === 0) {
      bodyOverflowBeforeModals = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModalIds.push(modalId);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = openModalIds.indexOf(modalId);
      if (index >= 0) openModalIds.splice(index, 1);
      if (openModalIds.length === 0) document.body.style.overflow = bodyOverflowBeforeModals;
    };
  }, [title]);

  return createPortal(
    <div
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div
        className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl ${maxWidth}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-wine to-civic px-5 py-4 text-white">
          <h2 className="text-lg font-bold">{title}</h2>
          <button aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/10" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.querySelector("main") ?? document.body,
  );
}

export function AnnouncementsPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [reads, setReads] = useState<AnnouncementRead[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<LoadAssignment[]>([]);
  const [cursor, setCursor] = useState<Awaited<ReturnType<typeof fetchAnnouncementsPage>>["cursor"]>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [posterFilter, setPosterFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [attachmentFilter, setAttachmentFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const dismissedAnnouncementIdRef = useRef<string | null>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementDraft>(emptyDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [actionId, setActionId] = useState("");
  const [acknowledgmentError, setAcknowledgmentError] = useState("");
  const [preview, setPreview] = useState<AnnouncementAttachment | null>(null);
  const [reportAnnouncement, setReportAnnouncement] = useState<Announcement | null>(null);
  const [reportReads, setReportReads] = useState<AnnouncementRead[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const canManageAll = profile?.role === "admin" || profile?.role === "super_admin";
  const approvedUsers = useMemo(
    () => users.filter((user) => user.status === "approved").sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [users],
  );
  const usersById = useMemo(() => new Map(approvedUsers.map((user) => [user.userId, user])), [approvedUsers]);
  const teachersById = useMemo(() => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])), [teachers]);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]);
  const readsByAnnouncement = useMemo(() => new Map(reads.map((read) => [read.announcementId, read])), [reads]);

  const departments = useMemo(
    () => Array.from(new Set(teachers.filter((teacher) => teacher.status === "active").map((teacher) => teacher.specialization).filter(Boolean))).sort(),
    [teachers],
  );
  const gradeLevels = useMemo(
    () => Array.from(new Set(sections.map((section) => section.gradeLevel).filter(Boolean))).sort(),
    [sections],
  );
  const groupRoles = useMemo(
    () => Array.from(new Set(approvedUsers.map((user) => user.role))).sort(),
    [approvedUsers],
  );

  const loadFirstPage = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError("");
    try {
      const page = await fetchAnnouncementsPage(profile);
      setAnnouncements(page.announcements);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to load announcements.");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => void loadFirstPage(), [loadFirstPage]);
  useEffect(() => (profile ? subscribeAnnouncementReads(profile.userId, setReads) : undefined), [profile]);
  useEffect(() => subscribeCollection<UserProfile>("users", setUsers, []), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<Section>("sections", setSections, []), []);
  useEffect(() => subscribeCollection<LoadAssignment>("loadAssignments", setAssignments, []), []);

  useEffect(() => {
    const requestedId = searchParams.get("announcement");
    if (!requestedId) {
      dismissedAnnouncementIdRef.current = null;
      return;
    }
    if (
      dismissedAnnouncementIdRef.current === requestedId
      || selected?.announcementId === requestedId
    ) return;
    const loaded = announcements.find((announcement) => announcement.announcementId === requestedId);
    if (loaded) {
      void openAnnouncement(loaded);
      return;
    }
    if (!loading) {
      let cancelled = false;
      void getAnnouncement(requestedId)
        .then((announcement) => {
          if (
            !cancelled
            && dismissedAnnouncementIdRef.current !== requestedId
            && announcement?.status === "published"
          ) void openAnnouncement(announcement);
        })
        .catch(() => {
          if (!cancelled) setError("That announcement is unavailable or you do not have access to it.");
        });
      return () => {
        cancelled = true;
      };
    }
  // openAnnouncement intentionally resolves the latest profile state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, loading, searchParams]);

  function resolveAudience(draft: AnnouncementDraft) {
    const teachingRoles: UserRole[] = ["teacher", "master_teacher"];
    let targets: UserProfile[] = [];
    let names = [audienceLabels[draft.audienceType]];

    if (draft.audienceType === "all_personnel") targets = approvedUsers;
    if (draft.audienceType === "teaching_personnel") targets = approvedUsers.filter((user) => teachingRoles.includes(user.role));
    if (draft.audienceType === "non_teaching_personnel") targets = approvedUsers.filter((user) => !teachingRoles.includes(user.role));
    if (draft.audienceType === "department") {
      targets = approvedUsers.filter((user) => {
        const specialization = user.assignedTeacherId ? teachersById.get(user.assignedTeacherId)?.specialization : undefined;
        return specialization ? draft.audienceIds.includes(specialization) : false;
      });
      names = draft.audienceIds;
    }
    if (draft.audienceType === "grade_level") {
      const teacherIds = new Set(
        assignments.filter((assignment) => draft.audienceIds.includes(assignment.gradeLevel)).map((assignment) => assignment.teacherId),
      );
      targets = approvedUsers.filter((user) => {
        const advisingGrade = user.advisingSectionId ? sectionsById.get(user.advisingSectionId)?.gradeLevel : undefined;
        return Boolean((advisingGrade && draft.audienceIds.includes(advisingGrade)) || (user.assignedTeacherId && teacherIds.has(user.assignedTeacherId)));
      });
      names = draft.audienceIds.map((grade) => `Grade ${grade}`);
    }
    if (draft.audienceType === "selected_personnel") {
      targets = approvedUsers.filter((user) => draft.audienceIds.includes(user.userId));
      names = targets.map((user) => user.fullName);
    }
    if (draft.audienceType === "selected_group") {
      targets = approvedUsers.filter((user) => draft.audienceIds.includes(user.role));
      names = draft.audienceIds.map((role) => getRoleLabel(role as UserRole));
    }

    return { targets, names };
  }

  function openNewForm() {
    setEditing(null);
    setForm({ ...emptyDraft, audienceIds: [], audienceNames: ["All Personnel"], targetUserIds: [] });
    setFiles([]);
    setPersonnelSearch("");
    setUploadProgress(0);
    setFormOpen(true);
  }

  function openEditForm(announcement: Announcement) {
    setEditing(announcement);
    setForm({
      title: announcement.title,
      source: announcement.source,
      message: announcement.message,
      audienceType: announcement.audienceType,
      audienceIds: [...announcement.audienceIds],
      audienceNames: [...announcement.audienceNames],
      targetUserIds: [...announcement.targetUserIds],
      category: announcement.category,
      priority: announcement.priority,
      requireAcknowledgment: announcement.requireAcknowledgment,
    });
    setFiles([]);
    setPersonnelSearch("");
    setUploadProgress(0);
    setFormOpen(true);
  }

  async function submitAnnouncement(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setError("");
    setNotice("");
    if (!form.title.trim() || !form.source.trim()) {
      setError("Enter both the announcement title and source.");
      return;
    }
    let resolved;
    try {
      validateAnnouncementFiles(files);
      if (files.length + (editing?.attachments.length ?? 0) > 20) {
        throw new Error("An announcement can contain up to 20 attachments.");
      }
      resolved = resolveAudience(form);
      if (!resolved.targets.length) throw new Error("The selected audience does not contain any approved personnel.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the announcement details.");
      return;
    }

    const payload: AnnouncementDraft = {
      ...form,
      title: form.title.trim(),
      source: form.source.trim(),
      message: form.message.trim(),
      audienceNames: resolved.names,
      targetUserIds: resolved.targets.map((user) => user.userId),
    };

    setSaving(true);
    setUploadProgress(files.length ? 1 : 100);
    try {
      if (editing) {
        await updateAnnouncement(editing, payload, files, profile, setUploadProgress);
        setNotice("Announcement updated. Existing read records were preserved.");
      } else {
        await createAnnouncement(payload, files, profile, setUploadProgress);
        setNotice("Announcement posted.");
      }
      setFormOpen(false);
      await loadFirstPage();
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "Unable to save the announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function openAnnouncement(announcement: Announcement) {
    dismissedAnnouncementIdRef.current = null;
    setAcknowledgmentError("");
    setSelected(announcement);
    setSearchParams({ announcement: announcement.announcementId }, { replace: true });
    if (profile) {
      await markAnnouncementRead(announcement, profile).catch((caught) => console.error(caught));
    }
  }

  function closeAnnouncement() {
    dismissedAnnouncementIdRef.current = selected?.announcementId ?? searchParams.get("announcement");
    setSelected(null);
    setAcknowledgmentError("");
    setPreview(null);
    setReportAnnouncement(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("announcement");
      return next;
    }, { replace: true });
  }

  async function handleAcknowledge(announcement: Announcement) {
    if (!profile) return;
    setActionId(`${announcement.announcementId}:ack`);
    setAcknowledgmentError("");
    setError("");
    try {
      await acknowledgeAnnouncement(announcement, profile);
      setReads((current) => {
        const acknowledgedAt = Timestamp.now();
        const existing = current.find((read) => read.announcementId === announcement.announcementId);
        if (existing) {
          return current.map((read) => read.announcementId === announcement.announcementId ? { ...read, acknowledgedAt } : read);
        }
        return [
          ...current,
          {
            readId: `${announcement.announcementId}_${profile.userId}`,
            announcementId: announcement.announcementId,
            userId: profile.userId,
            userName: profile.fullName,
            firstReadAt: acknowledgedAt,
            acknowledgedAt,
          },
        ];
      });
      setNotice("Announcement acknowledged.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to record your acknowledgment.";
      setAcknowledgmentError(message);
      setError(message);
    } finally {
      setActionId("");
    }
  }

  async function toggleArchive(announcement: Announcement) {
    setActionId(`${announcement.announcementId}:archive`);
    try {
      await setAnnouncementArchived(announcement.announcementId, !announcement.isArchived);
      setNotice(announcement.isArchived ? "Announcement restored." : "Announcement archived.");
      if (selected?.announcementId === announcement.announcementId) closeAnnouncement();
      await loadFirstPage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the announcement.");
    } finally {
      setActionId("");
    }
  }

  async function togglePin(announcement: Announcement) {
    setActionId(`${announcement.announcementId}:pin`);
    try {
      await setAnnouncementPinned(announcement, !announcement.isPinned);
      setNotice(announcement.isPinned ? "Announcement unpinned." : "Announcement pinned.");
      await loadFirstPage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the pinned state.");
    } finally {
      setActionId("");
    }
  }

  async function openReport(announcement: Announcement) {
    setReportAnnouncement(announcement);
    setReportLoading(true);
    try {
      setReportReads(await getAnnouncementReadReport(announcement.announcementId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the readership report.");
      setReportAnnouncement(null);
    } finally {
      setReportLoading(false);
    }
  }

  function printAcknowledgmentSummary(announcement: Announcement) {
    const rows = announcement.targetUserIds
      .map((userId) => {
        const read = reportReads.find((item) => item.userId === userId);
        if (!read?.acknowledgedAt) return null;
        const user = usersById.get(userId);
        return {
          name: user?.fullName ?? read.userName ?? "Personnel",
          role: user ? getRoleLabel(user.role) : "Personnel",
          readAt: formatDate(read.firstReadAt),
          acknowledgedAt: formatDate(read.acknowledgedAt),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((first, second) => first.name.localeCompare(second.name));

    const readCount = announcement.targetUserIds.filter((userId) =>
      reportReads.some((read) => read.userId === userId),
    ).length;

    printTable({
      title: "Announcement Acknowledgment Summary",
      subtitle: `${announcement.title} | From: ${announcement.source} | Audience: ${announcement.audienceNames.join(", ")} | Posted by: ${announcement.postedByName} | Read: ${readCount}/${announcement.targetUserIds.length} | Acknowledged: ${rows.length}/${announcement.targetUserIds.length}`,
      rows: rows.map((row, index) => ({ ...row, number: index + 1 })),
      columns: [
        { header: "No.", getValue: (row) => row.number },
        { header: "Name", getValue: (row) => row.name },
        { header: "Role / Position", getValue: (row) => row.role },
        { header: "Date Read", getValue: (row) => row.readAt },
        { header: "Date Acknowledged", getValue: (row) => row.acknowledgedAt },
      ],
    });
  }

  async function handlePermanentDelete(announcement: Announcement) {
    if (!window.confirm(`Permanently delete “${announcement.title}”, its attachments, and read records? This cannot be undone.`)) return;
    setActionId(`${announcement.announcementId}:delete`);
    try {
      await permanentlyDeleteAnnouncement(announcement);
      setNotice("Announcement permanently deleted.");
      if (selected?.announcementId === announcement.announcementId) closeAnnouncement();
      setReportAnnouncement(null);
      await loadFirstPage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to permanently delete the announcement.");
    } finally {
      setActionId("");
    }
  }

  async function loadMore() {
    if (!profile || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchAnnouncementsPage(profile, cursor);
      setAnnouncements((current) => {
        const byId = new Map(current.map((announcement) => [announcement.announcementId, announcement]));
        page.announcements.forEach((announcement) => byId.set(announcement.announcementId, announcement));
        return Array.from(byId.values());
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load more announcements.");
    } finally {
      setLoadingMore(false);
    }
  }

  const visibleAnnouncements = useMemo(() => {
    const normalized = normalizeSearch(search);
    const now = Date.now();
    return announcements.filter((announcement) => {
      const read = readsByAnnouncement.has(announcement.announcementId);
      const searchable = normalizeSearch(
        `${announcement.title} ${announcement.source} ${announcement.message} ${announcement.postedByName} ${categoryLabels[announcement.category]}`,
      );
      const date = announcement.createdAt?.toDate?.().getTime() ?? now;
      const matchesArchive = quickFilter === "archive" ? announcement.isArchived : !announcement.isArchived;
      const matchesQuick =
        ["all", "archive"].includes(quickFilter) ||
        (quickFilter === "unread" && announcement.targetUserIds.includes(profile?.userId ?? "") && !read) ||
        (quickFilter === "pinned" && announcement.isPinned) ||
        (quickFilter === "important" && announcement.priority === "important") ||
        (quickFilter === "urgent" && announcement.priority === "urgent") ||
        (quickFilter === "mine" && announcement.postedByUid === profile?.userId);
      const matchesDate =
        dateFilter === "all" ||
        (dateFilter === "today" && date >= now - 24 * 60 * 60 * 1000) ||
        (dateFilter === "week" && date >= now - 7 * 24 * 60 * 60 * 1000) ||
        (dateFilter === "month" && date >= now - 30 * 24 * 60 * 60 * 1000);
      const matchesAttachment =
        attachmentFilter === "all" || announcement.attachments.some((attachment) => attachment.fileType === attachmentFilter);
      return (
        matchesArchive &&
        matchesQuick &&
        (!normalized || searchable.includes(normalized)) &&
        (categoryFilter === "all" || announcement.category === categoryFilter) &&
        (audienceFilter === "all" || announcement.audienceType === audienceFilter) &&
        (posterFilter === "all" || announcement.postedByUid === posterFilter) &&
        matchesDate &&
        matchesAttachment
      );
    });
  }, [announcements, attachmentFilter, audienceFilter, categoryFilter, dateFilter, posterFilter, profile?.userId, quickFilter, readsByAnnouncement, search]);

  const activeAnnouncements = announcements.filter((announcement) => !announcement.isArchived);
  const unreadCount = activeAnnouncements.filter(
    (announcement) => announcement.targetUserIds.includes(profile?.userId ?? "") && !readsByAnnouncement.has(announcement.announcementId),
  ).length;
  const reportReadMap = new Map(reportReads.map((read) => [read.userId, read]));
  const imageAttachments = selected?.attachments.filter((attachment) => attachment.fileType === "image") ?? [];
  const previewImageIndex = preview ? imageAttachments.findIndex((attachment) => attachment.attachmentId === preview.attachmentId) : -1;

  return (
    <section>
      <PageHeader
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-civic px-4 text-sm font-bold text-white shadow-sm hover:bg-wine" onClick={openNewForm} type="button">
            <Plus size={17} /> New Announcement
          </button>
        }
        description="Post updates, share files, and keep track of who has read important school information."
        title="Announcements"
      />

      {error && <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <div className="mb-5 flex flex-wrap gap-2">
        <StatusBadge label={`${unreadCount} unread`} tone={unreadCount ? "amber" : "slate"} />
        <StatusBadge label={`${activeAnnouncements.filter((item) => item.priority === "important").length} important`} tone="amber" />
        <StatusBadge label={`${activeAnnouncements.filter((item) => item.priority === "urgent").length} urgent`} tone="red" />
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
            <input className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-civic focus:ring-2 focus:ring-civic/15" onChange={(event) => setSearch(event.target.value)} placeholder="Search title, source, message, poster, or category" value={search} />
          </label>
          <select className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setQuickFilter(event.target.value)} value={quickFilter}>
            <option value="all">All announcements</option>
            <option value="unread">Unread</option>
            <option value="pinned">Pinned</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
            <option value="mine">My Announcements</option>
            <option value="archive">Archive</option>
          </select>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setShowFilters((current) => !current)} type="button">
            <Filter size={17} /> Filters
          </button>
        </div>
        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-5">
            <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
              <option value="all">All categories</option>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setAudienceFilter(event.target.value)} value={audienceFilter}>
              <option value="all">All audiences</option>
              {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setPosterFilter(event.target.value)} value={posterFilter}>
              <option value="all">Posted by anyone</option>
              {Array.from(new Map(announcements.map((item) => [item.postedByUid, item.postedByName]))).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setDateFilter(event.target.value)} value={dateFilter}>
              <option value="all">Any date</option><option value="today">Last 24 hours</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option>
            </select>
            <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setAttachmentFilter(event.target.value)} value={attachmentFilter}>
              <option value="all">Any attachment</option><option value="pdf">PDF</option><option value="image">Image</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 animate-spin text-civic" /> Loading announcements...</div>
      ) : visibleAnnouncements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BellRing className="mx-auto text-slate-300" size={38} />
          <p className="mt-3 font-semibold text-ink">{quickFilter === "mine" ? "You haven't posted any announcements yet." : "No announcements available."}</p>
          <p className="mt-1 text-sm text-slate-500">Try changing your search or filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleAnnouncements.map((announcement) => {
            const read = readsByAnnouncement.get(announcement.announcementId);
            const canEdit = canManageAll || announcement.postedByUid === profile?.userId;
            return (
              <article className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${!read && announcement.targetUserIds.includes(profile?.userId ?? "") ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-200"}`} key={announcement.announcementId}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <button className="min-w-0 flex-1 text-left" onClick={() => void openAnnouncement(announcement)} type="button">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={priorityLabels[announcement.priority]} tone={priorityTone(announcement.priority)} />
                      <StatusBadge label={categoryLabels[announcement.category]} tone="blue" />
                      {announcement.isPinned && <span className="inline-flex items-center gap-1 text-xs font-semibold text-civic"><Pin size={13} /> Pinned</span>}
                      {!read && announcement.targetUserIds.includes(profile?.userId ?? "") && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><span className="h-2 w-2 rounded-full bg-signal" /> Unread</span>}
                      {announcement.isArchived && <StatusBadge label="Archived" />}
                    </div>
                    <h2 className="mt-3 text-lg font-bold text-ink">{announcement.title}</h2>
                    <p className="mt-1 text-sm font-medium text-slate-600">From: {announcement.source}</p>
                    <p className="mt-1 text-sm text-slate-500">For: {announcement.audienceNames.join(", ")}</p>
                    {announcement.message && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-700">{announcement.message}</p>}
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                      <span>Posted {formatDate(announcement.createdAt)}</span><span>Posted by {announcement.postedByName}</span>
                      {announcement.attachments.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={13} /> {announcement.attachments.length} attachment{announcement.attachments.length === 1 ? "" : "s"}</span>}
                      {announcement.requireAcknowledgment && <span className={`font-semibold ${read?.acknowledgedAt ? "text-emerald-700" : "text-amber-700"}`}>{read?.acknowledgedAt ? "Acknowledged" : "Acknowledgment required"}</span>}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canManageAll && <button aria-label={announcement.isPinned ? "Unpin" : "Pin"} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" disabled={Boolean(actionId)} onClick={() => void togglePin(announcement)} type="button">{announcement.isPinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}
                    {canEdit && <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => openEditForm(announcement)} type="button"><Pencil size={15} /> Edit</button>}
                    {canEdit && <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={Boolean(actionId)} onClick={() => void toggleArchive(announcement)} type="button"><Archive size={15} /> {announcement.isArchived ? "Restore" : "Archive"}</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && !loading && (
        <div className="mt-6 text-center"><button className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore && <Loader2 className="animate-spin" size={16} />} Load More</button></div>
      )}

      {formOpen && (
        <ModalShell maxWidth="max-w-5xl" onClose={() => !saving && setFormOpen(false)} title={editing ? "Edit Announcement" : "New Announcement"}>
          <form className="min-h-0 overflow-y-auto" onSubmit={submitAnnouncement}>
            <div className="grid gap-4 bg-slate-50/50 p-5 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">Title <span className="text-red-600">*</span></span><input className="h-11 rounded-xl border border-slate-300 px-3" disabled={saving} maxLength={300} onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} /></label>
              <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">From / Source <span className="text-red-600">*</span></span><input className="h-11 rounded-xl border border-slate-300 px-3" disabled={saving} maxLength={300} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Office or person responsible" required value={form.source} /></label>
              <label className="grid gap-1.5 text-sm md:col-span-2"><span className="font-semibold text-slate-700">Message / Description</span><textarea className="min-h-28 rounded-xl border border-slate-300 p-3 leading-6" disabled={saving} maxLength={20000} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Add a summary, instructions, or deadline." value={form.message} /></label>
              <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">Who Should Read <span className="text-red-600">*</span></span><select className="h-11 rounded-xl border border-slate-300 bg-white px-3" disabled={saving} onChange={(event) => setForm({ ...form, audienceType: event.target.value as AnnouncementAudienceType, audienceIds: [] })} value={form.audienceType}>{Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">Category</span><select className="h-11 rounded-xl border border-slate-300 bg-white px-3" disabled={saving} onChange={(event) => setForm({ ...form, category: event.target.value as AnnouncementCategory })} value={form.category}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">Priority</span><select className="h-11 rounded-xl border border-slate-300 bg-white px-3" disabled={saving} onChange={(event) => setForm({ ...form, priority: event.target.value as AnnouncementPriority })} value={form.priority}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>

              {form.audienceType === "department" && <label className="grid gap-1.5 text-sm md:col-span-2"><span className="font-semibold text-slate-700">Department / Specialization</span><select className="h-11 rounded-xl border border-slate-300 bg-white px-3" onChange={(event) => setForm({ ...form, audienceIds: event.target.value ? [event.target.value] : [] })} value={form.audienceIds[0] ?? ""}><option value="">Select a department</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>}
              {form.audienceType === "grade_level" && <label className="grid gap-1.5 text-sm md:col-span-2"><span className="font-semibold text-slate-700">Grade Level</span><select className="h-11 rounded-xl border border-slate-300 bg-white px-3" onChange={(event) => setForm({ ...form, audienceIds: event.target.value ? [event.target.value] : [] })} value={form.audienceIds[0] ?? ""}><option value="">Select a grade level</option>{gradeLevels.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>}
              {form.audienceType === "selected_group" && <label className="grid gap-1.5 text-sm md:col-span-2"><span className="font-semibold text-slate-700">Personnel Group</span><select className="h-11 rounded-xl border border-slate-300 bg-white px-3" onChange={(event) => setForm({ ...form, audienceIds: event.target.value ? [event.target.value] : [] })} value={form.audienceIds[0] ?? ""}><option value="">Select a group</option>{groupRoles.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}</select></label>}
              {form.audienceType === "selected_personnel" && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
                  <label className="relative block"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input className="h-9 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" onChange={(event) => setPersonnelSearch(event.target.value)} placeholder="Find personnel" value={personnelSearch} /></label>
                  <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                    {approvedUsers.filter((user) => normalizeSearch(`${user.fullName} ${getRoleLabel(user.role)}`).includes(normalizeSearch(personnelSearch))).map((user) => (
                      <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50" key={user.userId}><input checked={form.audienceIds.includes(user.userId)} onChange={(event) => setForm({ ...form, audienceIds: event.target.checked ? [...form.audienceIds, user.userId] : form.audienceIds.filter((id) => id !== user.userId) })} type="checkbox" /><span>{user.fullName} <span className="text-xs text-slate-400">{getRoleLabel(user.role)}</span></span></label>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:col-span-2"><input checked={form.requireAcknowledgment} className="mt-1" disabled={saving} onChange={(event) => setForm({ ...form, requireAcknowledgment: event.target.checked })} type="checkbox" /><span><strong className="block text-slate-800">Require acknowledgment</strong><span className="mt-1 block text-slate-500">Personnel must intentionally confirm that they have read and understood this announcement.</span></span></label>
              <label className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm md:col-span-2"><span className="flex items-center gap-2 font-semibold text-slate-700"><Upload size={17} /> Attachments</span><span className="mt-1 block text-xs text-slate-500">PDF, JPG, JPEG, PNG, or WEBP. Maximum 50 MB per file. You may select multiple files.</span><input accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="mt-3 block w-full text-sm" disabled={saving} multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} type="file" />{editing?.attachments.length ? <p className="mt-2 text-xs text-slate-500">{editing.attachments.length} existing attachment{editing.attachments.length === 1 ? " will" : "s will"} be kept.</p> : null}{files.length > 0 && <ul className="mt-2 space-y-1 text-xs text-slate-600">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name} · {formatFileSize(file.size)}</li>)}</ul>}</label>
              {saving && <div className="md:col-span-2"><div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>{files.length ? "Uploading and saving..." : "Saving..."}</span><span>{Math.round(uploadProgress)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-civic transition-all" style={{ width: `${uploadProgress}%` }} /></div></div>}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4"><button className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700" disabled={saving} onClick={() => setFormOpen(false)} type="button">Cancel</button><button className="inline-flex h-10 items-center gap-2 rounded-xl bg-civic px-4 text-sm font-bold text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}{editing ? "Save Changes" : "Post Announcement"}</button></div>
          </form>
        </ModalShell>
      )}

      {selected && (
        <ModalShell onClose={closeAnnouncement} title="Announcement Details">
          <div className="min-h-0 overflow-y-auto p-5">
            <div className="flex flex-wrap gap-2"><StatusBadge label={priorityLabels[selected.priority]} tone={priorityTone(selected.priority)} /><StatusBadge label={categoryLabels[selected.category]} tone="blue" />{selected.isPinned && <StatusBadge label="Pinned" tone="red" />}</div>
            <h2 className="mt-4 text-2xl font-bold text-ink">{selected.title}</h2><p className="mt-2 font-semibold text-slate-700">From: {selected.source}</p><p className="mt-1 text-sm text-slate-500">For: {selected.audienceNames.join(", ")}</p>
            {selected.message && <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.message}</p>}
            {selected.attachments.length > 0 && <div className="mt-6"><h3 className="text-sm font-bold text-ink">Attachments</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{selected.attachments.map((attachment) => <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3" key={attachment.attachmentId}>{attachment.fileType === "pdf" ? <FileText className="shrink-0 text-red-700" /> : <FileImage className="shrink-0 text-blue-700" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p><p className="text-xs text-slate-500">{formatFileSize(attachment.fileSize)}</p></div><button aria-label={`View ${attachment.fileName}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300" onClick={() => setPreview(attachment)} type="button"><Eye size={15} /></button><button aria-label={`Download ${attachment.fileName}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300" onClick={() => void downloadAnnouncementAttachment(attachment).catch((caught) => setError(caught.message))} type="button"><Download size={15} /></button></div>)}</div></div>}
            <div className="mt-6 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-500"><p>Posted {formatDate(selected.createdAt)} by {selected.postedByName}</p>{selected.updatedAt && selected.updatedAt.toDate?.().getTime() !== selected.createdAt?.toDate?.().getTime() && <p>Updated {formatDate(selected.updatedAt)}</p>}</div>
            {selected.requireAcknowledgment && selected.targetUserIds.includes(profile?.userId ?? "") && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">{readsByAnnouncement.get(selected.announcementId)?.acknowledgedAt ? <p className="flex items-center gap-2 text-sm font-bold text-emerald-700"><Check size={18} /> Acknowledged</p> : <><button className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-civic px-4 py-2 text-left text-sm font-bold text-white disabled:opacity-60" disabled={Boolean(actionId)} onClick={() => void handleAcknowledge(selected)} type="button">{actionId.endsWith(":ack") ? <Loader2 className="shrink-0 animate-spin" size={16} /> : <Check className="shrink-0" size={16} />} I have read and understood this announcement.</button>{acknowledgmentError && <p className="mt-2 text-sm font-medium text-red-700" role="alert">{acknowledgmentError}</p>}</>}</div>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">{(canManageAll || selected.postedByUid === profile?.userId) && <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => void openReport(selected)} type="button"><Users size={16} /> Read Report</button>}{(canManageAll || selected.postedByUid === profile?.userId) && <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => { closeAnnouncement(); openEditForm(selected); }} type="button"><Pencil size={16} /> Edit</button>}<button className="h-10 rounded-xl bg-civic px-4 text-sm font-bold text-white" onClick={closeAnnouncement} type="button">Close</button></div>
        </ModalShell>
      )}

      {preview && (
        <ModalShell maxWidth="max-w-6xl" onClose={() => setPreview(null)} title={preview.fileName}>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-900 p-3 sm:p-5" style={{ height: "75vh" }}>
            {preview.fileType === "image" ? <img alt={preview.fileName} className="max-h-full max-w-full object-contain" src={preview.downloadURL} onError={() => setError("The image preview could not be loaded. Use Open or Download instead.")} /> : <iframe className="h-full min-h-[60vh] w-full rounded-lg bg-white" src={`${preview.downloadURL}#toolbar=1&navpanes=0`} title={preview.fileName} />}
            {preview.fileType === "image" && imageAttachments.length > 1 && <><button aria-label="Previous image" className="absolute left-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-slate-800" onClick={() => setPreview(imageAttachments[(previewImageIndex - 1 + imageAttachments.length) % imageAttachments.length])} type="button"><ChevronLeft /></button><button aria-label="Next image" className="absolute right-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-slate-800" onClick={() => setPreview(imageAttachments[(previewImageIndex + 1) % imageAttachments.length])} type="button"><ChevronRight /></button></>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><a className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700" href={preview.downloadURL} rel="noreferrer" target="_blank"><ExternalLink size={16} /> Open</a><button className="inline-flex h-10 items-center gap-2 rounded-xl bg-civic px-4 text-sm font-bold text-white" onClick={() => void downloadAnnouncementAttachment(preview).catch((caught) => setError(caught.message))} type="button"><Download size={16} /> Download</button></div>
        </ModalShell>
      )}

      {reportAnnouncement && (
        <ModalShell maxWidth="max-w-5xl" onClose={() => setReportAnnouncement(null)} title="Read & Acknowledgment Report">
          <div className="min-h-0 overflow-y-auto p-5">
            <h3 className="font-bold text-ink">{reportAnnouncement.title}</h3>
            <div className="mt-4 flex flex-wrap gap-2"><StatusBadge label={`Targeted: ${reportAnnouncement.targetUserIds.length}`} tone="blue" /><StatusBadge label={`Read: ${reportAnnouncement.targetUserIds.filter((id) => reportReadMap.has(id)).length}`} tone="green" /><StatusBadge label={`Unread: ${reportAnnouncement.targetUserIds.filter((id) => !reportReadMap.has(id)).length}`} tone="amber" />{reportAnnouncement.requireAcknowledgment && <><StatusBadge label={`Acknowledged: ${reportAnnouncement.targetUserIds.filter((id) => reportReadMap.get(id)?.acknowledgedAt).length}`} tone="green" /><StatusBadge label={`Pending: ${reportAnnouncement.targetUserIds.filter((id) => !reportReadMap.get(id)?.acknowledgedAt).length}`} tone="amber" /></>}</div>
            {reportLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading report...</p> : <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Read</th><th className="px-4 py-3">Date Read</th>{reportAnnouncement.requireAcknowledgment && <><th className="px-4 py-3">Acknowledgment</th><th className="px-4 py-3">Date Acknowledged</th></>}</tr></thead><tbody className="divide-y divide-slate-100">{reportAnnouncement.targetUserIds.map((userId) => { const read = reportReadMap.get(userId); return <tr key={userId}><td className="px-4 py-3 font-medium text-ink">{usersById.get(userId)?.fullName ?? read?.userName ?? "Personnel"}</td><td className="px-4 py-3">{read ? <span className="text-emerald-700">Read</span> : <span className="text-amber-700">Unread</span>}</td><td className="px-4 py-3 text-slate-500">{read ? formatDate(read.firstReadAt) : "—"}</td>{reportAnnouncement.requireAcknowledgment && <><td className="px-4 py-3">{read?.acknowledgedAt ? <span className="text-emerald-700">Acknowledged</span> : <span className="text-amber-700">Pending</span>}</td><td className="px-4 py-3 text-slate-500">{read?.acknowledgedAt ? formatDate(read.acknowledgedAt) : "—"}</td></>}</tr>; })}</tbody></table></div>}
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 p-4">
            {canManageAll && reportAnnouncement.isArchived ? <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700" disabled={Boolean(actionId)} onClick={() => void handlePermanentDelete(reportAnnouncement)} type="button"><Trash2 size={16} /> Delete Permanently</button> : <span />}
            <div className="flex flex-wrap justify-end gap-2">
              {reportAnnouncement.requireAcknowledgment && <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={reportLoading} onClick={() => printAcknowledgmentSummary(reportAnnouncement)} type="button"><Printer size={16} /> Print Acknowledgments</button>}
              <button className="h-10 rounded-xl bg-civic px-4 text-sm font-bold text-white" onClick={() => setReportAnnouncement(null)} type="button">Close</button>
            </div>
          </div>
        </ModalShell>
      )}
    </section>
  );
}
