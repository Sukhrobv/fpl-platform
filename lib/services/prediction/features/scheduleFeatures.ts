import { ScheduleFeatures, BasicMatchStat } from "./types";

function isEuropeanCompetition(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    lower.includes("champions league") ||
    lower.includes("europa league") ||
    lower.includes("conference league") ||
    lower.includes("uecl") ||
    lower.includes("ucl") ||
    lower.includes("uel")
  );
}

function isMidweek(date: Date | null | undefined): boolean {
  if (!date) return false;
  const d = date.getDay();
  return d >= 2 && d <= 4; // Tue-Thu
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

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

  // Midweek Europe flags within ±6 days of latest fixture
  const has_midweek_europe_before = sorted.some((f) => {
    if (!f.date || f.date >= latest.date!) return false;
    if (!isMidweek(f.date)) return false;
    if (!(f.isEurope || isEuropeanCompetition(f.competition))) return false;
    return daysBetween(latest.date!, f.date) <= 6;
  });

  const has_midweek_europe_after = sorted.some((f) => {
    if (!f.date || f.date <= latest.date!) return false;
    if (!isMidweek(f.date)) return false;
    if (!(f.isEurope || isEuropeanCompetition(f.competition))) return false;
    return daysBetween(f.date, latest.date!) <= 6;
  });

  return { rest_days, has_midweek_europe_before, has_midweek_europe_after };
}
