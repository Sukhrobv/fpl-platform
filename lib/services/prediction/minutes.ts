import { Position } from "@prisma/client";
import { clamp } from "./utils";

export const POS_MINUTES_SETTINGS: Record<Position, { muStart: number; threshold: number }> = {
  GOALKEEPER: { muStart: 90, threshold: 85 },
  DEFENDER:   { muStart: 85, threshold: 60 },
  MIDFIELDER: { muStart: 80, threshold: 60 },
  FORWARD:    { muStart: 80, threshold: 60 },
};

export const CAMEO_MINUTES = 20;

/** Context features for minutes prediction penalties */
export interface MinutesContext {
  rest_days?: number | null;
  has_midweek_europe_before?: boolean;
  has_midweek_europe_after?: boolean;
  days_out?: number | null;
  games_missed?: number;
  game_index_since_return?: number | null;
  perSub_ratio?: number; // perSub_xG / perStart_xG — high value means impact sub
}

export function predictMinutesAndProbability(opts: {
  position: Position;
  seasonStats: { minutes: number; games: number };
  recentStats: { minutes: number; games: number };
  chanceOfPlaying: number | null;
  context?: MinutesContext;
}) {
  const { position, seasonStats, recentStats, chanceOfPlaying, context } = opts;
  const settings = POS_MINUTES_SETTINGS[position];

  const seasonAvg = seasonStats.games > 0 ? seasonStats.minutes / seasonStats.games : 0;
  const recentAvg = recentStats.games > 0 ? recentStats.minutes / recentStats.games : seasonAvg;

  const weightRecent = 0.7;
  let expectedMinutesRaw = recentAvg * weightRecent + seasonAvg * (1 - weightRecent);

  const muStart = settings.muStart;
  const muCameo = CAMEO_MINUTES;
  const pCameoGivenBench = 0.35;
  const expectedCameoContribution = pCameoGivenBench * muCameo;

  let pStartBase = (expectedMinutesRaw - expectedCameoContribution) / (muStart - expectedCameoContribution);
  pStartBase = clamp(pStartBase, 0, 1.0);

  // --- B3: Apply context penalties ---
  let pStartPenalty = 1.0;
  let prob60Penalty = 1.0;

  if (context) {
    // 1. Rest days penalty: short turnaround reduces start probability
    if (context.rest_days !== null && context.rest_days !== undefined && context.rest_days <= 3) {
      pStartPenalty *= 0.85;
      expectedMinutesRaw -= 5;
    }

    // 2. Europe penalty: midweek European games cause rotation
    if (context.has_midweek_europe_before || context.has_midweek_europe_after) {
      pStartPenalty *= 0.9;
      prob60Penalty *= 0.9;
    }

    // 3. Injury recovery: returning players get managed minutes
    if (context.days_out !== null && context.days_out !== undefined) {
      if (context.days_out > 40) {
        // Long-term injury: target ~20 minutes
        expectedMinutesRaw = Math.min(expectedMinutesRaw, 25);
        pStartPenalty *= 0.4;
      } else if (context.days_out > 20) {
        // Medium injury: target ~35 minutes
        expectedMinutesRaw = Math.min(expectedMinutesRaw, 40);
        pStartPenalty *= 0.6;
      }
    }

    // First game back from absence: extra caution
    if (context.game_index_since_return === 0) {
      pStartPenalty *= 0.7;
    }

    // 4. Role adjustment: high perSub_ratio means impact sub player
    if (context.perSub_ratio !== undefined && context.perSub_ratio > 1.3) {
      pStartPenalty *= 0.6;
      // Impact subs typically get ~20-30 minutes
      expectedMinutesRaw = Math.min(expectedMinutesRaw, 35);
    }
  }

  const availability = chanceOfPlaying !== null ? chanceOfPlaying / 100 : 1.0;
  const start_probability = clamp(pStartBase * availability * pStartPenalty, 0, 0.99);
  const prob_60 = start_probability * 0.92 * prob60Penalty;
  const minutes_recent_proxy = Math.round(recentStats.minutes);

  return {
    start_probability,
    prob_60,
    minutes_recent_proxy,
    expected_minutes: clamp(expectedMinutesRaw * availability, 0, 90),
  };
}
