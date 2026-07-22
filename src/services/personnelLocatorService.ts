import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { PersonnelLocation } from "../types/loading";

export function subscribePersonnelLocations(
  callback: (locations: PersonnelLocation[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, "personnelLocations"), (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as PersonnelLocation));
  });
}

export async function upsertPersonnelLocation(
  location: Omit<PersonnelLocation, "locationId" | "createdAt" | "updatedAt">,
) {
  await setDoc(
    doc(db, "personnelLocations", location.staffId),
    {
      ...location,
      locationId: location.staffId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return location.staffId;
}
