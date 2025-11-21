import { Position } from "@prisma/client";

/* ==========================================
   Types & Interfaces
   ========================================== */

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
  // Per 90 (last5) - optional
  xG90_recent?: number;
  xA90_recent?: number;
  shots90_recent?: number;
  keyPasses90_recent?: number;
  // Minutes & availability
  minutes_recent: number;   // proxy за последние 5 (для form weight)
  season_minutes: number;   // суммарные минуты в сезоне (для EB-каппинга долей)
  start_probability: number; // 0..1
}

export interface TeamInput {
  id: number;
  name: string;
  isHome: boolean;
  // Per match (season)
  xG90_season: number;
  xGA90_season: number;
  deep_season: number;   // трактуем как deep_allowed (в защитном расчёте)
  ppda_season: number;
  // Last 5 (optional)
  xG90_recent?: number;
  xGA90_recent?: number;
  deep_recent?: number;
  ppda_recent?: number;
  // Context
  shotsAllowed90?: number; // если есть
  savesFactor?: number;    // если есть; иначе берём эвристику
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
    attack: number;   // Goals + Assists
    defense: number;  // CS + GC + Saves + DEFCON(DEF)
    bonus: number;
    other: number;    // Cards etc + DEFCON(MID/FWD)
  };
  raw: {
    xG: number;
    xA: number;
    csProb: number;
    // DEFCON diagnostics:
    defconProb?: number;       // P(достичь порога)
    defconMean?: number;       // ожидаемое кол-во оборон. действий
    defconThreshold?: number;  // порог (10 или 12)
  };
}

/* ==========================================
   Constants
   ========================================== */

const LEAGUE_AVERAGES_DEFAULT: LeagueAverages = {
  avg_xG: 1.5,
  avg_xGA: 1.5,
  avg_deep: 8.0,
  avg_ppda: 12.0,
};

// Позиционный мягкий ребаланс и клипы
const POSITION_SCALE_FACTORS: Record<Position, number> = {
  FORWARD: 1.0,
  MIDFIELDER: 1.0,
  DEFENDER: 0.92,
  GOALKEEPER: 0.85,
};

const POSITION_BOUNDS: Record<Position, { min: number; max: number }> = {
  GOALKEEPER: { min: 2.0, max: 5.5 },
  DEFENDER:   { min: 2.5, max: 6.0 },
  MIDFIELDER: { min: 2.0, max: 8.5 },
  FORWARD:    { min: 2.0, max: 9.0 },
};

// Роли (для долей участия и базовых DEFCON-частот)
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

const ROLE_PRIORS: Record<PlayerRole, RolePriors> = {
  Poacher:           { gShare: 0.40, aShare: 0.10 },
  CompleteForward:   { gShare: 0.30, aShare: 0.20 },
  Playmaker:         { gShare: 0.10, aShare: 0.25 },
  BoxToBox:          { gShare: 0.15, aShare: 0.15 },
  Winger:            { gShare: 0.15, aShare: 0.20 },
  AttackingDefender: { gShare: 0.08, aShare: 0.05 },
  StandardDefender:  { gShare: 0.02, aShare: 0.02 },
  Goalkeeper:        { gShare: 0.00, aShare: 0.00 },
};

/* ===== Базовые DEFCON-частоты (средние оборон. действия за 90′ по ролям) =====
   Это стартовые приоры — под калибровку по вашей истории:
   CB ~7.5; фулбеки/ВБ ~4.0; опорники/box-to-box ~3.5; плеймейкеры ~2.6; вингеры ~1.6;
   CF ~1.2; чистые «девятки» ~0.8; GK 0. */
const DEFCON_BASE_PER90: Record<PlayerRole, number> = {
  StandardDefender: 7.5,
  AttackingDefender: 4.0,
  BoxToBox: 3.5,
  Playmaker: 2.6,
  Winger: 1.6,
  CompleteForward: 1.2,
  Poacher: 0.8,
  Goalkeeper: 0.0,
};

