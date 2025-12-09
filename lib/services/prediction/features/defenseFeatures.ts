/**
 * B4.5: Defense Features Builder
 * 
 * Calculates defensive contribution features (DEFCON) for FPL 2025/26.
 * 
 * Rules:
 * - DEF/GK: 10 CBIT (Clearances, Blocks, Interceptions, Tackles) = 2 pts
 * - MID/FWD: 12 CBIRT (+ Ball Recoveries) = 2 pts
 * - Max 2 pts per match
 */

import { Position } from "@prisma/client";

export interface DefensiveMatchStats {
  clearances?: number | null;
  blocks?: number | null;
  interceptions?: number | null;
  tackles?: number | null;
  recoveries?: number | null; // Only counts for MID/FWD
}

export interface DefenseFeatures {
  // Per 90 averages
  clearances90: number;
  blocks90: number;
  interceptions90: number;
  tackles90: number;
  recoveries90: number;
  // Calculated totals
  cbit90: number;    // Clearances + Blocks + Interceptions + Tackles
  cbirt90: number;   // CBIT + Recoveries
  // Probability of reaching DEFCON threshold
  prob_defcon: number;
}

/**
 * Build defense features from recent match stats
 */
export function buildDefenseFeatures(
  matches: DefensiveMatchStats[],
  totalMinutes: number
): DefenseFeatures {
  if (matches.length === 0 || totalMinutes < 90) {
    return {
      clearances90: 0,
      blocks90: 0,
      interceptions90: 0,
      tackles90: 0,
      recoveries90: 0,
      cbit90: 0,
      cbirt90: 0,
      prob_defcon: 0,
    };
  }

  // Sum all defensive actions
  let totalClearances = 0;
  let totalBlocks = 0;
  let totalInterceptions = 0;
  let totalTackles = 0;
  let totalRecoveries = 0;

  for (const match of matches) {
    totalClearances += match.clearances || 0;
    totalBlocks += match.blocks || 0;
    totalInterceptions += match.interceptions || 0;
    totalTackles += match.tackles || 0;
    totalRecoveries += match.recoveries || 0;
  }

  // Per 90 normalization
  const per90 = (stat: number) => (stat / totalMinutes) * 90;

  const clearances90 = per90(totalClearances);
  const blocks90 = per90(totalBlocks);
  const interceptions90 = per90(totalInterceptions);
  const tackles90 = per90(totalTackles);
  const recoveries90 = per90(totalRecoveries);

  const cbit90 = clearances90 + blocks90 + interceptions90 + tackles90;
  const cbirt90 = cbit90 + recoveries90;

  // Estimate probability of reaching DEFCON threshold
  // Based on variance and typical distribution
  const prob_defcon = estimateDefconProbability(cbit90, cbirt90);

  return {
    clearances90,
    blocks90,
    interceptions90,
    tackles90,
    recoveries90,
    cbit90,
    cbirt90,
    prob_defcon,
  };
}

/**
 * Estimate probability of reaching DEFCON threshold in a single match
 * Uses simplified Poisson-like estimation
 */
function estimateDefconProbability(cbit90: number, cbirt90: number): number {
  // For defenders: need 10 CBIT per game
  // For midfielders: need 12 CBIRT per game
  // Average over both thresholds as approximation
  
  // Probability of at least 10 CBIT (using Poisson approximation)
  const lambda_def = cbit90;
  const prob_10 = 1 - poissonCdf(lambda_def, 9);
  
  return Math.min(1, Math.max(0, prob_10));
}

/**
 * Simple Poisson CDF up to k
 */
function poissonCdf(lambda: number, k: number): number {
  if (lambda <= 0) return k >= 0 ? 1 : 0;
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i <= k; i++) {
    if (i > 0) term *= lambda / i;
    sum += term;
  }
  return sum;
}
