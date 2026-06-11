import type { LoadStatus } from "../types/loading";

export function getLoadStatus(totalLoad: number): LoadStatus {
  if (totalLoad < 24) return "Under Teaching Load";
  if (totalLoad === 30) return "Full Teaching Load";
  if (totalLoad > 30) return "Over Teaching Load";
  return "Normal Teaching Load";
}

export function getLoadStatusClass(status: LoadStatus) {
  const classes: Record<LoadStatus, string> = {
    "Under Teaching Load": "bg-amber-50 text-amber-700 ring-amber-200",
    "Normal Teaching Load": "bg-blue-50 text-blue-700 ring-blue-200",
    "Full Teaching Load": "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "Over Teaching Load": "bg-red-50 text-red-700 ring-red-200",
  };
  return classes[status];
}
