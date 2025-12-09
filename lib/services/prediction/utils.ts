export function clamp(x: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}

export function safePer90(value: number | null | undefined, minutes: number, minSample = 30) {
  if (value == null || minutes == null || minutes < minSample) return 0;
  return (value / minutes) * 90;
}

export function safePer90Player(value: number | null | undefined, minutes: number, minSample = 15) {
  if (value == null || minutes == null || minutes <= 0) return 0;
  if (minutes < minSample) return 0;
  return (value / minutes) * 90;
}

export function safePer90Team(value: number | null | undefined, minutes: number) {
  if (value == null || minutes <= 0) return 0;
  return (value / minutes) * 90;
}

export function aggregateStats(stats: any[], take: number) {
  const sliced = stats.slice(0, take);
  return sliced.reduce(
    (acc, curr) => ({
      minutes: acc.minutes + (curr.minutes || 0),
      xG: acc.xG + (curr.xG || 0),
      xA: acc.xA + (curr.xA || 0),
      shots: acc.shots + (curr.shots || 0),
      keyPasses: acc.keyPasses + (curr.keyPasses || 0),
      xGA: acc.xGA + (curr.xGA || 0),
      deep: acc.deep + (curr.deep || 0),
      ppdaSum: acc.ppdaSum + (curr.ppda || 0),
      count: acc.count + 1,
    }),
    {
      minutes: 0,
      xG: 0,
      xA: 0,
      shots: 0,
      keyPasses: 0,
      xGA: 0,
      deep: 0,
      ppdaSum: 0,
      count: 0,
    }
  );
}

export function share(playerPer90: number | null | undefined, teamPer90: number | null | undefined) {
  const p = playerPer90 ?? 0;
  const t = teamPer90 ?? 0;
  if (t <= 0.05) return 0;
  return p / t;
}
