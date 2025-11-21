import { Position } from "@prisma/client";

// ==========================================
// Types & Interfaces
// ==========================================

export interface PlayerInput {
  id: number;
  name: string;
  position: Position;
  price: number;
  // Per 90 stats (Season)
  xG90_season: number;
  xA90_season: number;
  shots90_season: number;
  keyPasses90_season: number;
  // Per 90 stats (Last 5) - optional for V1, can fallback to season
  xG90_recent?: number;
  xA90_recent?: number;
  shots90_recent?: number;
  keyPasses90_recent?: number;
  // Minutes
  minutes_recent: number; // Total minutes in last 5 games (for form weight)
  season_minutes: number; // Total minutes this season (for dynamic share bounds)
  start_probability: number; // 0-1
}

export interface TeamInput {
  id: number;
  name: string;
  isHome: boolean;
  // Per 90 stats (Season)
  xG90_season: number;
  xGA90_season: number;
  deep_season: number;
  ppda_season: number; // Lower is more intense pressing
  // Per 90 stats (Last 5)
  xG90_recent?: number;
  xGA90_recent?: number;
  deep_recent?: number;
  ppda_recent?: number;
  // Phase B3/B4: New context fields
  shotsAllowed90?: number; // For shot volume adjustment
  savesFactor?: number;    // Team-specific GK save ability (default 1.0)
}

export interface LeagueAverages {
  avg_xG: number;
  avg_xGA: number;
  avg_deep: number;
  avg_ppda: number;
}

export interface PredictionResult {
  playerId: number;
  playerName: string;
  xPts: number;
  breakdown: {
    appearance: number;
    attack: number; // Goals + Assists
    defense: number; // CS + GC + Saves
    bonus: number;
    other: number; // Cards etc
  };
  raw: {
    xG: number;
    xA: number;
    csProb: number;
  };
}

// ==========================================
// Constants
// ==========================================

const LEAGUE_AVERAGES_DEFAULT: LeagueAverages = {
  avg_xG: 1.5,
  avg_xGA: 1.5,
  avg_deep: 8.0, // Estimated
  avg_ppda: 12.0, // Estimated
};

// v2 Quick Fixes D1: Position scaling to fix GK/DEF overvaluation and FWD undervaluation
const POSITION_SCALE_FACTORS: Record<Position, number> = {
  FORWARD: 1.0,      // Reset to 1.0 (Phase B improvements handle this)
  MIDFIELDER: 1.0,   // Reset to 1.0
  DEFENDER: 0.92,    // Keep reduction for defenders
  GOALKEEPER: 0.85   // Keep reduction for goalkeepers
};

// v2 Quick Fixes D1: Hard clips per position to prevent outliers
const POSITION_BOUNDS: Record<Position, { min: number; max: number }> = {
  GOALKEEPER: { min: 2.0, max: 5.5 },
  DEFENDER: { min: 2.5, max: 6.0 },
  MIDFIELDER: { min: 2.0, max: 8.5 },
  FORWARD: { min: 2.0, max: 9.0 }
};

// Phase B2: Player roles for personality-based predictions
type PlayerRole = 
  | "Poacher" 
  | "CompleteForward" 
  | "Playmaker" 
  | "BoxToBox" 
  | "Winger" 
  | "AttackingDefender" 
  | "StandardDefender" 
  | "Goalkeeper";

interface RolePriors {
  gShare: number;
  aShare: number;
}

// Phase B2: Role-based gShare/aShare priors
const ROLE_PRIORS: Record<PlayerRole, RolePriors> = {
  Poacher: { gShare: 0.40, aShare: 0.10 },           // High goal threat, low creativity
  CompleteForward: { gShare: 0.30, aShare: 0.20 },   // Balanced goal + assist threat
  Playmaker: { gShare: 0.10, aShare: 0.25 },         // High creativity, moderate goals (Reduced)
  BoxToBox: { gShare: 0.15, aShare: 0.15 },          // Balanced attacking midfielder (Reduced)
  Winger: { gShare: 0.15, aShare: 0.20 },            // Wide player, assists > goals (Reduced)
  AttackingDefender: { gShare: 0.08, aShare: 0.05 }, // Set-piece threat
  StandardDefender: { gShare: 0.02, aShare: 0.02 },  // Minimal attacking threat
  Goalkeeper: { gShare: 0.00, aShare: 0.00 }         // No attacking contribution
};

// ==========================================
// Service Class
// ==========================================

export class PredictionService {
  
