/**
 * B7: ML Model Types
 * 
 * Type definitions for ML model inputs and outputs.
 */

import { Position } from "@prisma/client";

/** Features for Minutes prediction ML model */
export interface MinutesMLInput {
  position: Position;
  price: number;
  // Schedule
  rest_days: number | null;
  has_europe_before: boolean;
  has_europe_after: boolean;
  // Injury
  days_out: number | null;
  games_missed: number;
  game_index_since_return: number | null;
  // Role
  perStart_xG: number;
  perSub_xG: number;
  perSub_ratio: number;
  // History
  season_avg_minutes: number;
  recent_avg_minutes: number;
  chance_of_playing: number | null;
}

export interface MinutesMLOutput {
  start_probability: number;
  prob_60: number;
  expected_minutes: number;
}

/** Features for Attack prediction ML model */
export interface AttackMLInput {
  position: Position;
  price: number;
  // Per 90 stats
  xG90_season: number;
  xA90_season: number;
  shots90_season: number;
  keyPasses90_season: number;
  xG90_recent: number;
  xA90_recent: number;
  // Trends
  slope_xG_5: number;
  slope_xA_5: number;
  rolling_avg_xG_5: number;
  rolling_avg_xA_5: number;
  // Context
  is_home: boolean;
  team_xG_strength: number;
  opp_xGA_weak: number;
  minutes_expected: number;
}

export interface AttackMLOutput {
  xG_predicted: number;
  xA_predicted: number;
}

/** Generic ML model interface */
export interface MLModel<TInput, TOutput> {
  predict(input: TInput): Promise<TOutput>;
  isLoaded(): boolean;
}
