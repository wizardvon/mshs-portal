import { FirebaseError } from "firebase/app";
import { AlertTriangle, Award, CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getPublicCertificate,
  getPublicCertificateParticipant,
} from "../services/certificateService";
import type { CertificateFormat, CertificateParticipant, CertificateRecord } from "../types";

const certificateFormatLabels: Record<CertificateFormat, string> = {
  certification: "CERTIFICATION",
  participation: "Certificate of Participation",
  recognition: "Certificate of Recognition",
};

function formatDate(value: string) {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value || "Not specified"}</p>
    </div>
  );
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
  if (!startDate && !endDate) return "Not specified";
  if (!endDate || startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

export function CertificateVerificationPage() {
  const { certificateId: participantId } = useParams();
  const [certificate, setCertificate] = useState<CertificateRecord | null>(null);
  const [participant, setParticipant] = useState<CertificateParticipant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCertificate() {
      if (!participantId) {
        setError("Missing certificate ID.");
        setLoading(false);
        return;
      }

      try {
        const participantRecord = await getPublicCertificateParticipant(participantId);
        const certificateRecord = participantRecord
          ? await getPublicCertificate(participantRecord.certificateId)
          : null;

        if (active) {
          setParticipant(participantRecord);
          setCertificate(certificateRecord);
        }
      } catch (caught) {
        console.error(caught);
        if (active) {
          if (caught instanceof FirebaseError && caught.code === "permission-denied") {
            setParticipant(null);
            setCertificate(null);
          } else {
            setError("This certificate cannot be verified right now.");
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCertificate();
    return () => {
      active = false;
    };
  }, [participantId]);

  const publicRecord = certificate?.publicAccess && participant?.publicAccess;
  const isValid = publicRecord && certificate?.status === "valid" && participant?.status === "valid";
  const isRevoked = certificate?.status === "revoked" || participant?.status === "revoked";
  const certificateFormat = certificate?.certificateFormat ?? "participation";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(242,184,30,0.18),transparent_28%),linear-gradient(135deg,#fff8f8_0%,#f6f7fb_48%,#fff4d8_100%)] px-5 py-8">
      <section className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <img
            alt="Mataasnakahoy Senior High School"
            className="h-14 w-14 object-contain"
            src="/school-logo.png"
          />
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-civic">Certificate Validation</p>
            <h1 className="text-2xl font-black tracking-tight text-ink">Mataasnakahoy Senior High School</h1>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-red-100 bg-white shadow-2xl shadow-red-950/10">
          <div className="bg-gradient-to-r from-wine to-civic px-6 py-6 text-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                  Public QR Verification
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">
                  {loading
                    ? "Checking certificate..."
                    : participant
                      ? participant.certificateNo
                      : "Certificate not found"}
                </h2>
              </div>
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20">
                {loading ? <ShieldCheck size={30} /> : isValid ? <CheckCircle2 size={30} /> : <XCircle size={30} />}
              </div>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-600">
                Verifying the certificate record...
              </div>
            ) : error ? (
              <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
                <AlertTriangle className="mt-0.5 shrink-0" size={20} />
                <p className="text-sm font-medium">{error}</p>
              </div>
            ) : !participant || !certificate || !publicRecord ? (
              <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
                <XCircle className="mt-0.5 shrink-0" size={20} />
                <div>
                  <p className="font-bold">Certificate not verified</p>
                  <p className="mt-1 text-sm">
                    No public validation record was found for this QR code.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={[
                    "mb-6 flex gap-3 rounded-2xl border p-5",
                    isRevoked
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800",
                  ].join(" ")}
                >
                  {isRevoked ? <XCircle className="mt-0.5 shrink-0" size={22} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={22} />}
                  <div>
                    <p className="font-bold">
                      {isRevoked ? "Certificate revoked" : "Certificate valid"}
                    </p>
                    <p className="mt-1 text-sm">
                      This public record was issued by {certificate.issuedBy}.
                    </p>
                  </div>
                </div>

                <div className={certificateFormat === "recognition" ? "mb-6 grid gap-4" : "mb-6 grid gap-4 lg:grid-cols-[1fr_220px]"}>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start gap-3">
                      <Award className="mt-1 shrink-0 text-civic" size={24} />
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                          Awarded to
                        </p>
                        <h3 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                          {participant.participantName}
                        </h3>
                        <p className="mt-2 text-sm font-medium text-slate-600">
                          {[participant.participantRole, participant.participantOffice].filter(Boolean).join(" - ")}
                        </p>
                        <p className="mt-2 text-sm font-bold text-civic">
                          {certificateFormatLabels[certificateFormat]}
                        </p>
                      </div>
                    </div>
                  </div>
                  {certificateFormat !== "recognition" && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                      <div className="flex items-center gap-3">
                        <Clock size={24} />
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide">Hours attended</p>
                          <p className="mt-1 text-3xl font-black">{Number(participant.hoursAttended || 0)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailItem label={certificateFormat === "recognition" ? "Recognition" : "Activity"} value={certificate.eventTitle} />
                  <DetailItem label="Format" value={certificateFormatLabels[certificateFormat]} />
                  <DetailItem label="Activity date" value={getDateRange(certificate)} />
                  <DetailItem label="Venue" value={certificate.venue} />
                  <DetailItem label="Date issued" value={formatDate(certificate.issuedDate)} />
                  <DetailItem label="Certificate No." value={participant.certificateNo} />
                  <DetailItem label="Verification ID" value={participant.participantId} />
                </div>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs font-medium text-slate-500">
          This page verifies records issued through MSHS Portal.{" "}
          <Link className="font-bold text-civic hover:underline" to="/login">Portal login</Link>
        </p>
      </section>
    </main>
  );
}
