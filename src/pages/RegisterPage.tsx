import { FirebaseError } from "firebase/app";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { SelectField, TextField } from "../components/FormField";
import { registerUser } from "../services/authService";
import type { UserRole } from "../types";

export function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<Exclude<UserRole, "super_admin">>("viewer");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords must match.");
      return;
    }

    setSubmitting(true);
    try {
      await registerUser({ fullName, email, password, requestedRole });
      navigate("/dashboard", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof FirebaseError
          ? caught.message.replace("Firebase: ", "")
          : "Unable to create the account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="The first account becomes Super Admin. Later accounts wait for approval."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          autoComplete="name"
          id="fullName"
          label="Full Name"
          onChange={(event) => setFullName(event.target.value)}
          required
          type="text"
          value={fullName}
        />
        <TextField
          autoComplete="email"
          id="email"
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <TextField
          autoComplete="new-password"
          id="password"
          label="Password"
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <TextField
          autoComplete="new-password"
          id="confirmPassword"
          label="Confirm Password"
          minLength={6}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
        <SelectField
          id="role"
          label="Role"
          onChange={(event) =>
            setRequestedRole(event.target.value as Exclude<UserRole, "super_admin">)
          }
          value={requestedRole}
        >
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </SelectField>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          className="h-11 w-full rounded-md bg-civic px-4 text-sm font-semibold text-white transition hover:bg-civic/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Creating account..." : "Register"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link className="font-semibold text-civic hover:underline" to="/login">
          Login
        </Link>
      </p>
    </AuthLayout>
  );
}
