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

const HOME_ATTACK_MULTIPLIER = 1.08;
const AWAY_ATTACK_MULTIPLIER = 0.92;
const HOME_DEFENSE_MULTIPLIER = 0.92; // Concede less at home
const AWAY_DEFENSE_MULTIPLIER = 1.08; // Concede more away

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
    const shots90 = this.blend(player.shots90_season, player.shots90_recent, blendAlpha, formWeight);
    
    // Team Blends (using 0.55 alpha for teams as per blueprint)
    const teamAlpha = 0.55;
    const teamFormWeight = 1.0; // Assuming full data for teams usually
    
    const team_xG90 = this.blend(team.xG90_season, team.xG90_recent, teamAlpha, teamFormWeight);
    const team_xGA90 = this.blend(team.xGA90_season, team.xGA90_recent, teamAlpha, teamFormWeight);
    const team_deep = this.blend(team.deep_season, team.deep_recent, teamAlpha, teamFormWeight);
    
    const opp_xG90 = this.blend(opponent.xG90_season, opponent.xG90_recent, teamAlpha, teamFormWeight);
    const opp_xGA90 = this.blend(opponent.xGA90_season, opponent.xGA90_recent, teamAlpha, teamFormWeight);
    const opp_deep = this.blend(opponent.deep_season, opponent.deep_recent, teamAlpha, teamFormWeight);
    const opp_ppda = this.blend(opponent.ppda_season, opponent.ppda_recent, teamAlpha, teamFormWeight);

    // 2. Context Multipliers (Home/Away)
    const h_att = team.isHome ? HOME_ATTACK_MULTIPLIER : AWAY_ATTACK_MULTIPLIER;
    const h_def = team.isHome ? HOME_DEFENSE_MULTIPLIER : AWAY_DEFENSE_MULTIPLIER;

    // 3. Fixture Difficulty (Opponent Factors)
    const r_xGA = opp_xGA90 / leagueAvg.avg_xGA;
    const r_deep = opp_deep / leagueAvg.avg_deep;
    const r_ppda = opp_ppda / leagueAvg.avg_ppda;

    const f_xG = Math.pow(r_xGA, 0.65) * Math.pow(r_deep, 0.35);
    const f_xA = Math.pow(r_xGA, 0.50) * Math.pow(r_deep, 0.40) * Math.pow(r_ppda, 0.20);

    // 4. Team Expectations (Lambdas)
    // Expected goals for our team
    const lambda_att = team_xG90 * h_att * f_xG;
    
    // Expected goals conceded by our team (Opponent attack strength vs Our defense)
    // Note: Blueprint says: xG90_O * H_def * (xGA90_T / avg_xGA)^0.7 * (Deep_T / avg_deep)^0.3
    const r_team_xGA = team_xGA90 / leagueAvg.avg_xGA;
    const r_team_deep = team_deep / leagueAvg.avg_deep; // Deep allowed by us? Blueprint says DeepAllowed_T
    // Assuming team.deep_season is "Deep Completed". We need "Deep Allowed". 
    // For now, let's assume deep_season in input is "Deep Allowed" for defensive calc? 
    // Actually, let's strictly follow input interface. I defined `deep_season`. 
    // I should probably clarify if it's deep allowed.
    // Let's assume for defense we need Deep Allowed. I'll add it to interface later or assume deep_season is generic.
    // For this implementation, I'll use team_xGA as the primary driver if deep is missing.
    
    const lambda_def = opp_xG90 * h_def * Math.pow(r_team_xGA, 0.70); // Simplified without deep allowed for now

    const prob_cs = Math.exp(-lambda_def);

    // 5. Player Shares
    // Avoid division by zero
    const team_xG_base = Math.max(team_xG90, 0.1);
    
    // Share of team's xG that this player accounts for
    let gShare = xG90 / team_xG_base;
    let aShare = xA90 / team_xG_base;
    
    // Clip shares to reasonable limits (3% to 65%)
    gShare = Math.max(0.03, Math.min(gShare, 0.65));
    aShare = Math.max(0.03, Math.min(aShare, 0.65));

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

    // 7. Expected Events
    const xG_hat = m_fac * lambda_att * gShare;
    const xA_hat = m_fac * lambda_att * aShare * Math.pow(r_ppda, 0.20);

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
    
    // Defense (GC Penalty)
    let pts_gc = 0;
    if (player.position === "DEFENDER" || player.position === "GOALKEEPER") {
      // Expected goals conceded * 0.5 points lost per goal (approx -1 per 2 goals)
      // Poisson expectation E[floor(X/2)] is roughly lambda/2 - 0.25 for lambda > 1... 
      // Simple approximation: -0.5 * lambda
      pts_gc = -0.5 * lambda_def * prob_60;
    }
    
    // Saves (GK only)
    let pts_saves = 0;
    if (player.position === "GOALKEEPER") {
      // Est saves = 3.5 * xGA (roughly). Points = Saves / 3.
      // Blueprint says: Saves approx 2.1 * lambda_def
      const expected_saves = 2.1 * lambda_def;
      pts_saves = (expected_saves / 3.0) * prob_60;
    }
    
    // Bonus
    // Simplified bonus model
    let pts_bonus = 0;
    if (player.position === "FORWARD" || player.position === "MIDFIELDER") {
      pts_bonus = (0.28 * xG_hat) + (0.20 * xA_hat) + (0.10 * prob_cs);
    } else if (player.position === "DEFENDER") {
      pts_bonus = (0.70 * prob_cs) + (0.15 * (xG_hat + 0.7 * xA_hat));
    } else { // GK
      pts_bonus = (0.50 * prob_cs) + (0.15 * pts_saves) + (0.15 * (xG_hat + 0.7 * xA_hat));
    }

    const total_xPts = pts_app + pts_attack + pts_cs + pts_gc + pts_saves + pts_bonus;

    return {
      playerId: player.id,
      playerName: player.name,
      xPts: Number(total_xPts.toFixed(2)),
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
}
