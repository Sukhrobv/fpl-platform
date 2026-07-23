import { Position } from "@prisma/client";

export interface PlayerInput {
  id: number;
  name: string;
  position: Position;
  price: number;
  // Per 90 (season)
  xG90_season: number;
  xA90_season: number;
  shots90_season: number;
  keyPasses90_season: number;
  touchesInBox90_season?: number; // B4: for involvement_score
  shotsOnTarget90_season?: number;
  npxG90_season?: number;
  npxA90_season?: number;
  // Per 90 (recent)
  xG90_recent: number;
  xA90_recent: number;
  shots90_recent: number;
  keyPasses90_recent: number;
  touchesInBox90_recent?: number; // B4: for involvement_score
  shotsOnTarget90_recent?: number;
  npxG90_recent?: number;
  npxA90_recent?: number;
  // Minutes & availability
  minutes_recent: number;
  season_minutes: number;
  start_probability: number;
}

export interface TeamInput {
  id: number;
  name: string;
  isHome: boolean;
  // Per match (season)
  xG90_season: number;
  xGA90_season: number;
  deep_season: number;
  ppda_season: number;
  pointsPerGame?: number;
  // Recent
  xG90_recent?: number;
  xGA90_recent?: number;
  deep_recent?: number;
  ppda_recent?: number;
  // Context
  shotsAllowed90?: number;
}

export interface LeagueAverages {
  avg_xG: number;
  avg_xGA: number;
  avg_deep: number;
  avg_ppda: number;
}

/**
 * Debug Trace: shows all intermediate calculations for transparency
 */
export interface DebugTrace {
  // Blending
  blends: {
    xG90: { season: number; recent: number; result: number; weight: number };
    xA90: { season: number; recent: number; result: number; weight: number };
    keyPasses90: { season: number; recent: number; result: number };
  };
  // Lambda calculations
  lambdas: {
    attack: number;
    defense: number;
  };
  // Minutes model
  minutes: {
    prob_start: number;
    prob_60: number;
    m_fac: number;
    expected_minutes: number;
  };
  // Attack calculations
  attack: {
    xG_hat: number;
    xA_hat: number;
    goalPoints: number;
    assistPoints: number;
    involvementScore: number;
    assistBoost: number;
    explosiveness: number;
    opp_adjustment: number;
  };
  // Defense calculations
  defense: {
    cs_pts_base: number;
    prob_cs: number;
    goals_conceded_penalty: number;
    result: number;
  };
  // DEFCON calculations
  defcon: {
    cbit90: number;
    cbirt90: number;
    prob_defcon: number;
    enabled: boolean;
  };
  // Bonus calculations
  bonus: {
    win_prob: number;
    isKeyPlayer: boolean;
    result: number;
  };
}

export interface PredictionResult {
  playerId: number;
  playerName: string;
  xPts: number;
  breakdown: {
    appearance: number;
    attack: number;
    defense: number;
    defcon: number; // B4.5: Defensive contributions points
    bonus: number;
    other: number;
  };
  raw: {
    xG: number;
    xA: number;
    csProb: number;
  };
  // Debug trace for transparency
  debug?: DebugTrace;
}
