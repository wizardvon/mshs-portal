import type { Section } from "../types/loading";
import { createRecord, deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

export const subscribeSections = (callback: (sections: Section[]) => void) =>
  subscribeCollection<Section>("sections", callback);

export const createSection = (section: Omit<Section, "sectionId" | "createdAt" | "updatedAt">) =>
  createRecord<Section>("sections", "sectionId", section as Section);

export const updateSection = (sectionId: string, section: Partial<Section>) =>
  updateRecord<Section>("sections", sectionId, section);

export const deleteSection = (sectionId: string) => deleteRecord("sections", sectionId);
