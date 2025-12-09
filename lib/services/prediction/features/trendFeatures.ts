import { BasicMatchStat, TrendFeatures } from "./types";

function rollingAverage(values: number[], window: number) {
  const slice = values.slice(0, window);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function rollingVariance(values: number[], window: number) {
  const slice = values.slice(0, window);
  if (slice.length === 0) return 0;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / slice.length;
  return variance;
}

function slope(values: number[], window: number) {
  const slice = values.slice(0, window);
  if (slice.length < 2) return 0;
  const latest = slice[0];
  const oldest = slice[slice.length - 1];
  return (latest - oldest) / (slice.length - 1);
}

export function buildTrendFeatures(matches: BasicMatchStat[], windows = [3, 5, 10]): TrendFeatures {
  const xgSeries = matches.map((m) => m.xG || 0);
  const xaSeries = matches.map((m) => m.xA || 0);

  const rolling_avg_xG: Record<number, number> = {};
  const rolling_avg_xA: Record<number, number> = {};
  const rolling_var_xG: Record<number, number> = {};
  const rolling_var_xA: Record<number, number> = {};
  const slope_xG: Record<number, number> = {};
  const slope_xA: Record<number, number> = {};

  for (const w of windows) {
    rolling_avg_xG[w] = rollingAverage(xgSeries, w);
    rolling_avg_xA[w] = rollingAverage(xaSeries, w);
    rolling_var_xG[w] = rollingVariance(xgSeries, w);
    rolling_var_xA[w] = rollingVariance(xaSeries, w);
    slope_xG[w] = slope(xgSeries, w);
    slope_xA[w] = slope(xaSeries, w);
  }

  return { rolling_avg_xG, rolling_avg_xA, rolling_var_xG, rolling_var_xA, slope_xG, slope_xA };
}
