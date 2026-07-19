export type LoadHourSource = {
  loadHours?: number;
  units?: number;
};

export function getLoadHours(source: LoadHourSource | null | undefined) {
  return Number(source?.loadHours ?? source?.units ?? 0);
}

export function withLegacyUnits(loadHoursInput: number | string | null | undefined) {
  const loadHours = Number(loadHoursInput || 0);
  return {
    loadHours,
    units: loadHours,
  };
}