  /**
   * Calculate xPts for a single player in a specific fixture
   */
  public calculateXPts(
    player: PlayerInput,
    team: TeamInput,
    opponent: TeamInput,
    leagueAvg: LeagueAverages = LEAGUE_AVERAGES_DEFAULT
  ): PredictionResult {
    
    // 1. Blend Stats (Season vs Recent)
    const blendAlpha = (player.position === "FORWARD" || player.position === "MIDFIELDER") ? 0.60 : 0.50;
    const formWeight = Math.min(1, player.minutes_recent / 180); // Shrinkage if played < 2 full games recently

    const xG90 = this.blend(player.xG90_season, player.xG90_recent, blendAlpha, formWeight);
    const xA90 = this.blend(player.xA90_season, player.xA90_recent, blendAlpha, formWeight);
    
    // Team Blends (using 0.55 alpha for teams as per blueprint)
    const teamAlpha = 0.55;
    const teamFormWeight = 1.0; // Assuming full data for teams usually
    
    const team_xG90 = this.blend(team.xG90_season, team.xG90_recent, teamAlpha, teamFormWeight);
    const team_xGA90 = this.blend(team.xGA90_season, team.xGA90_recent, teamAlpha, teamFormWeight);
    
    const opp_xG90 = this.blend(opponent.xG90_season, opponent.xG90_recent, teamAlpha, teamFormWeight);
    const opp_xGA90 = this.blend(opponent.xGA90_season, opponent.xGA90_recent, teamAlpha, teamFormWeight);
    const opp_deep = this.blend(opponent.deep_season, opponent.deep_recent, teamAlpha, teamFormWeight);
    const opp_ppda = this.blend(opponent.ppda_season, opponent.ppda_recent, teamAlpha, teamFormWeight);

    // 3. Fixture Difficulty (Opponent Factors)
    const r_ppda = opp_ppda / leagueAvg.avg_ppda;

    // Phase A2: Log-linear lambdas for realistic variance
    const lambda_att = this.lambdaAttack(team_xG90, opp_xGA90, opp_deep, team.isHome, leagueAvg);
    const lambda_def = this.lambdaDefense(opp_xG90, team_xGA90, opp_deep, team.isHome, leagueAvg);

    const prob_cs = Math.exp(-lambda_def);

    // 5. Player Shares with Role-Based Personality (Phase B2)
    // Avoid division by zero
    const team_xG_base = Math.max(team_xG90, 0.1);
    
    // Raw shares from player stats
    const gShare_raw = xG90 / team_xG_base;
    const aShare_raw = xA90 / team_xG_base;
    
    // Phase B2: Infer player role and apply Empirical Bayes shrinkage
    const role = this.inferPlayerRole(player.position, xG90, xA90);
    const priors = ROLE_PRIORS[role];
    
    // Empirical Bayes: shrink toward role prior based on sample size (minutes)
    // Low minutes → strong shrinkage toward prior
    // High minutes → use raw shares
    const shrinkage = Math.min(0.7, 180 / Math.max(1, player.season_minutes));
    let gShare = (1 - shrinkage) * gShare_raw + shrinkage * priors.gShare;
    let aShare = (1 - shrinkage) * aShare_raw + shrinkage * priors.aShare;
    
    // v2 Quick Fix D3: Apply dynamic share bounds
    const shareBounds = this.getShareBounds(player.season_minutes);
    gShare = Math.max(shareBounds.floor, Math.min(gShare, shareBounds.cap));
    aShare = Math.max(shareBounds.floor, Math.min(aShare, shareBounds.cap));

    // 6. Minutes / Nailedness
    // Simplified model: Expected Minutes = start_prob * avg_mins + (1-start_prob) * cameo_mins
    const avg_mins_start = this.getAvgMins(player.position);
    const avg_mins_cameo = 20;
    const cameo_prob = 0.35; // Chance of coming on if benched
    
    const expected_minutes = (player.start_probability * avg_mins_start) + 
                             ((1 - player.start_probability) * cameo_prob * avg_mins_cameo);
    
    const m_fac = expected_minutes / 90.0;
    
    // Probability of playing >= 60 mins (for CS points)
    // P(>=60) = P(Start) * P(StayOn | Start)
    // Simplified: P(>=60) approx P(Start) * 0.9 (for defenders)
    const prob_60 = player.start_probability * (player.position === "GOALKEEPER" ? 0.99 : 0.85);
    const prob_app = player.start_probability + ((1 - player.start_probability) * cameo_prob);

    // Phase B3: Opponent Context Factors (Shot Volume & Quality)
    // Adjust xG/xA based on opponent's shot volume allowed
    const opp_shots_allowed = opponent.shotsAllowed90 || 12.0; // fallback to league avg
    const league_avg_shots = 12.0;
    const shot_volume_factor = Math.pow(opp_shots_allowed / league_avg_shots, 0.25);
    
    // Quality adjustment is implicitly handled by lambda (xGA vs xG), 
    // but we can add a small explicit factor if needed. 
    // For now, let's stick to volume adjustment as per plan.

    // 7. Expected Events
    let xG_hat = m_fac * lambda_att * gShare;
    let xA_hat = m_fac * lambda_att * aShare * Math.pow(r_ppda, 0.20);
    
    // Apply shot volume factor
    xG_hat *= shot_volume_factor;
    // xA is also affected by how open the game is
    xA_hat *= shot_volume_factor;

    // 8. Points Calculation
    
    // Appearance
    const pts_app = (2 * prob_60) + (1 * (prob_app - prob_60));
    
    // Attack
    const goal_pts_val = player.position === "FORWARD" ? 4 : (player.position === "MIDFIELDER" ? 5 : 6);
    const pts_attack = (goal_pts_val * xG_hat) + (3 * xA_hat);
    
    // Defense (CS)
    let pts_cs = 0;
    if (player.position === "MIDFIELDER") {
      pts_cs = 1 * prob_cs * prob_60;
    } else if (player.position === "DEFENDER" || player.position === "GOALKEEPER") {
      pts_cs = 4 * prob_cs * prob_60;
    }
    
    // Defense (GC Penalty) - Phase A3: GK Balance
    let pts_gc = 0;
    if (player.position === "DEFENDER" || player.position === "GOALKEEPER") {
      // Stricter penalty for GK
      const gcPenalty = player.position === "GOALKEEPER" ? -0.60 : -0.50;
      pts_gc = gcPenalty * lambda_def * prob_60;
    }
    
    // Saves (GK only) - Phase A3: GK Balance
    // Phase B4: Team-specific save factor
    const team_saves_factor = team.savesFactor || 1.0;
    const expected_saves = player.position === "GOALKEEPER" ? 2.1 * lambda_def * team_saves_factor : 0;
    let pts_saves = 0;
    if (player.position === "GOALKEEPER") {
      // Reduced saves coefficient
      pts_saves = 0.75 * (expected_saves / 3.0) * prob_60; // was 1.0, now 0.75
    }
    
    // Bonus - Phase A3 + B4: GK Balance with opponent quality adjustment
    let pts_bonus = 0;
    if (player.position === "FORWARD" || player.position === "MIDFIELDER") {
      pts_bonus = (0.28 * xG_hat) + (0.20 * xA_hat) + (0.10 * prob_cs);
    } else if (player.position === "DEFENDER") {
      pts_bonus = (0.70 * prob_cs) + (0.15 * (xG_hat + 0.7 * xA_hat));
    } else { // GK - Phase B4: reduced bonus, adjusted by opponent quality
      // Bonus should decrease when facing weak attacks
      const opponent_quality = Math.min(1.5, opp_xG90 / leagueAvg.avg_xG);
      const bonus_multiplier = 0.7 + 0.3 * opponent_quality; // 0.7-1.0 range
      
      pts_bonus = bonus_multiplier * ((0.45 * prob_cs) + (0.10 * (expected_saves / 3.0)));
    }

    const total_xPts = pts_app + pts_attack + pts_cs + pts_gc + pts_saves + pts_bonus;

    // v2 Quick Fix D1: Apply position scaling and hard clips
    const scaled_xPts = this.applyPositionCalibration(total_xPts, player.position);

    return {
      playerId: player.id,
      playerName: player.name,
      xPts: Number(scaled_xPts.toFixed(2)),
      breakdown: {
        appearance: Number(pts_app.toFixed(2)),
        attack: Number(pts_attack.toFixed(2)),
        defense: Number((pts_cs + pts_gc + pts_saves).toFixed(2)),
        bonus: Number(pts_bonus.toFixed(2)),
        other: 0
      },
      raw: {
        xG: Number(xG_hat.toFixed(2)),
        xA: Number(xA_hat.toFixed(2)),
        csProb: Number(prob_cs.toFixed(2))
      }
    };
  }

