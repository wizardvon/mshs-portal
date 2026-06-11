import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";

export function subscribeCollection<T extends DocumentData>(
  collectionName: string,
  callback: (records: T[]) => void,
  constraints: QueryConstraint[] = [orderBy("createdAt", "desc")],
): Unsubscribe {
  const collectionQuery = query(collection(db, collectionName), ...constraints);
  return onSnapshot(collectionQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as T));
  });
}

export async function createRecord<T extends Record<string, unknown>>(
  collectionName: string,
  idField: keyof T,
  data: Omit<T, keyof { createdAt: unknown; updatedAt: unknown }>,
) {
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(ref, {
    [idField]: ref.id,
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateRecord<T extends Record<string, unknown>>(
  collectionName: string,
  recordId: string,
  data: Partial<T>,
) {
  return updateDoc(doc(db, collectionName, recordId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRecord(collectionName: string, recordId: string) {
  return deleteDoc(doc(db, collectionName, recordId));
}
