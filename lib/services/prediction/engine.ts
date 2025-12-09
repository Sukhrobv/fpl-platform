import { POS_MINUTES_SETTINGS } from "./minutes";
import { lambdaAttack, lambdaDefense, calculateInvolvementScore, calculateAssistBoost, AttackContext } from "./attack";
import { calculateSmartBonus, calculatePoissonGoalPoints, calculatePoissonAssistPoints, calculateExpectedDefconPoints } from "./points";
import { LeagueAverages, PlayerInput, PredictionResult, TeamInput } from "./types";
import { DefenseFeatures } from "./features";

/** B4/B4.5: Extended context for attack and defense model calculations */
export interface EngineContext {
  attackContext?: AttackContext;
  /** B4.5: Defense features for DEFCON calculation */
  defenseFeatures?: DefenseFeatures;
}

export class PredictionEngine {
  calculateXPts(
    player: PlayerInput,
    team: TeamInput,
    opponent: TeamInput,
    leagueAvg: LeagueAverages,
    context?: EngineContext
  ): PredictionResult {
    const formWeight = Math.min(1, Math.max(0, player.minutes_recent) / 270);
    const blendAlpha = 0.6;

    const xG90 = this.blend(player.xG90_season, player.xG90_recent, blendAlpha, formWeight);
    const xA90 = this.blend(player.xA90_season, player.xA90_recent, blendAlpha, formWeight);
    const keyPasses90 = this.blend(player.keyPasses90_season, player.keyPasses90_recent, blendAlpha, formWeight);
    const touchesInBox90 = this.blend(
      player.touchesInBox90_season ?? 0,
      player.touchesInBox90_recent,
      blendAlpha,
      formWeight
    );

    const team_xG90 = this.blend(team.xG90_season, team.xG90_recent, 0.5, 1);
    const team_xGA90 = this.blend(team.xGA90_season, team.xGA90_recent, 0.5, 1);
    const opp_xGA90 = this.blend(opponent.xGA90_season, opponent.xGA90_recent, 0.7, 1);
    const opp_deep = this.blend(opponent.deep_season, opponent.deep_recent, 0.6, 1);
    const opp_xG90 = this.blend(opponent.xG90_season, opponent.xG90_recent, 0.5, 1);

    // B4: Pass attack context to lambdaAttack for trend adjustments
    const lambda_att = lambdaAttack(team_xG90, opp_xGA90, opp_deep, team.isHome, leagueAvg, context?.attackContext);
    const lambda_def = lambdaDefense(opp_xG90, team_xGA90, team.deep_season, team.isHome, leagueAvg);

    const prob_cs = Math.exp(-lambda_def);
    const win_prob = lambda_att > lambda_def * 1.3 ? 0.65 : lambda_att < lambda_def * 0.7 ? 0.2 : 0.35;

    const prob_start = player.start_probability;
    const prob_60 = prob_start * 0.92;

    const m_fac =
      prob_start * (POS_MINUTES_SETTINGS[player.position].muStart / 90) +
      (1 - prob_start) * 0.05;

    const explosiveness = xG90 > 0.45 ? 1.05 : 1.0; // Fixed: reduced from 1.15

    const team_xG_base = Math.max(0.1, team_xG90);
    const player_share_xG = xG90 / team_xG_base;
    const player_share_xA = xA90 / team_xG_base;

    // B4: Calculate involvement score for attack centrality
    const involvementScore = calculateInvolvementScore({
      xG90,
      xA90,
      keyPasses90,
      touchesInBox90,
      teamXg90: team_xG90,
    });

    // B4: Calculate assist boost for expected key passes analysis
    const assistBoost = calculateAssistBoost({
      xA90,
      keyPasses90,
      leagueAvgXa90: 0.15,
    });

    // B4: Apply involvement multiplier (high involvement = more reliable)
    const involvementMultiplier = 1 + involvementScore * 0.05; // Fixed: reduced from 0.15

    // Opponent adjustment: how much better/worse opponent is than league average
    const opp_adjustment = lambda_att > 1.0 ? Math.min(1.15, lambda_att) : Math.max(0.85, lambda_att);

    // xG_hat: expected xG for THIS match = player's xG90 rate * match-adjusted minutes * opponent adjustment
    // Simplified formula: no longer multiplies player_share * team_xG (which just equals xG90)
    const xG_hat = m_fac * xG90 * opp_adjustment * explosiveness;
    const xA_hat = m_fac * xA90 * opp_adjustment * (1 + assistBoost * 0.5);

    const pts_app = 2 * prob_60 + prob_start * 0.1;

    // B5: Use Poisson distribution for more accurate attack points
    const goalPtsResult = calculatePoissonGoalPoints({
      xG: xG_hat,
      position: player.position,
    });
    const assistPtsResult = calculatePoissonAssistPoints({
      xA: xA_hat,
    });
    const pts_attack = goalPtsResult.expectedPoints + assistPtsResult.expectedPoints;

    const cs_pts = player.position === "FORWARD" ? 0 : player.position === "MIDFIELDER" ? 1 : 4;

    const pts_defense =
      cs_pts * prob_cs * prob_60 -
      (player.position === "DEFENDER" || player.position === "GOALKEEPER" ? 0.5 * lambda_def * prob_60 : 0);

    // B4.5: Calculate expected DEFCON points
    const pts_defcon = context?.defenseFeatures
      ? calculateExpectedDefconPoints({
          position: player.position,
          cbit90: context.defenseFeatures.cbit90,
          cbirt90: context.defenseFeatures.cbirt90,
          prob_60,
        })
      : 0;

    const pts_bonus = calculateSmartBonus({
      position: player.position,
      xG_hat,
      xA_hat,
      prob_cs,
      win_prob,
      isKeyPlayer: player.price > 8.0,
    });

    const total_raw = pts_app + pts_attack + pts_defense + pts_defcon + pts_bonus;

    return {
      playerId: player.id,
      playerName: player.name,
      xPts: Number(total_raw.toFixed(2)),
      breakdown: {
        appearance: Number(pts_app.toFixed(2)),
        attack: Number(pts_attack.toFixed(2)),
        defense: Number(pts_defense.toFixed(2)),
        defcon: Number(pts_defcon.toFixed(2)),
        bonus: Number(pts_bonus.toFixed(2)),
        other: 0,
      },
      raw: { xG: xG_hat, xA: xA_hat, csProb: prob_cs },
    };
  }

  private blend(season: number, recent: number | undefined, alpha: number, weight: number): number {
    if (recent === undefined) return season;
    const a = alpha * weight;
    return a * recent + (1 - a) * season;
  }
}
