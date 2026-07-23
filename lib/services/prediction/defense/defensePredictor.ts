/**
 * A4.2: Defensive Actions Predictor
 * 
 * Predicts expected defensive actions for a player in an upcoming match.
 * Uses player profile, opponent context, and team factors.
 */

import { Position } from "@prisma/client";
import { DefconProfile, PlayerZone, estimateDefconProbabilityFromProfile } from "./defconProfile";

/**
 * Opponent attack context for defensive action prediction
 */
export interface OpponentAttackContext {
  // Opponent's attacking intensity (per 90)
  attacks_per_90: number;
  shots_per_90: number;
  
  // Zones where opponent attacks (0-1 distribution)
  left_flank_share: number;
  right_flank_share: number;
  central_share: number;
  
  // Opponent's crossing frequency (for aerial duels)
  crosses_per_90: number;
}

/**
 * Team context for defensive actions
 */
export interface TeamDefenseContext {
  // Team's pressing intensity (PPDA-based)
  pressing_intensity: number;  // 0-1, higher = more pressing
  
  // Team's possession share (affects recovery opportunities)
  avg_possession: number;  // 0-1
  
  // Expected game state (influences defensive needs)
  expected_win_prob: number;
  expected_draw_prob: number;
}

/**
 * Full context for defensive prediction
 */
export interface DefenseContext {
  opponent: OpponentAttackContext;
  team: TeamDefenseContext;
  player_zone: PlayerZone;
  expected_minutes: number;
}

/**
 * Result of defensive action prediction
 */
export interface DefensePrediction {
  expected_cbit: number;
  expected_cbirt: number;
  expected_aerial: number;
  prob_defcon: number;
  expected_defcon_points: number;
  confidence: number;
}

/**
 * Default opponent context when data unavailable
 */
export const DEFAULT_OPPONENT_CONTEXT: OpponentAttackContext = {
  attacks_per_90: 45,
  shots_per_90: 12,
  left_flank_share: 0.33,
  right_flank_share: 0.33,
  central_share: 0.34,
  crosses_per_90: 15,
};

/**
 * Default team context when data unavailable
 */
export const DEFAULT_TEAM_CONTEXT: TeamDefenseContext = {
  pressing_intensity: 0.5,
  avg_possession: 0.5,
  expected_win_prob: 0.33,
  expected_draw_prob: 0.33,
};

/**
 * Predict defensive actions for an upcoming match
 */
export function predictDefensiveActions(
  profile: DefconProfile,
  context: DefenseContext
): DefensePrediction {
  const { opponent, team, player_zone, expected_minutes } = context;
  
  // Minutes multiplier
  const minutesRatio = Math.min(1, expected_minutes / 90);
  
  // Base prediction from profile
  let expected_cbit = profile.baseline_cbit90 * minutesRatio;
  let expected_cbirt = profile.baseline_cbirt90 * minutesRatio;
  let expected_aerial = profile.baseline_extended90 - profile.baseline_cbit90; // Aerial portion
  
  // Opponent attack intensity modifier
  // More opponent attacks = more defensive actions
  const avgAttacks = 45; // League average
  const attackMultiplier = Math.sqrt(opponent.attacks_per_90 / avgAttacks);
  expected_cbit *= attackMultiplier;
  expected_cbirt *= attackMultiplier;
  
  // Zone matching modifier
  // Players in zones where opponent attacks more get more actions
  const zoneMultiplier = calculateZoneMultiplier(player_zone, opponent);
  expected_cbit *= zoneMultiplier;
  expected_cbirt *= zoneMultiplier;
  
  // Aerial duels from crosses
  const avgCrosses = 15; // League average
  const crossMultiplier = opponent.crosses_per_90 / avgCrosses;
  expected_aerial *= crossMultiplier;
  
  // Pressing intensity modifier
  // Higher pressing = more tackles/interceptions
  const pressingBoost = 1 + (team.pressing_intensity - 0.5) * 0.2;
  expected_cbit *= pressingBoost;
  expected_cbirt *= pressingBoost;
  
  // Possession modifier
  // Lower possession = more defensive actions needed
  const possessionModifier = 1 + (0.5 - team.avg_possession) * 0.3;
  expected_cbirt *= possessionModifier; // Especially affects recoveries
  
  // Game state modifier
  // Trailing = more desperate defending, but also more opponent attacks
  const gameStateMultiplier = 1 + (1 - team.expected_win_prob - team.expected_draw_prob * 0.5) * 0.15;
  expected_cbit *= gameStateMultiplier;
  
  // Apply role multiplier
  expected_cbit *= profile.role_multiplier;
  expected_cbirt *= profile.role_multiplier;
  expected_aerial *= profile.role_multiplier;
  
  // Calculate DEFCON probability
  const prob_defcon = estimateDefconProbabilityFromProfile(
    {
      ...profile,
      baseline_cbit90: expected_cbit / minutesRatio,
      baseline_cbirt90: expected_cbirt / minutesRatio,
    },
    expected_minutes
  );
  
  // Expected DEFCON points (max 2)
  const expected_defcon_points = prob_defcon * 2;
  
  // Combined confidence from profile and context availability
  const confidence = profile.confidence * 0.8 + 0.2;
  
  return {
    expected_cbit,
    expected_cbirt,
    expected_aerial,
    prob_defcon,
    expected_defcon_points,
    confidence,
  };
}

/**
 * Calculate zone multiplier based on opponent attack distribution
 */
function calculateZoneMultiplier(
  zone: PlayerZone,
  opponent: OpponentAttackContext
): number {
  switch (zone) {
    case 'CB':
      // CBs active vs central attacks
      return 0.7 + opponent.central_share * 0.6;
    case 'FB':
      // FBs active on flanks
      return 0.7 + Math.max(opponent.left_flank_share, opponent.right_flank_share) * 0.6;
    case 'WB':
      // Similar to FB but more mobile
      return 0.65 + Math.max(opponent.left_flank_share, opponent.right_flank_share) * 0.5;
    case 'DM':
      // DMs active everywhere but especially central
      return 0.75 + opponent.central_share * 0.4;
    case 'CM':
      // CMs less defensive
      return 0.6 + opponent.central_share * 0.3;
    case 'AM':
    case 'W':
    case 'ST':
      // Attacking players: minimal zone impact
      return 0.5;
    default:
      return 1.0;
  }
}

/**
 * Quick prediction with minimal context
 */
export function quickDefensePrediction(
  profile: DefconProfile,
  expectedMinutes: number = 90
): DefensePrediction {
  return predictDefensiveActions(profile, {
    opponent: DEFAULT_OPPONENT_CONTEXT,
    team: DEFAULT_TEAM_CONTEXT,
    player_zone: profile.position === 'DEFENDER' ? 'CB' : 
                 profile.position === 'MIDFIELDER' ? 'CM' : 'ST',
    expected_minutes: expectedMinutes,
  });
}
