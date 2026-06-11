import type { AncillaryLoad } from "../types/loading";
import { createRecord, deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

export const subscribeAncillaryLoads = (callback: (loads: AncillaryLoad[]) => void) =>
  subscribeCollection<AncillaryLoad>("ancillaryLoads", callback);

export const createAncillaryLoad = (
  load: Omit<AncillaryLoad, "ancillaryLoadId" | "createdAt" | "updatedAt">,
) => createRecord<AncillaryLoad>("ancillaryLoads", "ancillaryLoadId", load as AncillaryLoad);

export const deleteAncillaryLoad = (ancillaryLoadId: string) =>
  deleteRecord("ancillaryLoads", ancillaryLoadId);

export const updateAncillaryLoad = (
  ancillaryLoadId: string,
  load: Partial<AncillaryLoad>,
) => updateRecord<AncillaryLoad>("ancillaryLoads", ancillaryLoadId, load);
