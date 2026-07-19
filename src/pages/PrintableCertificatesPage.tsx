import { Award, FileText, Printer, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import certificateFooter from "../assets/print/footer.jpg";
import certificateHeader from "../assets/print/header.jpg";
import { DataTable, type DataColumn } from "../components/common/DataTable";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useAuth } from "../providers/AuthProvider";
import {
  getCertificate,
  subscribeCertificateParticipants,
  subscribeCertificateParticipantsByStaff,
  subscribeCertificateParticipantsByUser,
  subscribeCertificates,
} from "../services/certificateService";
import type { CertificateFormat, CertificateParticipant, CertificateRecord } from "../types";

const formatLabels: Record<CertificateFormat, string> = {
  certification: "CERTIFICATION",
  participation: "Certificate of Participation",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatIssuedDateAsGiven(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  const monthYear = date.toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
  return `${day}${suffix} day of ${monthYear}`;
}

function getCertificateStart(certificate: Pick<CertificateRecord, "startDate" | "eventDate">) {
  return certificate.startDate || certificate.eventDate || "";
}

function getCertificateEnd(certificate: Pick<CertificateRecord, "endDate" | "startDate" | "eventDate">) {
  return certificate.endDate || certificate.startDate || certificate.eventDate || "";
}

function getDateRange(certificate: Pick<CertificateRecord, "startDate" | "endDate" | "eventDate">) {
  const startDate = getCertificateStart(certificate);
  const endDate = getCertificateEnd(certificate);
  if (!startDate && !endDate) return "No date set";
  if (!endDate || startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

function getValidationUrl(participantId: string) {
  return `${window.location.origin}/verify-certificate/${participantId}`;
}

function getQrUrl(participantId: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
    getValidationUrl(participantId),
  )}`;
}

function certificateBody(format: CertificateFormat, participant: CertificateParticipant, certificate: CertificateRecord) {
  const eventTitle = escapeHtml(certificate.eventTitle);
  const dateRange = escapeHtml(getDateRange(certificate));
  const venue = escapeHtml(certificate.venue);
  const hours = Number(participant.hoursAttended || 0);

  if (format === "certification") {
    return `This certifies that <strong>${escapeHtml(participant.participantName)}</strong> has attended and completed the requirements of <strong>${eventTitle}</strong>, conducted on ${dateRange} at ${venue}${hours ? ` for ${hours} hour${hours === 1 ? "" : "s"}` : ""}.`;
  }

  return `is hereby awarded this certificate for actively participating in <strong>${eventTitle}</strong>, conducted on ${dateRange} at ${venue}${hours ? ` with ${hours} hour${hours === 1 ? "" : "s"} of participation` : ""}.`;
}

function buildParticipationPage(
  certificate: CertificateRecord,
  participant: CertificateParticipant,
) {
  const format: CertificateFormat = "participation";
  const validationUrl = getValidationUrl(participant.participantId);
  const signatoryName =
    certificate.certificationSignatoryName || certificate.issuedBy || "Mataasnakahoy Senior High School";
  const signatoryTitle =
    certificate.certificationSignatoryTitle || "Issuing Office / Authorized Signatory";

  return `
    <section class="certificate-page">
      <img class="certificate-header" src="${certificateHeader}" alt="" />
      <img class="certificate-footer" src="${certificateFooter}" alt="" />
      <div class="certificate-content">
        <h1>${escapeHtml(formatLabels[format])}</h1>
        <p class="presented">This is presented to</p>
        <p class="recipient">${escapeHtml(participant.participantName)}</p>
        <p class="role">${escapeHtml(participant.participantRole || participant.participantOffice || "Participant")}</p>
        <p class="body">${certificateBody(format, participant, certificate)}</p>
        <div class="meta-row">
          <div>
            <span>Certificate No.</span>
            <strong>${escapeHtml(participant.certificateNo)}</strong>
          </div>
          <div>
            <span>Date Issued</span>
            <strong>${escapeHtml(formatDate(certificate.issuedDate))}</strong>
          </div>
        </div>
        <div class="signature">
          <strong>${escapeHtml(signatoryName)}</strong>
          <span>${escapeHtml(signatoryTitle)}</span>
        </div>
      </div>
      <div class="qr-block">
        <img src="${getQrUrl(participant.participantId)}" alt="" />
        <span>Verify</span>
        <small>${escapeHtml(validationUrl)}</small>
      </div>
    </section>
  `;
}

function buildCertificationPage(certificate: CertificateRecord, participant: CertificateParticipant) {
  const schoolName = participant.participantOffice || "Mataasnakahoy Senior High School";
  const position = participant.participantRole || "Teacher";
  const schoolYear = certificate.schoolYear || "__________";
  const venue = certificate.venue || "Mataasnakahoy Senior High School, Bayorbor, Mataasnakahoy, Batangas";
  const signatoryName =
    certificate.certificationSignatoryName || certificate.issuedBy || "Mataasnakahoy Senior High School";
  const signatoryTitle = certificate.certificationSignatoryTitle || "Authorized Signatory";
  const activity =
    certificate.certificationType === "esat"
      ? "Electronic Self-Assessment Tool (ESAT) for Proficient Teachers"
      : certificate.eventTitle;

  return `
    <section class="certificate-page certification-page">
      <img class="certificate-header" src="${certificateHeader}" alt="" />
      <img class="certificate-footer" src="${certificateFooter}" alt="" />
      <div class="certification-letter">
        <h1>C E R T I F I C A T I O N</h1>
        <p class="salutation">To Whom It May Concern,</p>
        <p>
          This is to certify that <strong>${escapeHtml(participant.participantName)}</strong>,
          <strong>${escapeHtml(position)}</strong> of <strong>${escapeHtml(schoolName)}</strong>,
          has successfully completed the <strong>${escapeHtml(activity)}</strong>
          this School Year <strong>${escapeHtml(schoolYear)}</strong>.
        </p>
        <p>
          Given this <strong>${escapeHtml(formatIssuedDateAsGiven(certificate.issuedDate))}</strong>
          at <strong>${escapeHtml(venue)}</strong>.
        </p>
        <div class="certification-signature">
          <p>Certified True and Correct:</p>
          <div>
            <strong>${escapeHtml(signatoryName)}</strong>
            <span>${escapeHtml(signatoryTitle)}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildCertificatePage(
  format: CertificateFormat,
  certificate: CertificateRecord,
  participant: CertificateParticipant,
) {
  return format === "certification"
    ? buildCertificationPage(certificate, participant)
    : buildParticipationPage(certificate, participant);
}

function openPrintableCertificates(
  format: CertificateFormat,
  certificate: CertificateRecord,
  participants: CertificateParticipant[],
) {
  const printWindow = window.open("", "_blank", "width=1200,height=850");
  if (!printWindow) {
    window.print();
    return;
  }

  const pages = participants
    .map((participant) => buildCertificatePage(format, certificate, participant))
    .join("");

  const isCertification = format === "certification";

  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(formatLabels[format])} - ${escapeHtml(certificate.eventTitle)}</title>
    <style>
      @page { size: A4 ${isCertification ? "portrait" : "landscape"}; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #e2e8f0; color: #111827; font-family: Georgia, "Times New Roman", serif; }
      .no-print { position: fixed; z-index: 20; top: 14px; left: 14px; border: 0; border-radius: 8px; background: #7f1d1d; color: white; padding: 10px 14px; font: 700 13px Arial, sans-serif; cursor: pointer; }
      .certificate-page { position: relative; width: 297mm; height: 210mm; overflow: hidden; background: #fffdf7; page-break-after: always; }
      .certification-page { width: 210mm; height: 297mm; background: white; }
      .certificate-page:last-child { page-break-after: auto; }
      .certificate-header { position: absolute; top: 0; left: 50%; width: 88%; height: auto; display: block; transform: translateX(-50%); }
      .certificate-footer { position: absolute; bottom: 0; left: 50%; width: 88%; height: auto; display: block; transform: translateX(-50%); }
      .certificate-content { position: absolute; left: 34mm; right: 34mm; top: 66mm; bottom: 29mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
      h1 { margin: 0; color: #7f1d1d; font-size: 30px; line-height: 1.1; letter-spacing: 0; text-transform: uppercase; }
      .presented { margin: 6mm 0 3mm; font-size: 16px; }
      .recipient { margin: 0; max-width: 220mm; border-bottom: 1px solid #7f1d1d; color: #111827; font-size: 34px; font-weight: 700; line-height: 1.12; padding: 0 16mm 1.5mm; }
      .role { margin: 2mm 0 5mm; color: #475569; font: 700 12px Arial, sans-serif; text-transform: uppercase; }
      .body { max-width: 218mm; margin: 0; font-size: 16px; line-height: 1.65; }
      .meta-row { display: flex; justify-content: center; gap: 18mm; margin-top: 7mm; font: 12px Arial, sans-serif; color: #475569; }
      .meta-row div { min-width: 42mm; }
      .meta-row span, .signature span, .qr-block span { display: block; text-transform: uppercase; font-size: 10px; font-weight: 700; letter-spacing: 0; color: #64748b; }
      .meta-row strong { display: block; margin-top: 2mm; color: #111827; font-size: 14px; }
      .signature { margin-top: 16mm; min-width: 82mm; border-top: 1px solid #111827; padding-top: 1.5mm; font: 12px Arial, sans-serif; }
      .signature strong { display: block; font-size: 13px; text-transform: uppercase; }
      .qr-block { position: absolute; right: 18mm; bottom: 31mm; width: 24mm; text-align: center; font-family: Arial, sans-serif; }
      .qr-block img { width: 21mm; height: 21mm; }
      .qr-block small { display: none; }
      .certification-page .certificate-header { top: 0; width: 100%; }
      .certification-page .certificate-footer { bottom: 0; width: 100%; }
      .certification-letter { position: absolute; left: 24mm; right: 24mm; top: 71mm; bottom: 38mm; color: #111827; font-family: Georgia, "Times New Roman", serif; font-size: 15px; line-height: 1.9; text-align: justify; }
      .certification-letter h1 { margin: 0 0 17mm; color: #111827; font-size: 28px; font-weight: 700; text-align: center; letter-spacing: 0; }
      .certification-letter .salutation { margin-bottom: 10mm; }
      .certification-letter p { margin: 0 0 8mm; }
      .certification-signature { margin-top: 24mm; }
      .certification-signature p { margin-bottom: 18mm; }
      .certification-signature div { width: 85mm; text-align: center; }
      .certification-signature strong { display: block; border-bottom: 1px solid #111827; font-family: Arial, sans-serif; font-size: 13px; text-transform: uppercase; }
      .certification-signature span { display: block; margin-top: 1.5mm; font-family: Arial, sans-serif; font-size: 12px; }
      @media print {
        body { background: white; }
        .no-print { display: none; }
      }
    </style>
  </head>
  <body>
    <button class="no-print" onclick="window.print()">Print / Save as PDF</button>
    ${pages || "<p>No participants selected.</p>"}
    <script>window.addEventListener("load", () => setTimeout(() => window.print(), 350));</script>
  </body>
</html>`);
  printWindow.document.close();
}

export function PrintableCertificatesPage() {
  const { profile } = useAuth();
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [participants, setParticipants] = useState<CertificateParticipant[]>([]);
  const [assignedParticipants, setAssignedParticipants] = useState<CertificateParticipant[]>([]);
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [selectedParticipantId, setSelectedParticipantId] = useState("all");
  const [search, setSearch] = useState("");
  const isCertificateAdmin = profile?.role === "super_admin" || profile?.role === "admin";

  useEffect(() => {
    if (!isCertificateAdmin) return undefined;
    return subscribeCertificates(setCertificates);
  }, [isCertificateAdmin]);

  useEffect(() => {
    if (isCertificateAdmin || !profile?.userId) {
      setAssignedParticipants([]);
      return undefined;
    }

    let userParticipants: CertificateParticipant[] = [];
    let staffParticipants: CertificateParticipant[] = [];

    function publishAssignedParticipants() {
      const participantMap = new Map<string, CertificateParticipant>();
      [...userParticipants, ...staffParticipants].forEach((participant) => {
        participantMap.set(participant.participantId, participant);
      });
      setAssignedParticipants(Array.from(participantMap.values()));
    }

    const unsubscribeUser = subscribeCertificateParticipantsByUser(profile.userId, (nextParticipants) => {
      userParticipants = nextParticipants;
      publishAssignedParticipants();
    });
    const unsubscribeStaff = profile.assignedTeacherId
      ? subscribeCertificateParticipantsByStaff(profile.assignedTeacherId, (nextParticipants) => {
          staffParticipants = nextParticipants;
          publishAssignedParticipants();
        })
      : undefined;

    return () => {
      unsubscribeUser();
      unsubscribeStaff?.();
    };
  }, [isCertificateAdmin, profile?.assignedTeacherId, profile?.userId]);

  useEffect(() => {
    if (isCertificateAdmin) return;
    const certificateIds = Array.from(
      new Set(assignedParticipants.map((participant) => participant.certificateId).filter(Boolean)),
    );
    if (certificateIds.length === 0) {
      setCertificates([]);
      setParticipants([]);
      setSelectedCertificateId("");
      return;
    }

    let cancelled = false;
    Promise.all(certificateIds.map((certificateId) => getCertificate(certificateId))).then((records) => {
      if (cancelled) return;
      const visibleCertificates = records
        .filter((certificate): certificate is CertificateRecord => Boolean(certificate))
        .sort((first, second) => (second.startDate || "").localeCompare(first.startDate || ""));
      setCertificates(visibleCertificates);
    });

    return () => {
      cancelled = true;
    };
  }, [assignedParticipants, isCertificateAdmin]);

  const selectedCertificate = useMemo(
    () => certificates.find((certificate) => certificate.certificateId === selectedCertificateId) ?? null,
    [certificates, selectedCertificateId],
  );
  const format = selectedCertificate?.certificateFormat ?? "participation";

  useEffect(() => {
    setParticipants([]);
    setSelectedParticipantId("all");
    if (!selectedCertificateId) return undefined;
    if (!isCertificateAdmin) {
      setParticipants(
        assignedParticipants.filter((participant) => participant.certificateId === selectedCertificateId),
      );
      return undefined;
    }
    return subscribeCertificateParticipants(selectedCertificateId, setParticipants);
  }, [assignedParticipants, isCertificateAdmin, selectedCertificateId]);

  useEffect(() => {
    if (!selectedCertificateId && certificates.length) {
      setSelectedCertificateId(certificates[0].certificateId);
    }
  }, [certificates, selectedCertificateId]);

  const visibleParticipants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((participant) =>
      [
        participant.participantName,
        participant.certificateNo,
        participant.participantRole,
        participant.participantOffice,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [participants, search]);

  const selectedParticipants = useMemo(() => {
    if (selectedParticipantId === "all") return visibleParticipants;
    return participants.filter((participant) => participant.participantId === selectedParticipantId);
  }, [participants, selectedParticipantId, visibleParticipants]);

  function handlePrint() {
    if (!selectedCertificate || selectedParticipants.length === 0) return;
    openPrintableCertificates(format, selectedCertificate, selectedParticipants);
  }

  const participantColumns: DataColumn<CertificateParticipant>[] = [
    {
      header: "Participant",
      render: (participant) => (
        <button
          className="text-left"
          onClick={() => setSelectedParticipantId(participant.participantId)}
          type="button"
        >
          <span className="block font-semibold text-civic hover:underline">{participant.participantName}</span>
          <span className="mt-1 block text-xs text-slate-500">{participant.participantRole || participant.participantOffice || "Participant"}</span>
        </button>
      ),
    },
    { header: "Certificate No.", render: (participant) => participant.certificateNo },
    { header: "Office", render: (participant) => participant.participantOffice || "Not set" },
    {
      header: "Status",
      render: (participant) => (
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={participant.status} tone={participant.status === "valid" ? "green" : "red"} />
          {!participant.publicAccess && <StatusBadge label="private" tone="slate" />}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Printable Certificates"
        description={isCertificateAdmin ? "Pull the saved format, signatory, activity details, and participants from the Certificates module, then print with the established certificate header and footer." : "Print certificates assigned to your personnel profile."}
        actions={
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-civic px-3 text-sm font-semibold text-white shadow-sm hover:bg-wine disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!selectedCertificate || selectedParticipants.length === 0}
            onClick={handlePrint}
            type="button"
          >
            <Printer size={16} /> Print / PDF
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Activities</p>
              <p className="mt-3 text-3xl font-bold text-ink">{certificates.length}</p>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-civic ring-1 ring-red-100">
              <Award size={20} />
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Participants</p>
              <p className="mt-3 text-3xl font-bold text-ink">{participants.length}</p>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-civic ring-1 ring-red-100">
              <UsersRound size={20} />
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Selected Format</p>
              <p className="mt-3 text-xl font-bold text-ink">{formatLabels[format]}</p>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-civic ring-1 ring-red-100">
              <FileText size={20} />
            </div>
          </div>
        </article>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Certificate Activity</span>
              <select
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                onChange={(event) => setSelectedCertificateId(event.target.value)}
                value={selectedCertificateId}
              >
                {certificates.length === 0 && <option value="">No certificate activities yet</option>}
                {certificates.map((certificate) => (
                  <option key={certificate.certificateId} value={certificate.certificateId}>
                    {certificate.certificateNo} - {certificate.eventTitle}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Participant</span>
              <select
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
                onChange={(event) => setSelectedParticipantId(event.target.value)}
                value={selectedParticipantId}
              >
                <option value="all">All visible participants</option>
                {participants.map((participant) => (
                  <option key={participant.participantId} value={participant.participantId}>
                    {participant.participantName}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Format</span>
              <div className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                {formatLabels[format]}
              </div>
            </div>
            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Search Participants</span>
              <div className="flex h-11 items-center gap-2 rounded-md border border-slate-300 px-3">
                <Search size={16} className="text-slate-400" />
                <input
                  className="min-w-0 flex-1 border-0 text-sm outline-none"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, office, certificate no."
                  value={search}
                />
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-800">Established Certificate Format</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              This module uses the uploaded header and footer assets. The certificate type and signatory are set in the Certificates module.
            </p>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img alt="Certificate header preview" className="w-full" src={certificateHeader} />
              <div className="grid min-h-24 place-items-center px-4 text-center text-sm font-bold text-civic">
                {formatLabels[format]}
              </div>
              <img alt="Certificate footer preview" className="w-full" src={certificateFooter} />
            </div>
          </div>
        </div>
      </section>

      {selectedCertificate && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-5">
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Activity</p>
              <p className="mt-1 font-semibold text-ink">{selectedCertificate.eventTitle}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Type</p>
              <p className="mt-1">{selectedCertificate.eventType}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Date</p>
              <p className="mt-1">{getDateRange(selectedCertificate)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Venue</p>
              <p className="mt-1">{selectedCertificate.venue}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Signatory</p>
              <p className="mt-1">{selectedCertificate.certificationSignatoryName || selectedCertificate.issuedBy}</p>
            </div>
            {format === "certification" && (
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">School Year</p>
                <p className="mt-1">{selectedCertificate.schoolYear || "Not set"}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="mt-5">
        <DataTable
          columns={participantColumns}
          data={visibleParticipants}
          emptyText="No participants found for the selected certificate activity."
          getKey={(participant) => participant.participantId}
        />
      </div>
    </div>
  );
}
