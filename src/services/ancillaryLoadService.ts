import type { AncillaryLoad } from "../types/loading";
import { withLegacyUnits } from "../utils/loadHours";
import { createRecord, deleteRecord, subscribeCollection, updateRecord } from "./firestoreCrud";

export const subscribeAncillaryLoads = (callback: (loads: AncillaryLoad[]) => void) =>
  subscribeCollection<AncillaryLoad>("ancillaryLoads", callback);

export const createAncillaryLoad = (
  load: Omit<AncillaryLoad, "ancillaryLoadId" | "createdAt" | "updatedAt">,
) => createRecord<AncillaryLoad>("ancillaryLoads", "ancillaryLoadId", {
  ...load,
  ...withLegacyUnits(load.loadHours ?? load.units),
} as AncillaryLoad);

export const deleteAncillaryLoad = (ancillaryLoadId: string) =>
  deleteRecord("ancillaryLoads", ancillaryLoadId);

export const updateAncillaryLoad = (
  ancillaryLoadId: string,
  load: Partial<AncillaryLoad>,
) =>
  updateRecord<AncillaryLoad>(
    "ancillaryLoads",
    ancillaryLoadId,
    load.units !== undefined || load.loadHours !== undefined
      ? {
          ...load,
          ...withLegacyUnits(load.loadHours ?? load.units),
        }
      : load,
  );
