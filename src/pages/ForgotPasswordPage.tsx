import { FirebaseError } from "firebase/app";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { TextField } from "../components/FormField";
import { sendResetLink } from "../services/authService";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      await sendResetLink(email);
      setMessage("Password reset link sent. Check your inbox.");
    } catch (caught) {
      setError(
        caught instanceof FirebaseError
          ? "Unable to send a reset link for that email."
          : "Unable to send reset link. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Enter your account email and Firebase will send a reset link."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          autoComplete="email"
          id="email"
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        {message && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {message}
          </p>
        )}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <button
          className="h-12 w-full rounded-xl bg-gradient-to-r from-wine to-civic px-4 text-sm font-bold text-white shadow-lg shadow-red-950/20 transition hover:-translate-y-0.5 hover:from-[#4a0000] hover:to-ember disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Sending..." : "Send password reset link"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Return to{" "}
        <Link className="font-semibold text-civic hover:underline" to="/login">
          Login
        </Link>
      </p>
    </AuthLayout>
  );
}
