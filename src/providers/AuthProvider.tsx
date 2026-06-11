import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { auth, db } from "../firebase";
import { bootstrapSuperAdminProfile } from "../services/authService";
import type { UserProfile } from "../types";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setProfile(null);
      setAuthLoading(false);
      setProfileLoading(Boolean(nextUser));
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return undefined;
    }

    return onSnapshot(
      doc(db, "users", user.uid),
      async (snapshot) => {
        if (snapshot.exists()) {
          const nextProfile = snapshot.data() as UserProfile;
          const shouldBootstrap =
            user.uid === import.meta.env.VITE_BOOTSTRAP_SUPER_ADMIN_UID &&
            user.email?.toLowerCase() ===
              import.meta.env.VITE_BOOTSTRAP_SUPER_ADMIN_EMAIL?.toLowerCase() &&
            (nextProfile.role !== "super_admin" ||
              nextProfile.status !== "approved");

          if (shouldBootstrap) {
            try {
              await bootstrapSuperAdminProfile(user);
            } catch {
              setProfile(nextProfile);
              setProfileLoading(false);
            }
            return;
          }

          setProfile(nextProfile);
          setProfileLoading(false);
          return;
        }

        try {
          const bootstrapped = await bootstrapSuperAdminProfile(user);
          if (!bootstrapped) {
            setProfile(null);
            setProfileLoading(false);
          }
        } catch {
          setProfile(null);
          setProfileLoading(false);
        }
      },
      () => {
        setProfile(null);
        setProfileLoading(false);
      },
    );
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading: authLoading || profileLoading,
    }),
    [authLoading, profile, profileLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
