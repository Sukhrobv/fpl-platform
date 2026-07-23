/**
 * A4.3: Individual DEFCON Profile
 * 
 * Calculates baseline defensive characteristics for each player.
 * Used to predict defensive contributions in upcoming matches.
 */

import { Position } from "@prisma/client";
import { DefensiveMatchStats, DefenseFeatures, buildDefenseFeatures } from "../features/defenseFeatures";

/**
 * Individual DEFCON profile for a player
 */
export interface DefconProfile {
  // Baseline per 90 averages
  baseline_cbit90: number;
  baseline_cbirt90: number;
  baseline_extended90: number;  // CBIT + aerial duels
  
  // Variability
  variability_sigma: number;
  
  // Position-based role multiplier
  role_multiplier: number;
  
  // Player position
  position: Position;
  
  // Confidence level (0-1) based on sample size
  confidence: number;
}

/**
 * Player zone for defensive context
 */
export type PlayerZone = 'CB' | 'FB' | 'WB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';

/**
 * Role multipliers for different positions
 * Based on typical defensive action rates by role
 */
const ROLE_MULTIPLIERS: Record<PlayerZone, number> = {
  'CB': 1.0,    // Central defenders: baseline
  'FB': 0.85,   // Full-backs
  'WB': 0.75,   // Wing-backs (more attacking)
  'DM': 0.90,   // Defensive midfielders
  'CM': 0.65,   // Central midfielders
  'AM': 0.45,   // Attacking midfielders
  'W': 0.40,    // Wingers
  'ST': 0.30,   // Strikers
};

/**
 * Infer player zone from position and optional role hint
 */
export function inferPlayerZone(position: Position, roleHint?: string): PlayerZone {
  if (roleHint) {
    const hint = roleHint.toLowerCase();
    if (hint.includes('wing-back') || hint.includes('wingback')) return 'WB';
    if (hint.includes('defensive mid') || hint.includes('dm')) return 'DM';
    if (hint.includes('full-back') || hint.includes('fullback')) return 'FB';
    if (hint.includes('centre-back') || hint.includes('centerback') || hint.includes('cb')) return 'CB';
    if (hint.includes('attacking mid') || hint.includes('am')) return 'AM';
  }
  
  switch (position) {
    case 'GOALKEEPER': return 'CB'; // Zone placeholder only; GK is not DEFCON-eligible
    case 'DEFENDER': return 'CB';   // Default to CB for defenders
    case 'MIDFIELDER': return 'CM'; // Default to CM for midfielders
    case 'FORWARD': return 'ST';    // Default to ST for forwards
    default: return 'CM';
  }
}

/**
 * Build DEFCON profile from historical match data
 */
export function buildDefconProfile(
  matches: DefensiveMatchStats[],
  position: Position,
  totalMinutes: number,
  roleHint?: string
): DefconProfile {
  // Get base features
  const features: DefenseFeatures = buildDefenseFeatures(matches, totalMinutes);
  
  // Determine role and multiplier
  const zone = inferPlayerZone(position, roleHint);
  const role_multiplier = ROLE_MULTIPLIERS[zone];
  
  // Calculate confidence based on sample size
  // More matches = higher confidence
  const confidence = Math.min(1, matches.length / 10);
  
  return {
    baseline_cbit90: features.cbit90,
    baseline_cbirt90: features.cbirt90,
    baseline_extended90: features.cbitExtended90,
    variability_sigma: features.variability_sigma,
    role_multiplier,
    position,
    confidence,
  };
}

/**
 * Estimate probability of reaching DEFCON threshold
 * Uses Poisson approximation with profile data
 */
export function estimateDefconProbabilityFromProfile(
  profile: DefconProfile,
  expectedMinutes: number = 90
): number {
  if (profile.position === 'GOALKEEPER') return 0;

  // Scale baseline by expected minutes
  const minutesMultiplier = Math.min(1, expectedMinutes / 90);
  
  // Get lambda based on position
  const lambda = profile.position === 'DEFENDER'
    ? profile.baseline_cbit90 * minutesMultiplier
    : profile.baseline_cbirt90 * minutesMultiplier;
  
  // Threshold based on position
  const threshold = profile.position === 'DEFENDER' ? 10 : 12;
  
  // Poisson probability of reaching threshold
  if (lambda <= 0) return 0;
  
  // P(X >= threshold) = 1 - P(X < threshold)
  let cdf = 0;
  let term = Math.exp(-lambda);
  for (let k = 0; k < threshold; k++) {
    if (k > 0) term *= lambda / k;
    cdf += term;
  }
  
  return Math.max(0, Math.min(1, 1 - cdf));
}
