export function DashboardPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {["Enrollment", "Attendance", "Approvals"].map((item, index) => (
          <article key={item} className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">{item}</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{[1284, 96, 7][index]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