/* ==========================================
   Service
   ========================================== */

export class PredictionService {

  public calculateXPts(
    player: PlayerInput,
    team: TeamInput,
    opponent: TeamInput,
    leagueAvg: LeagueAverages = LEAGUE_AVERAGES_DEFAULT
  ): PredictionResult {

    /* -------- 1) Player per90 blend -------- */
    const blendAlpha = (player.position === "FORWARD" || player.position === "MIDFIELDER") ? 0.60 : 0.50;
    const formWeight = Math.min(1, Math.max(0, player.minutes_recent) / 180);

    const xG90 = this.blend(player.xG90_season, player.xG90_recent, blendAlpha, formWeight);
    const xA90 = this.blend(player.xA90_season, player.xA90_recent, blendAlpha, formWeight);

    /* -------- 2) Team/opponent blends -------- */
    const teamAlpha = 0.55, teamFormWeight = 1.0;

    const team_xG90  = this.blend(team.xG90_season,  team.xG90_recent,  teamAlpha, teamFormWeight);
    const team_xGA90 = this.blend(team.xGA90_season, team.xGA90_recent, teamAlpha, teamFormWeight);
    const team_deep  = this.blend(team.deep_season,  team.deep_recent,  teamAlpha, teamFormWeight);
    const team_ppda  = this.blend(team.ppda_season,  team.ppda_recent,  teamAlpha, teamFormWeight);

    const opp_xG90   = this.blend(opponent.xG90_season,  opponent.xG90_recent,  teamAlpha, teamFormWeight);
    const opp_xGA90  = this.blend(opponent.xGA90_season, opponent.xGA90_recent, teamAlpha, teamFormWeight);
    const opp_deep   = this.blend(opponent.deep_season,  opponent.deep_recent,  teamAlpha, teamFormWeight);
    const opp_ppda   = this.blend(opponent.ppda_season,  opponent.ppda_recent,  teamAlpha, teamFormWeight);

    /* -------- 3) Match lambdas -------- */
    const lambda_att = this.lambdaAttack(team_xG90, opp_xGA90, opp_deep, team.isHome, leagueAvg);
    const lambda_def = this.lambdaDefense(opp_xG90, team_xGA90, team_deep, team.isHome, leagueAvg);
    const prob_cs    = Math.exp(-lambda_def);

    /* -------- 4) Role-based shares + EB bounds -------- */
    const team_xG_base = Math.max(0.1, team_xG90);
    const gShare_raw = xG90 / team_xG_base;
    const aShare_raw = xA90 / team_xG_base;

    const role = this.inferPlayerRole(player.position, xG90, xA90);
    const priors = ROLE_PRIORS[role];

    const shrinkage = Math.min(0.7, 180 / Math.max(1, player.season_minutes));
    let gShare = (1 - shrinkage) * gShare_raw + shrinkage * priors.gShare;
    let aShare = (1 - shrinkage) * aShare_raw + shrinkage * priors.aShare;

    const shareBounds = this.getShareBounds(player.season_minutes);
    gShare = Math.max(shareBounds.floor, Math.min(gShare, shareBounds.cap));
    aShare = Math.max(shareBounds.floor, Math.min(aShare, shareBounds.cap));

    /* -------- 5) Minutes model -------- */
    const avg_mins_start = this.getAvgMins(player.position);
    const cameo_prob =
      player.position === "GOALKEEPER" ? 0.05 :
      player.position === "DEFENDER"   ? 0.25 : 0.35;

    const p60_if_start =
      player.position === "GOALKEEPER" ? 0.99 :
      player.position === "DEFENDER"   ? 0.88 : 0.82;

    const expected_minutes =
      player.start_probability * avg_mins_start +
      (1 - player.start_probability) * cameo_prob * 20;

    const m_fac  = expected_minutes / 90.0;
    const prob_60 = player.start_probability * p60_if_start;
    const prob_app = player.start_probability + (1 - player.start_probability) * cameo_prob;

    /* -------- 6) Opponent context light (shots volume + PPDA for creators) -------- */
    const league_avg_shots = 12.0;
    const opp_shots_allowed = opponent.shotsAllowed90 ?? league_avg_shots;
    const shot_volume_factor = Math.pow(opp_shots_allowed / league_avg_shots, 0.25);
    const r_ppda = opp_ppda / leagueAvg.avg_ppda;

    /* -------- 7) Expected events (attack) -------- */
    let xG_hat = m_fac * lambda_att * gShare * shot_volume_factor;
    let xA_hat = m_fac * lambda_att * aShare * Math.pow(r_ppda, 0.20) * shot_volume_factor;

    /* -------- 8) FPL components -------- */
    // Appearance
    const pts_app = (2 * prob_60) + Math.max(0, (prob_app - prob_60));

    // Attack
    const goal_pts_val =
      player.position === "FORWARD"    ? 4 :
      player.position === "MIDFIELDER" ? 5 : 6;

    const pts_attack = goal_pts_val * xG_hat + 3 * xA_hat;

    // Defense (CS)
    let pts_cs = 0;
    if (player.position === "MIDFIELDER") {
      pts_cs = 1 * prob_cs * prob_60;
    } else if (player.position === "DEFENDER" || player.position === "GOALKEEPER") {
      pts_cs = 4 * prob_cs * prob_60;
    }

    // Defense (goals conceded penalty)
    let pts_gc = 0;
    if (player.position === "DEFENDER" || player.position === "GOALKEEPER") {
      const gcPenaltyPerGoal = (player.position === "GOALKEEPER") ? -0.60 : -0.50;
      pts_gc = gcPenaltyPerGoal * lambda_def * prob_60;
    }

    // GK saves
    let pts_saves = 0;
    let expected_saves = 0;
    if (player.position === "GOALKEEPER") {
      const team_saves_factor = (team.savesFactor != null)
        ? team.savesFactor
        : (team_xGA90 < leagueAvg.avg_xGA * 0.9 ? 1.6
           : team_xGA90 > leagueAvg.avg_xGA * 1.1 ? 2.2
           : 1.9);
      expected_saves = 2.1 * lambda_def * team_saves_factor;
      pts_saves = 0.75 * (expected_saves / 3.0) * prob_60;
    }

    // Bonus (прокси)
    let pts_bonus = 0;
    if (player.position === "FORWARD" || player.position === "MIDFIELDER") {
      pts_bonus = (0.28 * xG_hat) + (0.20 * xA_hat) + (0.10 * prob_cs);
    } else if (player.position === "DEFENDER") {
      pts_bonus = (0.70 * prob_cs) + (0.15 * (xG_hat + 0.7 * xA_hat));
    } else { // GK
      const opponent_quality = Math.min(1.5, opp_xG90 / leagueAvg.avg_xG);
      const bonus_multiplier = 0.7 + 0.3 * opponent_quality;
      pts_bonus = bonus_multiplier * ((0.45 * prob_cs) + (0.10 * (expected_saves / 3.0)));
    }

    /* -------- 9) DEFCON: Defensive Contribution points (официально в FPL 2025/26)
       DEF: +2 очка если >=10 CBIT; MID/FWD: +2 если >=12 CBIRT; кап = 2 очка/матч.
       Считаем ожидание как 2 * P(N >= threshold), где N ~ Poisson(mean).
       mean = base_per90(role) * exposure * m_fac * (recovery_boost для MID/FWD)
       exposure зависит от нагрузки на оборону: λ_def, team_deep, opp_xG90.  -------- */

    const defcon = this.computeDefconExpectedPoints({
      position: player.position,
      role,
      m_fac,
      lambda_def,
      team_deep,
      opp_xG90,
      team_ppda,
      opp_ppda,
      L: leagueAvg,
    });
    const defconPts = defcon.points; // ожидаемые DEFCON очки (0..2)

    // Сумма
    const total_xPts_raw =
      pts_app + pts_attack + pts_cs + pts_gc + pts_saves + pts_bonus + defconPts;

    const xPts_final = this.applyPositionCalibration(total_xPts_raw, player.position);

    // Разложение по бакетам
    const def_bucket = pts_cs + pts_gc + pts_saves + (player.position === "DEFENDER" ? defconPts : 0);
    const other_bucket = (player.position !== "DEFENDER" ? defconPts : 0) + 0; // тут же можно учесть карты и пр.

    return {
      playerId: player.id,
      playerName: player.name,
      xPts: Number(xPts_final.toFixed(2)),
      breakdown: {
        appearance: Number(pts_app.toFixed(2)),
        attack: Number(pts_attack.toFixed(2)),
        defense: Number(def_bucket.toFixed(2)),
        bonus: Number(pts_bonus.toFixed(2)),
        other: Number(other_bucket.toFixed(2)),
      },
      raw: {
        xG: Number(xG_hat.toFixed(2)),
        xA: Number(xA_hat.toFixed(2)),
        csProb: Number(prob_cs.toFixed(2)),
        defconProb: Number(defcon.prob.toFixed(2)),
        defconMean: Number(defcon.mean.toFixed(2)),
        defconThreshold: defcon.threshold,
      },
    };
  }

