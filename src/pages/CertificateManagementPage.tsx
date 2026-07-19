import { Copy, ExternalLink, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataColumn } from "../components/common/DataTable";
import { ModalForm } from "../components/common/ModalForm";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { subscribeCollection } from "../services/firestoreCrud";
import {
  certificateEventTypes,
  createCertificate,
  createCertificateParticipant,
  createCertificatePerson,
  deleteCertificate,
  deleteCertificateParticipant,
  deleteCertificatePerson,
  subscribeCertificateParticipants,
  subscribeCertificatePeople,
  subscribeCertificates,
  updateCertificate,
  updateCertificateParticipant,
  updateCertificatePerson,
} from "../services/certificateService";
import { defaultAcademicSettings } from "../services/settingsService";
import { subscribeTeachers } from "../services/teacherService";
import type {
  CertificateEventType,
  CertificateFormat,
  CertificateParticipant,
  CertificatePerson,
  CertificatePersonType,
  CertificateRecord,
  CertificateStatus,
  CertificationType,
  UserProfile,
} from "../types";
import type { PersonnelStaffType, Teacher } from "../types/loading";
import { getRoleLabel } from "../utils/accessControl";

type CertificateForm = Omit<CertificateRecord, "certificateId" | "createdAt" | "updatedAt">;
type ParticipantForm = Omit<CertificateParticipant, "participantId" | "certificateId" | "createdAt" | "updatedAt">;
type PersonForm = Omit<CertificatePerson, "personId" | "certificateId" | "personType" | "createdAt" | "updatedAt">;
type StaffRow = {
  staffId: string;
  userId?: string;
  staffName: string;
  roleOrPosition: string;
  staffType: PersonnelStaffType;
};

const deletePassword = "dxuxihnfwcls";

const emptyCertificate: CertificateForm = {
  certificateNo: "",
  eventType: "LAC Session",
  eventTitle: "",
  startDate: "",
  endDate: "",
  venue: "",
  schoolYear: defaultAcademicSettings.currentSchoolYear,
  defaultHoursAttended: 0,
  certificateFormat: "participation",
  certificationType: "esat",
  certificationSignatoryName: "",
  certificationSignatoryTitle: "",
  issuedBy: "Mataasnakahoy Senior High School",
  issuedDate: "",
  status: "valid",
  publicAccess: true,
  notes: "",
};

const emptyParticipant: ParticipantForm = {
  certificateNo: "",
  participantName: "",
  participantRole: "",
  participantOffice: "",
  hoursAttended: 0,
  status: "valid",
  publicAccess: true,
  notes: "",
};

const emptyPerson: PersonForm = {
  fullName: "",
  roleOrPosition: "",
  office: "",
  notes: "",
};

function getCertificateStart(certificate: Pick<CertificateRecord, "startDate" | "eventDate">) {
  return certificate.startDate || certificate.eventDate || "";
}

function getCertificateEnd(certificate: Pick<CertificateRecord, "endDate" | "startDate" | "eventDate">) {
  return certificate.endDate || certificate.startDate || certificate.eventDate || "";
}

function getDateRange(certificate: Pick<CertificateRecord, "startDate" | "endDate" | "eventDate">) {
  const startDate = getCertificateStart(certificate);
  const endDate = getCertificateEnd(certificate);
  if (!startDate && !endDate) return "No date";
  if (!endDate || startDate === endDate) return startDate;
  return `${startDate} to ${endDate}`;
}

function getValidationUrl(participantId: string) {
  return `${window.location.origin}/verify-certificate/${participantId}`;
}

