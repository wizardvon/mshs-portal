export function ReportsPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-ink">Reports</h1>
      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Report</th>
              <th className="px-4 py-3 font-semibold">Scope</th>
              <th className="px-4 py-3 font-semibold">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <tr>
              <td className="px-4 py-3">Enrollment Summary</td>
              <td className="px-4 py-3">Current school year</td>
              <td className="px-4 py-3">View-only ready</td>
            </tr>
            <tr>
              <td className="px-4 py-3">Student Status</td>
              <td className="px-4 py-3">Per grade level</td>
              <td className="px-4 py-3">View-only ready</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