  /* ==========================================
     Helpers
     ========================================== */

  private blend(seasonVal: number, recentVal: number | undefined, alpha: number, weight: number): number {
    if (recentVal === undefined || !Number.isFinite(recentVal)) return seasonVal;
    const a = alpha * weight;
    return a * recentVal + (1 - a) * seasonVal;
  }

  private getAvgMins(pos: Position): number {
    switch (pos) {
      case "GOALKEEPER": return 90;
      case "DEFENDER":   return 85;
      case "MIDFIELDER": return 78;
      case "FORWARD":    return 79;
      default:           return 80;
    }
  }

  private getShareBounds(season_minutes: number): { floor: number; cap: number } {
    if (season_minutes < 180) {
      return { floor: 0.005, cap: 0.18 };
    } else if (season_minutes < 360) {
      return { floor: 0.005, cap: 0.25 };
    } else {
      return { floor: 0.03,  cap: 0.65 };
    }
  }

  private applyPositionCalibration(rawXPts: number, position: Position): number {
    const scaled = rawXPts * POSITION_SCALE_FACTORS[position];
    const bounds = POSITION_BOUNDS[position];
    return Math.max(bounds.min, Math.min(scaled, bounds.max));
  }

  // Лямбда атаки (лог-линейка)
  private lambdaAttack(
    team_xG: number,
    opp_xGA: number,
    opp_deep_allowed: number,
    home: boolean,
    L: LeagueAverages
  ): number {
    const μ = 1.45;
    const βA = 0.70, βD = 0.75, βDeep = 0.30, βH = 0.10;

    const val = Math.exp(
      Math.log(μ)
      + βA   * Math.log(Math.max(0.05, team_xG)          / L.avg_xG)
      - βD   * Math.log(Math.max(0.05, opp_xGA)          / L.avg_xGA)
      + βDeep* Math.log(Math.max(0.01, opp_deep_allowed) / L.avg_deep)
      + βH   * (home ? 1 : 0)
    );
    return Math.max(0.7, Math.min(2.6, val));
  }

