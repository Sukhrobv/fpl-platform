import { LeagueAverages } from "./types";

/** B4: Attack context for enhanced calculations */
export interface AttackContext {
  // Player involvement metrics
  keyPasses90?: number;
  touchesInBox90?: number;
  shots90?: number;
  // Team rolling trends
  team_xG_trend?: number; // slope of recent xG
  opp_xGA_trend?: number; // slope of opponent xGA
  // Assist model inputs
  passToShootRatio?: number; // key_passes / shots
}

/**
 * B4: Calculate involvement score combining xG, xA, key passes, touches in box
 * Higher score = more central to team's attack
 */
export function calculateInvolvementScore(opts: {
  xG90: number;
  xA90: number;
  keyPasses90: number;
  touchesInBox90: number;
  teamXg90: number;
}): number {
  const { xG90, xA90, keyPasses90, touchesInBox90, teamXg90 } = opts;
  
  // Normalize to team share
  const teamBase = Math.max(0.5, teamXg90);
  const goalShare = xG90 / teamBase;
  const assistShare = xA90 / teamBase;
  
  // Weight factors: goals most important, then assists, then involvement metrics
  const goalWeight = 0.4;
  const assistWeight = 0.3;
  const keyPassWeight = 0.2;
  const boxTouchWeight = 0.1;
  
  // Normalize key passes and touches (typical values: 1-3 for KP, 2-6 for touches)
  const normalizedKP = Math.min(1, keyPasses90 / 3);
  const normalizedTouches = Math.min(1, touchesInBox90 / 6);
  
  const score = 
    goalWeight * Math.min(1, goalShare) +
    assistWeight * Math.min(1, assistShare) +
    keyPassWeight * normalizedKP +
    boxTouchWeight * normalizedTouches;
  
  // Scale to 0-1 range with typical players around 0.3-0.5, elite around 0.7+
  return Math.min(1, score);
}

/**
 * B4: Calculate assist boost based on pass-to-shoot ratio and xA regression
 * Handles players with high key passes but low conversion
 */
export function calculateAssistBoost(opts: {
  xA90: number;
  keyPasses90: number;
  leagueAvgXa90?: number;
}): number {
  const { xA90, keyPasses90, leagueAvgXa90 = 0.15 } = opts;
  
  // If very low key passes, no boost
  if (keyPasses90 < 0.5) return 0;
  
  // Calculate expected xA from key passes (typical conversion: ~10-15%)
  const expectedXaFromKP = keyPasses90 * 0.12;
  
  // Regress toward league mean for stability
  const regressionWeight = 0.3;
  const regressedXa = xA90 * (1 - regressionWeight) + leagueAvgXa90 * regressionWeight;
  
  // Boost if actual xA exceeds expected from key passes (quality chances)
  const qualityBoost = Math.max(0, xA90 - expectedXaFromKP) * 0.5;
  
  // Penalty if key passes are high but xA is low (unlucky or poor teammates)
  const unluckyBoost = Math.max(0, expectedXaFromKP - xA90) * 0.3;
  
  return qualityBoost + unluckyBoost;
}

export function lambdaAttack(
  team_xG: number,
  opp_xGA: number,
  opp_deep: number,
  home: boolean,
  L: LeagueAverages,
  context?: AttackContext
): number {
  const beta = 0.85;
  const betaH = 0.15;
  
  // B4: Apply trend adjustments if available
  let trendAdjustment = 0;
  if (context) {
    // Positive team trend = scoring more recently
    if (context.team_xG_trend !== undefined) {
      trendAdjustment += context.team_xG_trend * 0.1;
    }
    // Positive opponent xGA trend = conceding more recently
    if (context.opp_xGA_trend !== undefined) {
      trendAdjustment += context.opp_xGA_trend * 0.1;
    }
  }
  
  const val = Math.exp(
    Math.log(L.avg_xG) +
      beta * Math.log(Math.max(0.1, team_xG) / L.avg_xG) -
      beta * Math.log(Math.max(0.1, opp_xGA) / L.avg_xGA) +
      betaH * (home ? 1 : -0.1) +
      trendAdjustment
  );
  return Math.max(0.3, Math.min(3.8, val));
}

export function lambdaDefense(
  opp_xG: number,
  team_xGA: number,
  team_deep: number,
  home: boolean,
  L: LeagueAverages
): number {
  const beta = 0.85;
  const betaH = 0.15;
  const val = Math.exp(
    Math.log(L.avg_xGA) +
      beta * Math.log(Math.max(0.1, opp_xG) / L.avg_xG) -
      beta * Math.log(Math.max(0.1, team_xGA) / L.avg_xGA) -
      betaH * (home ? 1 : 0)
  );
  return Math.max(0.3, Math.min(3.5, val));
}