  /**
   * Helper to blend season and recent stats
   */
  private blend(seasonVal: number, recentVal: number | undefined, alpha: number, weight: number): number {
    if (recentVal === undefined) return seasonVal;
    return (alpha * weight * recentVal) + ((1 - (alpha * weight)) * seasonVal);
  }

  private getAvgMins(pos: Position): number {
    switch (pos) {
      case "GOALKEEPER": return 90;
      case "DEFENDER": return 85;
      case "MIDFIELDER": return 78;
      case "FORWARD": return 79;
      default: return 80;
    }
  }

  /**
   * v2 Quick Fix D3: Dynamic share bounds based on season minutes
   * Prevents low-minute players from getting unrealistic shares
   */
  private getShareBounds(season_minutes: number): { floor: number; cap: number } {
    if (season_minutes < 180) {
      return { floor: 0.005, cap: 0.18 }; // Very low minutes: tight cap
    } else if (season_minutes < 360) {
      return { floor: 0.005, cap: 0.25 }; // Low minutes: moderate cap
    } else {
      return { floor: 0.03, cap: 0.65 }; // Regular players: standard bounds
    }
  }

  /**
   * v2 Quick Fix D1: Apply position scaling and hard clips
   * Fixes GK/DEF overvaluation and FWD undervaluation
   */
  private applyPositionCalibration(rawXPts: number, position: Position): number {
    // Apply position-specific scaling
    const scaled = rawXPts * POSITION_SCALE_FACTORS[position];
    
    // Apply hard clips to prevent outliers
    const bounds = POSITION_BOUNDS[position];
    return Math.max(bounds.min, Math.min(scaled, bounds.max));
  }