  // Лямбда защиты (лог-линейка)
  private lambdaDefense(
    opp_xG: number,
    team_xGA: number,
    team_deep_allowed: number,
    home: boolean,
    L: LeagueAverages
  ): number {
    const μ = 1.45;
    const βA = 0.70, βD = 0.75, βDeep = 0.30, βH = 0.10;

    const val = Math.exp(
      Math.log(μ)
      + βA   * Math.log(Math.max(0.05, opp_xG)             / L.avg_xG)
      - βD   * Math.log(Math.max(0.05, team_xGA)           / L.avg_xGA)
      + βDeep* Math.log(Math.max(0.01, team_deep_allowed)  / L.avg_deep)
      - βH   * (home ? 1 : 0)
    );
    return Math.max(0.6, Math.min(2.3, val));
  }

  // Инференс роли (простая эвристика)
  private inferPlayerRole(position: Position, xG90: number, xA90: number): PlayerRole {
    if (position === "GOALKEEPER") return "Goalkeeper";

    if (position === "DEFENDER") {
      return (xG90 + xA90) > 0.10 ? "AttackingDefender" : "StandardDefender";
    }

    if (position === "MIDFIELDER") {
      const ratio = xG90 / Math.max(0.01, xA90);
      if (ratio > 1.2) return "BoxToBox";
      if (ratio < 0.6) return "Playmaker";
      return "Winger";
    }

    const ratio = xG90 / Math.max(0.01, xA90);
    return ratio > 2.0 ? "Poacher" : "CompleteForward";
  }

