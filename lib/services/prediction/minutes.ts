import { Position } from "@prisma/client";
import { clamp } from "./utils";

export const POS_MINUTES_SETTINGS: Record<Position, { muStart: number; threshold: number }> = {
  GOALKEEPER: { muStart: 90, threshold: 85 },
  DEFENDER:   { muStart: 85, threshold: 60 },
  MIDFIELDER: { muStart: 80, threshold: 60 },
  FORWARD:    { muStart: 80, threshold: 60 },
};

export const CAMEO_MINUTES = 20;

export function predictMinutesAndProbability(opts: {
  position: Position;
  seasonStats: { minutes: number; games: number };
  recentStats: { minutes: number; games: number };
  chanceOfPlaying: number | null;
}) {
  const { position, seasonStats, recentStats, chanceOfPlaying } = opts;
  const settings = POS_MINUTES_SETTINGS[position];

  const seasonAvg = seasonStats.games > 0 ? seasonStats.minutes / seasonStats.games : 0;
  const recentAvg = recentStats.games > 0 ? recentStats.minutes / recentStats.games : seasonAvg;

  const weightRecent = 0.7;
  const expectedMinutesRaw = recentAvg * weightRecent + seasonAvg * (1 - weightRecent);

  const muStart = settings.muStart;
  const muCameo = CAMEO_MINUTES;
  const pCameoGivenBench = 0.35;
  const expectedCameoContribution = pCameoGivenBench * muCameo;

  let pStartBase = (expectedMinutesRaw - expectedCameoContribution) / (muStart - expectedCameoContribution);
  pStartBase = clamp(pStartBase, 0, 1.0);

  const availability = chanceOfPlaying !== null ? chanceOfPlaying / 100 : 1.0;
  const start_probability = clamp(pStartBase * availability, 0, 0.99);
  const minutes_recent_proxy = Math.round(recentStats.minutes);

  return {
    start_probability,
    minutes_recent_proxy,
    expected_minutes: expectedMinutesRaw * availability,
  };
}
