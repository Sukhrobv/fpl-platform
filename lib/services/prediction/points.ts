import { Position } from "@prisma/client";

// ============================================================================
// B5: Poisson Distribution for Goals and Assists
// ============================================================================

/**
 * Calculate factorial (with memoization for performance)
 */
const factorialCache: number[] = [1, 1];
function factorial(n: number): number {
  if (n < 0) return 1;
  if (n < factorialCache.length) return factorialCache[n];
  for (let i = factorialCache.length; i <= n; i++) {
    factorialCache[i] = factorialCache[i - 1] * i;
  }
  return factorialCache[n];
}

/**
 * Poisson probability mass function: P(k) = λ^k * e^(-λ) / k!
 */
export function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  return Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
}

/**
 * B5: Calculate expected goal points using Poisson distribution
 * xPts_goals = Σ(P(k) * goal_points * k) for k = 1, 2, 3, ...
 */
export function calculatePoissonGoalPoints(opts: {
  xG: number;
  position: Position;
  maxGoals?: number;
}): { expectedPoints: number; distribution: number[] } {
  const { xG, position, maxGoals = 5 } = opts;
  
  // FPL goal points: FWD=4, MID=5, DEF/GK=6
  const goalPts = position === "FORWARD" ? 4 : position === "MIDFIELDER" ? 5 : 6;
  
  const distribution: number[] = [];
  let expectedPoints = 0;
  
  for (let k = 0; k <= maxGoals; k++) {
    const prob = poissonPmf(xG, k);
    distribution[k] = prob;
    expectedPoints += prob * goalPts * k;
  }
  
  return { expectedPoints, distribution };
}

/**
 * B5: Calculate expected assist points using Poisson distribution
 * xPts_assists = Σ(P(k) * 3 * k) for k = 1, 2, 3, ...
 */
export function calculatePoissonAssistPoints(opts: {
  xA: number;
  maxAssists?: number;
}): { expectedPoints: number; distribution: number[] } {
  const { xA, maxAssists = 4 } = opts;
  
  const assistPts = 3; // FPL: 3 points per assist
  
  const distribution: number[] = [];
  let expectedPoints = 0;
  
  for (let k = 0; k <= maxAssists; k++) {
    const prob = poissonPmf(xA, k);
    distribution[k] = prob;
    expectedPoints += prob * assistPts * k;
  }
  
  return { expectedPoints, distribution };
}

/**
 * B5: Calculate full attack points using Poisson distributions
 * More accurate than simple xG * goal_pts + xA * assist_pts
 */
export function calculatePoissonAttackPoints(opts: {
  xG: number;
  xA: number;
  position: Position;
}): {
  goalPoints: number;
  assistPoints: number;
  totalAttackPoints: number;
  goalDistribution: number[];
  assistDistribution: number[];
} {
  const goalResult = calculatePoissonGoalPoints({ xG: opts.xG, position: opts.position });
  const assistResult = calculatePoissonAssistPoints({ xA: opts.xA });
  
  return {
    goalPoints: goalResult.expectedPoints,
    assistPoints: assistResult.expectedPoints,
    totalAttackPoints: goalResult.expectedPoints + assistResult.expectedPoints,
    goalDistribution: goalResult.distribution,
    assistDistribution: assistResult.distribution,
  };
}

// ============================================================================
// Smart Bonus Calculator (existing, enhanced with Poisson probabilities)
// ============================================================================

export function calculateSmartBonus(opts: {
  position: Position;
  xG_hat: number;
  xA_hat: number;
  prob_cs: number;
  win_prob: number;
  isKeyPlayer: boolean;
}): number {
  const { position, xG_hat, xA_hat, prob_cs, win_prob, isKeyPlayer } = opts;

  let prob_3 = 0;
  let prob_2 = 0;
  let prob_1 = 0;

  if (position === "FORWARD" || position === "MIDFIELDER") {
    // B5: Use Poisson probabilities for more accurate bonus estimation
    const p_at_least_1_goal = 1 - poissonPmf(xG_hat, 0);
    const p_at_least_2_goals = 1 - poissonPmf(xG_hat, 0) - poissonPmf(xG_hat, 1);
    const p_at_least_1_assist = 1 - poissonPmf(xA_hat, 0);

    // 3 BPS likely if brace or goal+assist
    prob_3 = p_at_least_2_goals * 0.85 + p_at_least_1_goal * p_at_least_1_assist * 0.6;
    // 2 BPS for single goal
    prob_2 = (p_at_least_1_goal - p_at_least_2_goals) * 0.4;
    // 1 BPS for assist only or involvement
    prob_1 = (p_at_least_1_assist - p_at_least_1_goal * p_at_least_1_assist) * 0.35;
  } else {
    // Defenders/GKs: clean sheet + involvement
    const p_return = 1 - poissonPmf(xG_hat + xA_hat, 0);
    prob_3 = prob_cs * p_return * 0.9;
    prob_2 = prob_cs * (1 - p_return) * 0.4;
    prob_1 = prob_cs * (1 - p_return) * 0.4;
  }

  let expected_bonus = 3 * prob_3 + 2 * prob_2 + prob_1;
  expected_bonus *= 1 + win_prob * 0.2;
  if (isKeyPlayer) expected_bonus += 0.15;

  return Math.min(3, Math.max(0, expected_bonus));
}

