/**
 * B4.5: Defense Features Builder
 * 
 * Calculates defensive contribution features (DEFCON) for FPL 2025/26.
 * 
 * Rules:
 * - DEF: 10 CBIT (Clearances, Blocks, Interceptions, Tackles) = 2 pts
 * - MID/FWD: 12 CBIRT (+ Ball Recoveries) = 2 pts
 * - GK: not eligible
 * - Max 2 pts per match
 */

export interface DefensiveMatchStats {
  /** Official FPL aggregate: clearances + blocks + interceptions. */
  cbi?: number | null;
  clearances?: number | null;
  blocks?: number | null;
  interceptions?: number | null;
  tackles?: number | null;
  recoveries?: number | null; // Only counts for MID/FWD
  // A1.1: Enriched defensive stats
  aerial_duels_won?: number | null;
  challenges_won?: number | null;
}

export interface DefenseFeatures {
  // Per 90 averages
  cbi90: number;
  clearances90: number;
  blocks90: number;
  interceptions90: number;
  tackles90: number;
  recoveries90: number;
  // A1.1: Enriched per 90 stats
  aerialDuelsWon90: number;
  challengesWon90: number;
  // Calculated totals
  cbit90: number;    // Clearances + Blocks + Interceptions + Tackles
  cbirt90: number;   // CBIT + Recoveries
  // A1.1: Extended total including aerial/challenges
  cbitExtended90: number;  // CBIT + Aerial Duels + Challenges (for enhanced DEFCON)
  // Probability of reaching DEFCON threshold
  prob_defcon: number;
  // A1.1: Variability for DEFCON profile
  variability_sigma: number;
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
      cbi90: 0,
      clearances90: 0,
      blocks90: 0,
      interceptions90: 0,
      tackles90: 0,
      recoveries90: 0,
      aerialDuelsWon90: 0,
      challengesWon90: 0,
      cbit90: 0,
      cbirt90: 0,
      cbitExtended90: 0,
      prob_defcon: 0,
      variability_sigma: 0,
    };
  }

  // Sum all defensive actions
  let totalClearances = 0;
  let totalBlocks = 0;
  let totalInterceptions = 0;
  let totalOfficialCbi = 0;
  let totalTackles = 0;
  let totalRecoveries = 0;
  let totalAerialDuels = 0;
  let totalChallenges = 0;

  // For variability calculation
  const cbitPerMatch: number[] = [];

  for (const match of matches) {
    const hasOfficialCbi = match.cbi != null;
    totalOfficialCbi += hasOfficialCbi ? match.cbi || 0 : 0;
    totalClearances += hasOfficialCbi ? 0 : match.clearances || 0;
    totalBlocks += hasOfficialCbi ? 0 : match.blocks || 0;
    totalInterceptions += hasOfficialCbi ? 0 : match.interceptions || 0;
    totalTackles += match.tackles || 0;
    totalRecoveries += match.recoveries || 0;
    totalAerialDuels += match.aerial_duels_won || 0;
    totalChallenges += match.challenges_won || 0;

    // Track CBIT per match for variability
    const matchCbit = (hasOfficialCbi
      ? match.cbi || 0
      : (match.clearances || 0) + (match.blocks || 0) + (match.interceptions || 0)) +
      (match.tackles || 0);
    cbitPerMatch.push(matchCbit);
  }

  // Per 90 normalization
  const per90 = (stat: number) => (stat / totalMinutes) * 90;

  const cbi90 = per90(totalOfficialCbi);
  const clearances90 = per90(totalClearances);
  const blocks90 = per90(totalBlocks);
  const interceptions90 = per90(totalInterceptions);
  const tackles90 = per90(totalTackles);
  const recoveries90 = per90(totalRecoveries);
  const aerialDuelsWon90 = per90(totalAerialDuels);
  const challengesWon90 = per90(totalChallenges);

  const cbit90 = cbi90 + clearances90 + blocks90 + interceptions90 + tackles90;
  const cbirt90 = cbit90 + recoveries90;
  const cbitExtended90 = cbit90 + aerialDuelsWon90 + challengesWon90; // Enhanced CBIT with aerial duels/challenges

  // Calculate variability (standard deviation of CBIT per match)
  const variability_sigma = calculateStdDev(cbitPerMatch);

  // Estimate probability of reaching DEFCON threshold
  const prob_defcon = estimateDefconProbability(cbit90, cbirt90);

  return {
    cbi90,
    clearances90,
    blocks90,
    interceptions90,
    tackles90,
    recoveries90,
    aerialDuelsWon90,
    challengesWon90,
    cbit90,
    cbirt90,
    cbitExtended90,
    prob_defcon,
    variability_sigma,
  };
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Estimate probability of reaching DEFCON threshold in a single match
 * Uses simplified Poisson-like estimation
 */
function estimateDefconProbability(cbit90: number, cbirt90: number): number {
  // For defenders: need 10 CBIT per game
  // For midfielders: need 12 CBIRT per game
  // Combine both thresholds as approximation (no position available here)
  const lambda_cbit = Math.max(0, cbit90);
  const lambda_cbirt = Math.max(0, cbirt90);

  const prob_cbit = 1 - poissonCdf(lambda_cbit, 9);
  const prob_cbirt = 1 - poissonCdf(lambda_cbirt, 11);

  return Math.min(1, Math.max(0, (prob_cbit + prob_cbirt) / 2));
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