  /**
   * Phase A2: Log-linear lambda for attack
   * Realistic variance by opponent and home/away
   */
  private lambdaAttack(
    team_xG: number,
    opp_xGA: number,
    opp_deep: number,
    home: boolean,
    L: LeagueAverages
  ): number {
    const μ = 1.45;
    const βA = 0.70;    // Team attack strength
    const βD = 0.75;    // Opponent defense strength
    const βDeep = 0.30; // Opponent deep allowed
    const βH = 0.10;    // Home advantage

    const val = Math.exp(
      Math.log(μ) +
      βA * Math.log(Math.max(0.05, team_xG) / L.avg_xG) -
      βD * Math.log(Math.max(0.05, opp_xGA) / L.avg_xGA) +
      βDeep * Math.log(Math.max(0.01, opp_deep) / L.avg_deep) +
      βH * (home ? 1 : 0)
    );

    return Math.max(0.7, Math.min(2.6, val));
  }

  /**
   * Phase A2: Log-linear lambda for defense
   * Realistic variance by opponent and home/away
   */
  private lambdaDefense(
    opp_xG: number,
    team_xGA: number,
    opp_deep: number,
    home: boolean,
    L: LeagueAverages
  ): number {
    const μ = 1.45;
    const βA = 0.70;    // Opponent attack strength
    const βD = 0.75;    // Team defense strength
    const βDeep = 0.30; // Opponent deep (attacking pressure)
    const βH = 0.10;    // Home advantage (defensive)

    const val = Math.exp(
      Math.log(μ) +
      βA * Math.log(Math.max(0.05, opp_xG) / L.avg_xG) -
      βD * Math.log(Math.max(0.05, team_xGA) / L.avg_xGA) +
      βDeep * Math.log(Math.max(0.01, opp_deep) / L.avg_deep) -
      βH * (home ? 1 : 0)
    );

    return Math.max(0.6, Math.min(2.3, val));
  }

  /**
   * Phase B2: Infer player role from stats
   * Automatically classifies players based on xG90/xA90 ratios
   */
  private inferPlayerRole(
    position: Position,
    xG90: number,
    xA90: number
  ): PlayerRole {
    if (position === "GOALKEEPER") return "Goalkeeper";
    
    if (position === "DEFENDER") {
      // Attacking defender if xG90 + xA90 > 0.10
      return (xG90 + xA90) > 0.10 ? "AttackingDefender" : "StandardDefender";
    }
    
    if (position === "MIDFIELDER") {
      const ratio = xG90 / Math.max(0.01, xA90);
      if (ratio > 1.2) return "BoxToBox";      // More goals than assists
      if (ratio < 0.6) return "Playmaker";     // More assists than goals
      return "Winger";                         // Balanced or slightly assist-heavy
    }
    
    // FORWARD
    const ratio = xG90 / Math.max(0.01, xA90);
    return ratio > 2.0 ? "Poacher" : "CompleteForward";
  }
}