function getQrUrl(participantId: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    getValidationUrl(participantId),
  )}`;
}

function confirmDeletePassword() {
  return window.prompt("Enter delete password to continue.") === deletePassword;
}

function getStaffKey(row: StaffRow) {
  return `${row.staffType}:${row.staffId}`;
}

function normalizeStaffName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getStaffNameSignature(value: string) {
  const parts = normalizeStaffName(value)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function CertificateManagementPage() {
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [participants, setParticipants] = useState<CertificateParticipant[]>([]);
  const [speakers, setSpeakers] = useState<CertificatePerson[]>([]);
  const [twgMembers, setTwgMembers] = useState<CertificatePerson[]>([]);
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [editingCertificate, setEditingCertificate] = useState<CertificateRecord | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<CertificateParticipant | null>(null);
  const [editingPerson, setEditingPerson] = useState<CertificatePerson | null>(null);
  const [personType, setPersonType] = useState<CertificatePersonType>("speaker_facilitator");
  const [certificateForm, setCertificateForm] = useState<CertificateForm>(emptyCertificate);
  const [participantForm, setParticipantForm] = useState<ParticipantForm>(emptyParticipant);
  const [personForm, setPersonForm] = useState<PersonForm>(emptyPerson);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [participantOpen, setParticipantOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedId, setCopiedId] = useState("");
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [selectedStaffKeys, setSelectedStaffKeys] = useState<string[]>([]);

  useEffect(() => subscribeCertificates(setCertificates), []);
  useEffect(() => subscribeTeachers(setTeachers), []);
  useEffect(() => subscribeCollection<UserProfile>("users", setUsers), []);

  const selectedCertificate = useMemo(
    () => certificates.find((certificate) => certificate.certificateId === selectedCertificateId) ?? null,
    [certificates, selectedCertificateId],
  );

  useEffect(() => {
    setParticipants([]);
    setSpeakers([]);
    setTwgMembers([]);
    if (!selectedCertificateId) return undefined;

    const unsubscribeParticipants = subscribeCertificateParticipants(selectedCertificateId, setParticipants);
    const unsubscribeSpeakers = subscribeCertificatePeople(
      selectedCertificateId,
      "speaker_facilitator",
      setSpeakers,
    );
    const unsubscribeTwg = subscribeCertificatePeople(
      selectedCertificateId,
      "technical_working_group",
      setTwgMembers,
    );

    return () => {
      unsubscribeParticipants();
      unsubscribeSpeakers();
      unsubscribeTwg();
    };
  }, [selectedCertificateId]);

  const visibleCertificates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return certificates.filter((certificate) => {
      const matchesSearch = [
        certificate.certificateNo,
        certificate.eventType,
        certificate.eventTitle,
        getDateRange(certificate),
        certificate.venue,
        certificate.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

      return (
        matchesSearch &&
        (eventTypeFilter === "all" || certificate.eventType === eventTypeFilter) &&
        (statusFilter === "all" || certificate.status === statusFilter)
      );
    });
  }, [certificates, eventTypeFilter, search, statusFilter]);

  const staffRows = useMemo<StaffRow[]>(() => {
    const teachingRows = teachers
      .filter((teacher) => teacher.status === "active")
      .map((teacher) => {
        const assignedUser = users.find((user) => user.assignedTeacherId === teacher.teacherId);
        return {
          staffId: teacher.teacherId,
          userId: assignedUser?.userId,
          staffName: teacher.fullName,
          roleOrPosition: teacher.position || "Teacher",
          staffType: "teaching" as const,
        };
      });
    const teachingNames = new Set(teachingRows.map((row) => normalizeStaffName(row.staffName)));
    const teachingNameSignatures = new Set(teachingRows.map((row) => getStaffNameSignature(row.staffName)));

    const masterTeacherRows = users
      .filter(
        (user) =>
          user.status === "approved" &&
          user.role === "master_teacher" &&
          !teachingNames.has(normalizeStaffName(user.fullName)) &&
          !teachingNameSignatures.has(getStaffNameSignature(user.fullName)),
      )
      .map((user) => ({
        staffId: user.assignedTeacherId || user.userId,
        userId: user.userId,
        staffName: user.fullName,
        roleOrPosition: getRoleLabel(user.role),
        staffType: "teaching" as const,
      }));

    const nonTeachingRows = users
      .filter(
        (user) =>
          user.status === "approved" &&
          user.role !== "teacher" &&
          user.role !== "master_teacher" &&
          user.role !== "super_admin",
      )
      .map((user) => ({
        staffId: user.userId,
        userId: user.userId,
        staffName: user.fullName,
        roleOrPosition: getRoleLabel(user.role),
        staffType: "non_teaching" as const,
      }));

    return [...teachingRows, ...masterTeacherRows, ...nonTeachingRows].sort((first, second) =>
      `${first.staffType} ${first.staffName}`.localeCompare(`${second.staffType} ${second.staffName}`),
    );
  }, [teachers, users]);

  const visibleStaffRows = useMemo(() => {
    const query = personnelSearch.trim().toLowerCase();
    return staffRows.filter((row) =>
      `${row.staffName} ${row.roleOrPosition} ${row.staffType}`.toLowerCase().includes(query),
    );
  }, [personnelSearch, staffRows]);

  const staffByKey = useMemo(
    () => new Map(staffRows.map((row) => [getStaffKey(row), row])),
    [staffRows],
  );

  function toggleStaff(row: StaffRow) {
    const key = getStaffKey(row);
    setSelectedStaffKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function resetPersonnelPicker() {
    setPersonnelSearch("");
    setSelectedStaffKeys([]);
  }

  function startCreateCertificate() {
    setEditingCertificate(null);
    setCertificateForm({
      ...emptyCertificate,
      issuedDate: new Date().toISOString().slice(0, 10),
    });
    setCertificateOpen(true);
  }

  function startEditCertificate(certificate: CertificateRecord) {
    setEditingCertificate(certificate);
    setCertificateForm({
      certificateNo: certificate.certificateNo,
      eventType: certificate.eventType,
      eventTitle: certificate.eventTitle,
      startDate: getCertificateStart(certificate),
      endDate: getCertificateEnd(certificate),
      venue: certificate.venue,
      schoolYear: certificate.schoolYear ?? defaultAcademicSettings.currentSchoolYear,
      defaultHoursAttended: Number(certificate.defaultHoursAttended || 0),
      certificateFormat: certificate.certificateFormat ?? "participation",
      certificationType: certificate.certificationType ?? "esat",
      certificationSignatoryName: certificate.certificationSignatoryName ?? "",
      certificationSignatoryTitle: certificate.certificationSignatoryTitle ?? "",
      issuedBy: certificate.issuedBy,
      issuedDate: certificate.issuedDate,
      status: certificate.status,
      publicAccess: certificate.publicAccess,
      notes: certificate.notes ?? "",
    });
    setCertificateOpen(true);
  }

  async function saveCertificate() {
    const isCertification = certificateForm.certificateFormat === "certification";
    const certificationDate = certificateForm.issuedDate || certificateForm.startDate || new Date().toISOString().slice(0, 10);
    const nextForm = {
      ...certificateForm,
      eventType: isCertification ? "Training" as CertificateEventType : certificateForm.eventType,
      startDate: isCertification ? certificationDate : certificateForm.startDate,
      endDate: isCertification ? certificationDate : certificateForm.endDate || certificateForm.startDate,
      issuedDate: certificationDate,
      issuedBy: isCertification
        ? certificateForm.certificationSignatoryName || certificateForm.issuedBy
        : certificateForm.issuedBy,
      status: certificateForm.status || "valid" as CertificateStatus,
      publicAccess: isCertification ? true : certificateForm.publicAccess,
      defaultHoursAttended: Number(certificateForm.defaultHoursAttended || 0),
      certificationSignatoryName:
        isCertification
          ? certificateForm.certificationSignatoryName
          : certificateForm.certificationSignatoryName || certificateForm.issuedBy,
    };

    if (editingCertificate) await updateCertificate(editingCertificate.certificateId, nextForm);
    else {
      const certificateId = await createCertificate(nextForm);
      setSelectedCertificateId(certificateId);
    }
    setCertificateOpen(false);
  }

  async function handleDeleteCertificate(certificate: CertificateRecord) {
    if (!confirmDeletePassword()) return;
    await deleteCertificate(certificate.certificateId);
    if (selectedCertificateId === certificate.certificateId) setSelectedCertificateId("");
  }

  function startCreateParticipant() {
    if (!selectedCertificate) return;
    setEditingParticipant(null);
    resetPersonnelPicker();
    setParticipantForm({
      ...emptyParticipant,
      certificateNo: selectedCertificate.certificateNo,
      hoursAttended: Number(selectedCertificate.defaultHoursAttended || 0),
      status: selectedCertificate.status,
      publicAccess: selectedCertificate.publicAccess,
    });
    setParticipantOpen(true);
  }

  function startEditParticipant(participant: CertificateParticipant) {
    setEditingParticipant(participant);
    resetPersonnelPicker();
    setParticipantForm({
      certificateNo: participant.certificateNo,
      participantName: participant.participantName,
      participantRole: participant.participantRole,
      participantOffice: participant.participantOffice,
      hoursAttended: Number(participant.hoursAttended || 0),
      status: participant.status,
      publicAccess: participant.publicAccess,
      notes: participant.notes ?? "",
    });
    setParticipantOpen(true);
  }

  async function saveParticipant() {
    if (!selectedCertificate) return;

    if (editingParticipant) await updateCertificateParticipant(editingParticipant.participantId, participantForm);
    else {
      const selectedRows = selectedStaffKeys
        .map((key) => staffByKey.get(key))
        .filter((row): row is StaffRow => Boolean(row));
      if (selectedRows.length === 0) {
        window.alert("Select at least one personnel.");
        return;
      }

      await Promise.all(
        selectedRows.map((row) =>
          createCertificateParticipant({
            ...participantForm,
            certificateId: selectedCertificate.certificateId,
            participantUserId: row.userId,
            participantStaffId: row.staffId,
            participantStaffType: row.staffType,
            participantName: row.staffName,
            participantRole: row.roleOrPosition,
            participantOffice: row.staffType === "teaching" ? "Teaching" : "Non-teaching",
          }),
        ),
      );
    }
    setParticipantOpen(false);
  }

  async function handleDeleteParticipant(participant: CertificateParticipant) {
    if (!confirmDeletePassword()) return;
    await deleteCertificateParticipant(participant.participantId);
  }

  function startCreatePerson(nextPersonType: CertificatePersonType) {
    if (!selectedCertificate) return;
    setEditingPerson(null);
    setPersonType(nextPersonType);
    resetPersonnelPicker();
    setPersonForm(emptyPerson);
    setPersonOpen(true);
  }

  function startEditPerson(person: CertificatePerson) {
    setEditingPerson(person);
    setPersonType(person.personType);
    resetPersonnelPicker();
    setPersonForm({
      fullName: person.fullName,
      roleOrPosition: person.roleOrPosition,
      office: person.office,
      notes: person.notes ?? "",
    });
    setPersonOpen(true);
  }

  async function savePerson() {
    if (!selectedCertificate) return;

    if (editingPerson) await updateCertificatePerson(editingPerson.personId, personForm);
    else {
      const selectedRows = selectedStaffKeys
        .map((key) => staffByKey.get(key))
        .filter((row): row is StaffRow => Boolean(row));
      if (selectedRows.length === 0) {
        window.alert("Select at least one personnel.");
        return;
      }

      await Promise.all(
        selectedRows.map((row) =>
          createCertificatePerson({
            ...personForm,
            certificateId: selectedCertificate.certificateId,
            personType,
            fullName: row.staffName,
            roleOrPosition: row.roleOrPosition,
            office: row.staffType === "teaching" ? "Teaching" : "Non-teaching",
          }),
        ),
      );
    }
    setPersonOpen(false);
  }

  async function handleDeletePerson(person: CertificatePerson) {
    if (!confirmDeletePassword()) return;
    await deleteCertificatePerson(person.personId);
  }

  async function copyValidationLink(participantId: string) {
    await navigator.clipboard.writeText(getValidationUrl(participantId));
    setCopiedId(participantId);
    window.setTimeout(() => setCopiedId(""), 1800);
  }

  function renderPersonnelPicker() {
    return (
      <div className="sm:col-span-2">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-900">
            Select personnel ({selectedStaffKeys.length} selected)
          </p>
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm sm:w-72"
            onChange={(event) => setPersonnelSearch(event.target.value)}
            placeholder="Search personnel"
            value={personnelSearch}
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {visibleStaffRows.length === 0 ? (
            <div className="p-4 text-sm font-medium text-slate-600">No personnel found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleStaffRows.map((row) => {
                const key = getStaffKey(row);
                return (
                  <label
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-red-50/40"
                    key={key}
                  >
                    <input
                      checked={selectedStaffKeys.includes(key)}
                      className="h-4 w-4 rounded border-slate-300"
                      onChange={() => toggleStaff(row)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">
                        {row.staffName}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {row.roleOrPosition} / {row.staffType === "teaching" ? "Teaching" : "Non-teaching"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const certificateColumns: DataColumn<CertificateRecord>[] = [
    {
      header: "Certificate",
      render: (certificate) => (
        <button
          className="text-left"
          onClick={() => setSelectedCertificateId(certificate.certificateId)}
          type="button"
        >
          <span className="block font-semibold text-civic hover:underline">{certificate.certificateNo}</span>
          <span className="mt-1 block text-xs text-slate-500">{certificate.certificateId}</span>
        </button>
      ),
    },
    {
      header: "Activity",
      render: (certificate) => (
        <button
          className="text-left"
          onClick={() => setSelectedCertificateId(certificate.certificateId)}
          type="button"
        >
          <span className="block font-medium text-slate-900 hover:underline">{certificate.eventTitle}</span>
          <span className="mt-1 block text-xs text-slate-500">
            {certificate.eventType} / {getDateRange(certificate)}
          </span>
          <span className="mt-1 block text-xs font-semibold text-civic">
            {(certificate.certificateFormat ?? "participation") === "certification" ? "CERTIFICATION" : "Certificate of Participation"}
            {(certificate.certificateFormat ?? "participation") === "certification" && certificate.certificationType === "esat" ? " / ESAT" : ""}
          </span>
        </button>
      ),
    },
    { header: "Venue", render: (certificate) => certificate.venue },
    {
      header: "Status",
      render: (certificate) => (
        <div className="space-y-2">
          <StatusBadge label={certificate.status} tone={certificate.status === "valid" ? "green" : "red"} />
          {!certificate.publicAccess && <StatusBadge label="private" tone="slate" />}
        </div>
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (certificate) => (
        <div className="flex justify-end gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setSelectedCertificateId(certificate.certificateId)}
            type="button"
          >
            <UsersRound size={16} /> Details
          </button>
          <button
            className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"
            onClick={() => startEditCertificate(certificate)}
            title="Edit certificate"
            type="button"
          >
            <Pencil size={16} />
          </button>
          <button
            className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"
            onClick={() => handleDeleteCertificate(certificate)}
            title="Delete certificate"
            type="button"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const participantColumns: DataColumn<CertificateParticipant>[] = [
    {
      header: "Participant",
      render: (participant) => (
        <div>
          <p className="font-semibold text-slate-950">{participant.participantName}</p>
          <p className="mt-1 text-xs text-slate-500">
            {[participant.participantRole, participant.participantOffice].filter(Boolean).join(" - ")}
          </p>
        </div>
      ),
    },
    { header: "Certificate No.", render: (participant) => participant.certificateNo },
    { header: "Hours", render: (participant) => `${Number(participant.hoursAttended || 0)} hours` },
    {
      header: "Status",
      render: (participant) => (
        <div className="space-y-2">
          <StatusBadge label={participant.status} tone={participant.status === "valid" ? "green" : "red"} />
          {!participant.publicAccess && <StatusBadge label="private" tone="slate" />}
        </div>
      ),
    },
    {
      header: "QR",
      render: (participant) => (
        <img
          alt={`QR code for ${participant.certificateNo}`}
          className="h-20 w-20 rounded-lg border border-slate-200 bg-white p-1"
          src={getQrUrl(participant.participantId)}
        />
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (participant) => (
        <div className="flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50" onClick={() => copyValidationLink(participant.participantId)} title={copiedId === participant.participantId ? "Copied" : "Copy validation link"} type="button"><Copy size={16} /></button>
          <a className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50" href={`/verify-certificate/${participant.participantId}`} rel="noreferrer" target="_blank" title="Open validation page"><ExternalLink size={16} /></a>
          <button className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50" onClick={() => startEditParticipant(participant)} title="Edit participant" type="button"><Pencil size={16} /></button>
          <button className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => handleDeleteParticipant(participant)} title="Delete participant" type="button"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  const personColumns: DataColumn<CertificatePerson>[] = [
    {
      header: "Name",
      render: (person) => (
        <div>
          <p className="font-semibold text-slate-950">{person.fullName}</p>
          <p className="mt-1 text-xs text-slate-500">{person.notes}</p>
        </div>
      ),
    },
    { header: "Role / Position", render: (person) => person.roleOrPosition },
    { header: "Office", render: (person) => person.office },
    {
      header: "Actions",
      align: "right",
      render: (person) => (
        <div className="flex justify-end gap-2">
          <button className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50" onClick={() => startEditPerson(person)} title="Edit" type="button"><Pencil size={16} /></button>
          <button className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => handleDeletePerson(person)} title="Delete" type="button"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-semibold text-white hover:bg-wine" onClick={startCreateCertificate} type="button">
            <Plus size={16} /> Add Certificate
          </button>
        }
        description="Create LAC, training, and seminar certificate activities. After creating one, add participants, speakers/facilitators, and technical working group members."
        title="Certificates"
      />

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_180px_150px]">
          <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Search certificate or activity" value={search} />
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setEventTypeFilter(event.target.value)} value={eventTypeFilter}>
            <option value="all">All activities</option>
            {certificateEventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">All statuses</option>
            <option value="valid">Valid</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Showing {visibleCertificates.length} of {certificates.length} certificate activities
        </p>
      </div>

      {copiedId && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Validation link copied.
        </p>
      )}

      <DataTable columns={certificateColumns} data={visibleCertificates} emptyText="No certificate activities yet." getKey={(certificate) => certificate.certificateId} />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Certificate Details</p>
            <h2 className="mt-2 text-xl font-bold text-ink">
              {selectedCertificate ? selectedCertificate.eventTitle : "Select a certificate activity"}
            </h2>
            {selectedCertificate && (
              <>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedCertificate.certificateNo} / {selectedCertificate.eventType} / {getDateRange(selectedCertificate)}
                </p>
                <p className="mt-1 text-sm font-semibold text-civic">
                  {(selectedCertificate.certificateFormat ?? "participation") === "certification" ? "CERTIFICATION" : "Certificate of Participation"}
                  {(selectedCertificate.certificateFormat ?? "participation") === "certification" && selectedCertificate.certificationType === "esat" ? " / ESAT" : ""}
                  {selectedCertificate.certificationSignatoryName ? ` / ${selectedCertificate.certificationSignatoryName}` : ""}
                </p>
              </>
            )}
          </div>
        </div>

        {selectedCertificate ? (
          <div className="mt-5 space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-950">Participants</h3>
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-wine" onClick={startCreateParticipant} type="button">
                  <Plus size={16} /> Add Participant
                </button>
              </div>
              <DataTable columns={participantColumns} data={participants} emptyText="No participants added yet." getKey={(participant) => participant.participantId} />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-950">Speakers / Facilitators</h3>
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-wine" onClick={() => startCreatePerson("speaker_facilitator")} type="button">
                  <Plus size={16} /> Add Speaker
                </button>
              </div>
              <DataTable columns={personColumns} data={speakers} emptyText="No speakers or facilitators added yet." getKey={(person) => person.personId} />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-950">Technical Working Group</h3>
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white hover:bg-wine" onClick={() => startCreatePerson("technical_working_group")} type="button">
                  <Plus size={16} /> Add TWG
                </button>
              </div>
              <DataTable columns={personColumns} data={twgMembers} emptyText="No TWG members added yet." getKey={(person) => person.personId} />
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-medium text-slate-600">
            Click a certificate row or the Details button to manage participants, speakers/facilitators, and TWG.
          </div>
        )}
      </div>

      <ModalForm onClose={() => setCertificateOpen(false)} onSubmit={saveCertificate} open={certificateOpen} submitLabel={editingCertificate ? "Save Certificate" : "Add Certificate"} title={editingCertificate ? "Edit Certificate" : "Add Certificate"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, certificateNo: event.target.value })} placeholder="Certificate / Activity No." required value={certificateForm.certificateNo} />
          <select className="h-11 rounded-md border border-slate-300 px-3 sm:col-span-2" onChange={(event) => setCertificateForm({ ...certificateForm, certificateFormat: event.target.value as CertificateFormat })} value={certificateForm.certificateFormat ?? "participation"}>
            <option value="participation">Certificate of Participation</option>
            <option value="certification">CERTIFICATION</option>
          </select>
          {(certificateForm.certificateFormat ?? "participation") !== "certification" && (
            <>
              <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, eventType: event.target.value as CertificateEventType })} value={certificateForm.eventType}>
                {certificateEventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input className="h-11 rounded-md border border-slate-300 px-3" min={0} onChange={(event) => setCertificateForm({ ...certificateForm, defaultHoursAttended: Number(event.target.value) })} placeholder="Default hours" step="0.5" type="number" value={certificateForm.defaultHoursAttended ?? 0} />
              <input className="h-11 rounded-md border border-slate-300 px-3 sm:col-span-2" onChange={(event) => setCertificateForm({ ...certificateForm, eventTitle: event.target.value })} placeholder="Activity title" required value={certificateForm.eventTitle} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, startDate: event.target.value })} required type="date" value={certificateForm.startDate} />
              <input className="h-11 rounded-md border border-slate-300 px-3" min={certificateForm.startDate} onChange={(event) => setCertificateForm({ ...certificateForm, endDate: event.target.value })} required type="date" value={certificateForm.endDate} />
              <input className="h-11 rounded-md border border-slate-300 px-3 sm:col-span-2" onChange={(event) => setCertificateForm({ ...certificateForm, venue: event.target.value })} placeholder="Venue" required value={certificateForm.venue} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, issuedDate: event.target.value })} required type="date" value={certificateForm.issuedDate} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, issuedBy: event.target.value })} placeholder="Issued by" required value={certificateForm.issuedBy} />
            </>
          )}
          {(certificateForm.certificateFormat ?? "participation") === "certification" && (
            <>
              <input className="h-11 rounded-md border border-slate-300 px-3 sm:col-span-2" onChange={(event) => setCertificateForm({ ...certificateForm, eventTitle: event.target.value })} placeholder="Certification title / purpose" required value={certificateForm.eventTitle} />
              <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, certificationType: event.target.value as CertificationType })} value={certificateForm.certificationType ?? "esat"}>
                <option value="esat">ESAT Certification</option>
                <option value="standard">Standard Certification</option>
              </select>
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, schoolYear: event.target.value })} placeholder="School Year" required value={certificateForm.schoolYear ?? ""} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, issuedDate: event.target.value })} required type="date" value={certificateForm.issuedDate} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, venue: event.target.value })} placeholder="Venue" required value={certificateForm.venue} />
            </>
          )}
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, certificationSignatoryName: event.target.value })} placeholder="Certification signatory name" required={(certificateForm.certificateFormat ?? "participation") === "certification"} value={certificateForm.certificationSignatoryName ?? ""} />
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, certificationSignatoryTitle: event.target.value })} placeholder="Signatory position / title" value={certificateForm.certificationSignatoryTitle ?? ""} />
          {(certificateForm.certificateFormat ?? "participation") !== "certification" && (
            <>
              <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setCertificateForm({ ...certificateForm, status: event.target.value as CertificateStatus })} value={certificateForm.status}>
                <option value="valid">Valid</option>
                <option value="revoked">Revoked</option>
              </select>
              <label className="flex h-11 items-center gap-3 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
                <input checked={certificateForm.publicAccess} className="h-4 w-4 rounded border-slate-300" onChange={(event) => setCertificateForm({ ...certificateForm, publicAccess: event.target.checked })} type="checkbox" />
                Public QR validation enabled
              </label>
            </>
          )}
          <textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2 sm:col-span-2" onChange={(event) => setCertificateForm({ ...certificateForm, notes: event.target.value })} placeholder="Optional remarks" value={certificateForm.notes} />
        </div>
      </ModalForm>

      <ModalForm onClose={() => setParticipantOpen(false)} onSubmit={saveParticipant} open={participantOpen} submitLabel={editingParticipant ? "Save Participant" : "Add Participant"} title={editingParticipant ? "Edit Participant" : "Add Participant"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setParticipantForm({ ...participantForm, certificateNo: event.target.value })} placeholder="Certificate / Control No." required value={participantForm.certificateNo} />
          <input className="h-11 rounded-md border border-slate-300 px-3" min={0} onChange={(event) => setParticipantForm({ ...participantForm, hoursAttended: Number(event.target.value) })} placeholder="Hours attended" required step="0.5" type="number" value={participantForm.hoursAttended} />
          {editingParticipant ? (
            <>
              <input className="h-11 rounded-md border border-slate-300 px-3 sm:col-span-2" onChange={(event) => setParticipantForm({ ...participantForm, participantName: event.target.value })} placeholder="Participant name" required value={participantForm.participantName} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setParticipantForm({ ...participantForm, participantRole: event.target.value })} placeholder="Participant role / position" value={participantForm.participantRole} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setParticipantForm({ ...participantForm, participantOffice: event.target.value })} placeholder="Office / department" value={participantForm.participantOffice} />
            </>
          ) : (
            renderPersonnelPicker()
          )}
          <select className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setParticipantForm({ ...participantForm, status: event.target.value as CertificateStatus })} value={participantForm.status}>
            <option value="valid">Valid</option>
            <option value="revoked">Revoked</option>
          </select>
          <label className="flex h-11 items-center gap-3 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
            <input checked={participantForm.publicAccess} className="h-4 w-4 rounded border-slate-300" onChange={(event) => setParticipantForm({ ...participantForm, publicAccess: event.target.checked })} type="checkbox" />
            Public QR validation enabled
          </label>
          <textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2 sm:col-span-2" onChange={(event) => setParticipantForm({ ...participantForm, notes: event.target.value })} placeholder="Optional remarks" value={participantForm.notes} />
          {editingParticipant && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 sm:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <img alt="" className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1" src={getQrUrl(editingParticipant.participantId)} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Validation URL</p>
                  <p className="mt-2 break-all text-sm text-slate-600">{getValidationUrl(editingParticipant.participantId)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </ModalForm>

      <ModalForm onClose={() => setPersonOpen(false)} onSubmit={savePerson} open={personOpen} submitLabel={editingPerson ? "Save" : "Add"} title={editingPerson ? "Edit Person" : personType === "speaker_facilitator" ? "Add Speaker / Facilitator" : "Add TWG Member"}>
        <div className="grid gap-4 sm:grid-cols-2">
          {editingPerson ? (
            <>
              <input className="h-11 rounded-md border border-slate-300 px-3 sm:col-span-2" onChange={(event) => setPersonForm({ ...personForm, fullName: event.target.value })} placeholder="Full name" required value={personForm.fullName} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setPersonForm({ ...personForm, roleOrPosition: event.target.value })} placeholder="Role / position" value={personForm.roleOrPosition} />
              <input className="h-11 rounded-md border border-slate-300 px-3" onChange={(event) => setPersonForm({ ...personForm, office: event.target.value })} placeholder="Office / department" value={personForm.office} />
            </>
          ) : (
            renderPersonnelPicker()
          )}
          <textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2 sm:col-span-2" onChange={(event) => setPersonForm({ ...personForm, notes: event.target.value })} placeholder="Optional remarks" value={personForm.notes} />
        </div>
      </ModalForm>
    </section>
  );
}
