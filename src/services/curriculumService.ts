import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { CurriculumMapping } from "../types/loading";
import { deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

export const subscribeCurriculumMappings = (
  callback: (mappings: CurriculumMapping[]) => void,
) => subscribeCollection<CurriculumMapping>("curriculumMappings", callback);

export function getCurriculumMappingId(
  schoolYear: string,
  term: string,
  sectionId: string,
  subjectId: string,
) {
  return [schoolYear, term, sectionId, subjectId]
    .map((value) => value.replace(/[^a-zA-Z0-9]/g, "_"))
    .join("__");
}

export const createCurriculumMapping = async (
  mapping: Omit<CurriculumMapping, "mappingId" | "createdAt" | "updatedAt">,
) => {
  const mappingId = getCurriculumMappingId(
    mapping.schoolYear,
    mapping.term,
    mapping.sectionId,
    mapping.subjectId,
  );

  await setDoc(
    doc(db, "curriculumMappings", mappingId),
    {
      ...mapping,
      mappingId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return mappingId;
};

export const updateCurriculumMapping = (
  mappingId: string,
  mapping: Partial<CurriculumMapping>,
) => updateRecord<CurriculumMapping>("curriculumMappings", mappingId, mapping);

export const deleteCurriculumMapping = (mappingId: string) =>
  deleteRecord("curriculumMappings", mappingId);
