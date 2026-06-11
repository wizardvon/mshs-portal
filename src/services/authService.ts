import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, db } from "../firebase";
import type { UserRole } from "../types";

type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
  requestedRole: Exclude<UserRole, "super_admin">;
};

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerUser({
  fullName,
  email,
  password,
  requestedRole,
}: RegisterInput) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { user } = credential;

  try {
    await updateProfile(user, { displayName: fullName });

    const profileRef = doc(db, "users", user.uid);
    const statsRef = doc(db, "system", "registration");

    await runTransaction(db, async (transaction) => {
      const statsSnap = await transaction.get(statsRef);
      const userCount = statsSnap.exists()
        ? Number(statsSnap.data().userCount ?? 0)
        : 0;
      const isFirstUser = userCount === 0;

      transaction.set(profileRef, {
        userId: user.uid,
        fullName,
        email: user.email ?? email,
        role: isFirstUser ? "super_admin" : requestedRole,
        status: isFirstUser ? "approved" : "pending",
        createdAt: serverTimestamp(),
      });

      transaction.set(
        statsRef,
        {
          userCount: increment(1),
          firstSuperAdminId: isFirstUser ? user.uid : statsSnap.data()?.firstSuperAdminId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
  } catch (error) {
    await deleteUser(user).catch(() => undefined);
    throw error;
  }

  return credential;
}

export async function bootstrapSuperAdminProfile(user: User) {
  const bootstrapUid = import.meta.env.VITE_BOOTSTRAP_SUPER_ADMIN_UID;
  const bootstrapEmail = import.meta.env.VITE_BOOTSTRAP_SUPER_ADMIN_EMAIL;
  const userEmail = user.email?.toLowerCase();

  if (
    !bootstrapUid ||
    !bootstrapEmail ||
    user.uid !== bootstrapUid ||
    userEmail !== bootstrapEmail.toLowerCase()
  ) {
    return false;
  }

  const profileRef = doc(db, "users", user.uid);
  const statsRef = doc(db, "system", "registration");

  await runTransaction(db, async (transaction) => {
    const profileSnap = await transaction.get(profileRef);
    const statsSnap = await transaction.get(statsRef);

    transaction.set(profileRef, {
      userId: user.uid,
      fullName: profileSnap.exists()
        ? profileSnap.data().fullName ?? user.displayName ?? "Super Admin"
        : user.displayName || "Super Admin",
      email: user.email ?? bootstrapEmail,
      role: "super_admin",
      status: "approved",
      createdAt: profileSnap.exists()
        ? profileSnap.data().createdAt ?? serverTimestamp()
        : serverTimestamp(),
    });

    transaction.set(
      statsRef,
      {
        userCount: statsSnap.exists()
          ? Number(statsSnap.data().userCount ?? 0)
          : 1,
        firstSuperAdminId: user.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  return true;
}

export async function sendResetLink(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  return signOut(auth);
}
