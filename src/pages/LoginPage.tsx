import { FirebaseError } from "firebase/app";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { TextField } from "../components/FormField";
import { loginWithEmail } from "../services/authService";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from ?? "/dashboard", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof FirebaseError
          ? "The email or password did not match an active account."
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      backgroundImage="/login-background.png"
      title="Welcome Back!"
      subtitle="Sign in to continue to MSHS Portal."
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        <TextField
          autoComplete="email"
          id="email"
          icon={<Mail size={18} />}
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Enter your email"
          required
          type="email"
          value={email}
        />
        <TextField
          autoComplete="current-password"
          id="password"
          icon={<Lock size={18} />}
          label="Password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          required
          type="password"
          value={password}
        />
        <div className="flex justify-end text-sm">
          <Link className="font-medium text-civic hover:underline" to="/forgot-password">
            Forgot password?
          </Link>
        </div>
        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <button
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-wine to-civic px-4 text-sm font-bold text-white shadow-xl shadow-red-950/20 transition hover:-translate-y-0.5 hover:from-[#560000] hover:to-[#b20000] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Signing in..." : "Sign In"}
          {!submitting ? <ArrowRight size={18} /> : null}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Need an account?{" "}
        <Link className="font-semibold text-civic hover:underline" to="/register">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
