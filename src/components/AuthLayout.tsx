import type { PropsWithChildren } from "react";

type AuthLayoutProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <main className="min-h-screen bg-mist">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden bg-civic px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="h-10 w-10 rounded-md bg-white/95" />
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
              School MIS Portal
            </p>
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl font-semibold leading-tight">
              Secure access for school operations.
            </h1>
            <p className="mt-5 text-base leading-7 text-white/75">
              Manage administrative access, approvals, and view-only reporting
              from one controlled portal.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm text-white/75">
            <div className="border-t border-white/25 pt-3">Admissions</div>
            <div className="border-t border-white/25 pt-3">Reports</div>
            <div className="border-t border-white/25 pt-3">Approvals</div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-7">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-civic">
                School MIS
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
