import type { PropsWithChildren } from "react";
import { MonitorCheck, Target, UsersRound } from "lucide-react";

type AuthLayoutProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  backgroundImage?: string;
}>;

export function AuthLayout({ children, title, subtitle, backgroundImage }: AuthLayoutProps) {
  const hasBackgroundImage = Boolean(backgroundImage);

  return (
    <main
      className={
        hasBackgroundImage
          ? "min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat"
          : "min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(242,184,30,0.16),transparent_28%),linear-gradient(135deg,#fff8f8_0%,#f6f7fb_46%,#fff4d8_100%)]"
      }
      style={hasBackgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
    >
      <div
        className={
          hasBackgroundImage
            ? "grid min-h-screen"
            : "grid min-h-screen p-4 lg:grid-cols-[1.1fr_0.9fr] lg:p-6"
        }
      >
        <section
          className={
            hasBackgroundImage
              ? "hidden"
              : "relative hidden overflow-hidden rounded-[32px] bg-[linear-gradient(145deg,#930000_0%,#6b0000_45%,#2b0000_100%)] px-12 py-10 text-white shadow-2xl shadow-red-950/35 lg:flex lg:flex-col lg:justify-between"
          }
        >
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity"
            src="/school-building.jpg"
          />
          <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(92,0,0,0.96)_0%,rgba(139,0,0,0.9)_48%,rgba(92,0,0,0.88)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/50 via-red-950/10 to-transparent" />
          <div className="absolute right-0 top-0 h-full w-10 bg-signal shadow-[-18px_0_42px_rgba(242,184,30,0.18)]" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="grid h-20 w-20 place-items-center rounded-3xl bg-white/15 shadow-xl shadow-black/20 ring-2 ring-white/20">
              <img
                alt="Mataasnakahoy Senior High School"
                className="h-16 w-16 object-contain"
                src="/school-logo.png"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">
                Mataasnakahoy Senior High School
              </p>
              <p className="mt-1 text-base font-bold text-signal drop-shadow">
                One School. One Portal.
              </p>
            </div>
          </div>
          <div className="relative z-10 max-w-xl">
            <div className="mt-8">
              <h1 className="text-5xl font-black leading-tight tracking-[-0.04em] drop-shadow-sm">
                MSHS <span className="text-signal">PORTAL</span>
              </h1>
              <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-white/85">
                Mataasnakahoy Senior High School
              </p>
              <div className="mt-4 h-1 w-40 rounded-full bg-signal shadow-lg shadow-yellow-500/25" />
            </div>
            <div className="mt-9 space-y-5 text-lg font-semibold">
              <p className="flex items-center gap-3 text-white">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-signal/18 text-signal ring-1 ring-signal/35">
                  <UsersRound size={22} />
                </span>
                One School.
              </p>
              <p className="flex items-center gap-3 text-white">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-signal/18 text-signal ring-1 ring-signal/35">
                  <MonitorCheck size={22} />
                </span>
                One System.
              </p>
              <p className="flex items-center gap-3 text-white">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-signal/18 text-signal ring-1 ring-signal/35">
                  <Target size={22} />
                </span>
                One Goal.
              </p>
            </div>
            <p className="mt-8 max-w-md text-base font-semibold leading-7 text-white/90">
              Secure, smart, accessible, and connected school operations in one portal.
            </p>
          </div>
          <div className="relative z-10 grid grid-cols-3 gap-3 text-sm font-medium text-white">
            <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-4 shadow-sm backdrop-blur">
              <p className="font-semibold">Secure</p>
              <p className="mt-1 text-xs text-white/75">Your data is safe with us.</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-4 shadow-sm backdrop-blur">
              <p className="font-semibold">Smart</p>
              <p className="mt-1 text-xs text-white/75">Tools that make work simpler.</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 px-4 py-4 shadow-sm backdrop-blur">
              <p className="font-semibold">Connected</p>
              <p className="mt-1 text-xs text-white/75">One portal for everyone.</p>
            </div>
          </div>
        </section>

        <section
          className={
            hasBackgroundImage
              ? "relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:justify-end lg:pr-[7vw]"
              : "relative flex items-center justify-center px-5 py-10 sm:px-8"
          }
        >
          {!hasBackgroundImage ? (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(242,184,30,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(92,0,0,0.12),transparent_32%)]" />
              <div className="absolute right-8 top-8 hidden h-40 w-40 bg-[radial-gradient(#8b0000_1px,transparent_1px)] [background-size:14px_14px] opacity-10 sm:block" />
              <div className="absolute bottom-10 left-8 hidden h-40 w-40 bg-[radial-gradient(#f2b81e_1px,transparent_1px)] [background-size:14px_14px] opacity-20 sm:block" />
            </>
          ) : null}
          <div className="relative w-full max-w-md rounded-[32px] border border-slate-200/70 bg-white/95 p-7 shadow-2xl shadow-red-950/10 ring-1 ring-slate-200/80 backdrop-blur-sm sm:p-10">
            <div className="mb-7 text-center">
              <img
                alt="MSHS Portal"
                className="mx-auto mb-4 h-20 w-20 rounded-3xl shadow-xl shadow-red-950/15 ring-4 ring-red-50"
                src="/mshs-portal-icon.png"
              />
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-civic">
                MSHS Portal
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-ink">{title}</h2>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{subtitle}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
