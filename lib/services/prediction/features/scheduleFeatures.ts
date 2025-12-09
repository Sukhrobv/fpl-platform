import { ScheduleFeatures, BasicMatchStat } from "./types";

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function buildScheduleFeatures(fixtures: BasicMatchStat[]): ScheduleFeatures {
  if (!fixtures || fixtures.length === 0) {
    return { rest_days: null, has_midweek_europe_before: false, has_midweek_europe_after: false };
  }

  const sorted = [...fixtures]
    .map((f) => ({ ...f, date: toDate(f.kickoff) }))
    .filter((f) => f.date)
    .sort((a, b) => (a.date!.getTime() > b.date!.getTime() ? -1 : 1));

  if (sorted.length === 0) {
    return { rest_days: null, has_midweek_europe_before: false, has_midweek_europe_after: false };
  }

  const latest = sorted[0];
  const prev = sorted[1];

  const rest_days =
    latest && prev ? Math.round((latest.date!.getTime() - prev.date!.getTime()) / (1000 * 60 * 60 * 24)) : null;

  const has_midweek_europe_before = sorted.some(
    (f) => f.isEurope && f.date && f.date.getDay() >= 2 && f.date.getDay() <= 4
  );
  const has_midweek_europe_after = false; // TODO/placeholder: requires future fixture context

  return { rest_days, has_midweek_europe_before, has_midweek_europe_after };
}