  /* ===== DEFCON expected points module (официальные defensive contributions) =====
     DEF: порог 10 (CBIT), MID/FWD: порог 12 (CBIRT с учётом recoveries).
     Источник правил и порогов: официальные материалы PL для FPL 2025/26. */

  private computeDefconExpectedPoints(args: {
    position: Position;
    role: PlayerRole;
    m_fac: number;       // E[min]/90
    lambda_def: number;
    team_deep: number;
    opp_xG90: number;
    team_ppda: number;
    opp_ppda: number;
    L: LeagueAverages;
  }): { prob: number; mean: number; threshold: number; points: number } {
    const { position, role, m_fac, lambda_def, team_deep, opp_xG90, team_ppda, opp_ppda, L } = args;

    // База по роли (за 90′)
    const base_per90 = DEFCON_BASE_PER90[role] ?? 0.0;

    // Экспозиция: чем больше нагрузки на нашу оборону, тем выше шанс DEFCON
    // λ_def — «сколько мы ожидаемо пропустим», team_deep — как часто пускаем «deep»,
    // opp_xG90 — сила атаки соперника.
    const expo =
      Math.pow(Math.max(0.05, lambda_def) / L.avg_xG, 0.45) *
      Math.pow(Math.max(0.01, team_deep)  / L.avg_deep, 0.45) *
      Math.pow(Math.max(0.05, opp_xG90)   / L.avg_xG, 0.10);

    // Среднее оборонительных действий за матч при ожидаемых минутах:
    let mean = base_per90 * expo * Math.max(0, m_fac);

    // Для MID/FWD добавим мягкий boost на recoveries из PPDA обеих команд:
    // Ниже PPDA → выше pressing/recoveries.
    if (position !== "DEFENDER" && position !== "GOALKEEPER") {
      const recovFactor = Math.pow(
        ((L.avg_ppda / Math.max(0.5, opp_ppda)) + (L.avg_ppda / Math.max(0.5, team_ppda))) / 2,
        0.30
      );
      // ограничим влияние:
      mean *= Math.max(0.85, Math.min(recovFactor, 1.25));
    }

    // Пороги по правилам:
    const threshold = position === "DEFENDER" ? 10 : 12; // DEF=10 CBIT; MID/FWD=12 CBIRT (с recoveries). 2 очка, кап за матч.
    const prob = this.poissonTail(threshold, mean);      // P(N >= threshold)
    const points = 2 * prob;                             // ожидаемые DEFCON очки

    return { prob, mean, threshold, points };
  }

  // Хвост Пуассона: P(X >= k) при X~Pois(mean)
  private poissonTail(k: number, mean: number): number {
    if (mean <= 0) return 0;
    const cutoff = Math.max(0, Math.floor(k)); // k — целый порог
    let term = Math.exp(-mean); // P0
    let cdf = term;             // P(X <= 0)
    for (let i = 1; i < cutoff; i++) {
      term *= mean / i;
      cdf += term;
      // небольшая защита от раздувания цикла:
      if (i > 200) break;
    }
    return Math.max(0, Math.min(1, 1 - cdf));
  }
}

export default PredictionService;
