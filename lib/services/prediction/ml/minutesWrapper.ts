/**
 * B7: ML Wrapper for Minutes Prediction
 * 
 * Provides toggle between heuristic and ML-based minutes prediction.
 */

import { ML_CONFIG } from "./config";
import { getMinutesModel } from "./loader";
import { MinutesMLInput, MinutesMLOutput } from "./types";
import { predictMinutesAndProbability, MinutesContext } from "../minutes";
import { Position } from "@prisma/client";

export interface MinutesWrapperInput {
  position: Position;
  price: number;
  seasonStats: { minutes: number; games: number };
  recentStats: { minutes: number; games: number };
  chanceOfPlaying: number | null;
  context?: MinutesContext;
  // Additional ML features
  perStart_xG?: number;
  perSub_xG?: number;
}

export interface MinutesWrapperOutput {
  start_probability: number;
  prob_60: number;
  expected_minutes: number;
  minutes_recent_proxy: number;
  source: "heuristic" | "ml";
}

/**
 * Predict minutes with automatic heuristic/ML toggle
 */
export async function predictMinutesWithML(
  input: MinutesWrapperInput
): Promise<MinutesWrapperOutput> {
  const shouldUseML = ML_CONFIG.USE_ML || ML_CONFIG.USE_ML_MINUTES;
  const model = getMinutesModel();

  // Try ML if enabled and model loaded
  if (shouldUseML && model?.isLoaded()) {
    try {
      const mlInput: MinutesMLInput = {
        position: input.position,
        price: input.price,
        rest_days: input.context?.rest_days ?? null,
        has_europe_before: input.context?.has_midweek_europe_before ?? false,
        has_europe_after: input.context?.has_midweek_europe_after ?? false,
        days_out: input.context?.days_out ?? null,
        games_missed: input.context?.games_missed ?? 0,
        game_index_since_return: input.context?.game_index_since_return ?? null,
        perStart_xG: input.perStart_xG ?? 0,
        perSub_xG: input.perSub_xG ?? 0,
        perSub_ratio: input.context?.perSub_ratio ?? 0,
        season_avg_minutes: input.seasonStats.games > 0 
          ? input.seasonStats.minutes / input.seasonStats.games 
          : 0,
        recent_avg_minutes: input.recentStats.games > 0 
          ? input.recentStats.minutes / input.recentStats.games 
          : 0,
        chance_of_playing: input.chanceOfPlaying,
      };

      const mlOutput = await model.predict(mlInput);

      return {
        start_probability: mlOutput.start_probability,
        prob_60: mlOutput.prob_60,
        expected_minutes: mlOutput.expected_minutes,
        minutes_recent_proxy: input.recentStats.minutes,
        source: "ml",
      };
    } catch (error) {
      console.error("[ML] Minutes prediction failed, falling back to heuristic:", error);
      if (!ML_CONFIG.FALLBACK_ON_ERROR) throw error;
    }
  }

  // Fallback to heuristic
  const heuristicResult = predictMinutesAndProbability({
    position: input.position,
    seasonStats: input.seasonStats,
    recentStats: input.recentStats,
    chanceOfPlaying: input.chanceOfPlaying,
    context: input.context,
  });

  return {
    ...heuristicResult,
    source: "heuristic",
  };
}
