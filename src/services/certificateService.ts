import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { CertificateParticipant, CertificatePerson, CertificatePersonType, CertificateRecord } from "../types";
import { createRecord, deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

export const certificateStatuses = ["valid", "revoked"] as const;

export const subscribeCertificates = (callback: (certificates: CertificateRecord[]) => void) =>
  subscribeCollection<CertificateRecord>("certificates", callback, [orderBy("startDate", "desc")]);

export async function getCertificate(certificateId: string) {
  const snapshot = await getDoc(doc(db, "certificates", certificateId));
  return snapshot.exists() ? (snapshot.data() as CertificateRecord) : null;
}

export const createCertificate = (
  certificate: Omit<CertificateRecord, "certificateId" | "createdAt" | "updatedAt">,
) => createRecord<CertificateRecord>("certificates", "certificateId", certificate as CertificateRecord);

export const updateCertificate = (
  certificateId: string,
  certificate: Partial<CertificateRecord>,
) => updateRecord<CertificateRecord>("certificates", certificateId, certificate);

export async function deleteCertificate(certificateId: string) {
  const participantsQuery = query(
    collection(db, "certificateParticipants"),
    where("certificateId", "==", certificateId),
  );
  const peopleQuery = query(
    collection(db, "certificatePeople"),
    where("certificateId", "==", certificateId),
  );
  const [participantsSnapshot, peopleSnapshot] = await Promise.all([
    getDocs(participantsQuery),
    getDocs(peopleQuery),
  ]);
  await Promise.all([
    ...participantsSnapshot.docs.map((item) => deleteRecord("certificateParticipants", item.id)),
    ...peopleSnapshot.docs.map((item) => deleteRecord("certificatePeople", item.id)),
  ]);
  return deleteRecord("certificates", certificateId);
}

export const subscribeCertificateParticipants = (
  certificateId: string,
  callback: (participants: CertificateParticipant[]) => void,
) => {
  const participantsQuery = query(
    collection(db, "certificateParticipants"),
    where("certificateId", "==", certificateId),
  );

  return onSnapshot(participantsQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as CertificateParticipant)
        .sort((first, second) => first.participantName.localeCompare(second.participantName)),
    );
  });
};

export const subscribeCertificateParticipantsByUser = (
  userId: string,
  callback: (participants: CertificateParticipant[]) => void,
) => {
  const participantsQuery = query(
    collection(db, "certificateParticipants"),
    where("participantUserId", "==", userId),
  );

  return onSnapshot(participantsQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as CertificateParticipant)
        .sort((first, second) => first.participantName.localeCompare(second.participantName)),
    );
  });
};

export const subscribeCertificateParticipantsByStaff = (
  staffId: string,
  callback: (participants: CertificateParticipant[]) => void,
) => {
  const participantsQuery = query(
    collection(db, "certificateParticipants"),
    where("participantStaffId", "==", staffId),
  );

  return onSnapshot(participantsQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as CertificateParticipant)
        .sort((first, second) => first.participantName.localeCompare(second.participantName)),
    );
  });
};

export const createCertificateParticipant = (
  participant: Omit<CertificateParticipant, "participantId" | "createdAt" | "updatedAt">,
) =>
  createRecord<CertificateParticipant>(
    "certificateParticipants",
    "participantId",
    participant as CertificateParticipant,
  );

export const updateCertificateParticipant = (
  participantId: string,
  participant: Partial<CertificateParticipant>,
) => updateRecord<CertificateParticipant>("certificateParticipants", participantId, participant);

export const deleteCertificateParticipant = (participantId: string) =>
  deleteRecord("certificateParticipants", participantId);

export const subscribeCertificatePeople = (
  certificateId: string,
  personType: CertificatePersonType,
  callback: (people: CertificatePerson[]) => void,
) => {
  const peopleQuery = query(
    collection(db, "certificatePeople"),
    where("certificateId", "==", certificateId),
    where("personType", "==", personType),
  );

  return onSnapshot(peopleQuery, (snapshot) => {
    callback(
      snapshot.docs
        .map((item) => item.data() as CertificatePerson)
        .sort((first, second) => first.fullName.localeCompare(second.fullName)),
    );
  });
};

export const createCertificatePerson = (
  person: Omit<CertificatePerson, "personId" | "createdAt" | "updatedAt">,
) =>
  createRecord<CertificatePerson>(
    "certificatePeople",
    "personId",
    person as CertificatePerson,
  );

export const updateCertificatePerson = (
  personId: string,
  person: Partial<CertificatePerson>,
) => updateRecord<CertificatePerson>("certificatePeople", personId, person);

export const deleteCertificatePerson = (personId: string) =>
  deleteRecord("certificatePeople", personId);

export async function getPublicCertificate(certificateId: string) {
  const snapshot = await getDoc(doc(db, "certificates", certificateId));
  return snapshot.exists() ? (snapshot.data() as CertificateRecord) : null;
}

export async function getPublicCertificateParticipant(participantId: string) {
  const participantSnapshot = await getDoc(doc(db, "certificateParticipants", participantId));
  return participantSnapshot.exists()
    ? (participantSnapshot.data() as CertificateParticipant)
    : null;
}
