import { PrismaClient, Position, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// ==========================================
// 1. TYPES & INTERFACES (Exported for external use)
// ==========================================

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
  // Per 90 (recent)
  xG90_recent: number;
  xA90_recent: number;
  shots90_recent: number;
  keyPasses90_recent: number;
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

export interface PredictionResult {
  playerId: number;
  playerName: string;
  xPts: number;
  breakdown: {
    appearance: number;
    attack: number;
    defense: number;
    bonus: number;
    other: number;
  };
  raw: {
    xG: number;
    xA: number;
    csProb: number;
  };
}

// ==========================================
// 2. CONSTANTS & HELPERS
// ==========================================

const POS_MINUTES_SETTINGS: Record<Position, { muStart: number }> = {
  GOALKEEPER: { muStart: 90 },
  DEFENDER:   { muStart: 85 },
  MIDFIELDER: { muStart: 80 },
  FORWARD:    { muStart: 80 },
};

const CAMEO_MINUTES = 15;

function clamp(x: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}

function safePer90(value: number | null | undefined, minutes: number): number {
  if (!value || !minutes || minutes < 30) return 0;
  return (value / minutes) * 90;
}

function aggregateStats(stats: any[], take: number) {
  const sliced = stats.slice(0, take);
  return sliced.reduce(
    (acc, curr) => ({
      minutes: acc.minutes + (curr.minutes || 0),
      xG: acc.xG + (curr.xG || 0),
      xA: acc.xA + (curr.xA || 0),
      shots: acc.shots + (curr.shots || 0),
      keyPasses: acc.keyPasses + (curr.keyPasses || 0),
      xGA: acc.xGA + (curr.xGA || 0),
      deep: acc.deep + (curr.deep || 0),
      ppdaSum: acc.ppdaSum + (curr.ppda || 0),
      count: acc.count + 1,
    }),
    { minutes: 0, xG: 0, xA: 0, shots: 0, keyPasses: 0, xGA: 0, deep: 0, ppdaSum: 0, count: 0 }
  );
}

function predictMinutesAndProbability(opts: {
  position: Position;
  seasonStats: { minutes: number; games: number };
  recentStats: { minutes: number; games: number };
  chanceOfPlaying: number | null; 
}) {
  const { position, seasonStats, recentStats, chanceOfPlaying } = opts;
  const settings = POS_MINUTES_SETTINGS[position];

  const seasonAvg = seasonStats.games > 0 ? seasonStats.minutes / seasonStats.games : 0;
  
  // 1. ПРОВЕРКА НА "ЖЕЛЕЗНОСТЬ" (NAILED)
  const isNailed = seasonAvg > 70; 
  const weightRecent = isNailed ? 0.40 : 0.85; 

  const recentAvg = recentStats.games > 0 ? recentStats.minutes / recentStats.games : seasonAvg;
  const expectedMinutesRaw = (recentAvg * weightRecent) + (seasonAvg * (1 - weightRecent));

  const muStart = settings.muStart;
  const muCameo = CAMEO_MINUTES;
  
  let pStartBase = (expectedMinutesRaw - (0.3 * muCameo)) / (muStart - (0.3 * muCameo));
  
  if (isNailed) {
    pStartBase = Math.max(pStartBase, 0.85);
  }
  
  pStartBase = clamp(pStartBase, 0, 1.0);
  const availability = chanceOfPlaying !== null ? chanceOfPlaying / 100 : 1.0;
  const start_probability = clamp(pStartBase * availability, 0, 0.99);
  
  const final_expected_minutes = start_probability * muStart + (1 - start_probability) * 0.3 * muCameo;

  return { 
    start_probability, 
    minutes_recent_proxy: Math.round(recentStats.minutes),
    expected_minutes: final_expected_minutes 
  };
}

// ==========================================
// 3. MATH ENGINE (Core Logic)
// ==========================================

// EXPORT THIS CLASS so other files can import "PredictionService"
export class PredictionService {
  
  public calculateXPts(
    player: PlayerInput,
    team: TeamInput,
    opponent: TeamInput,
    leagueAvg: LeagueAverages
  ): PredictionResult {

    // 1. BLENDING
    const formWeight = Math.min(1, Math.max(0, player.minutes_recent) / 270); 
    const blendAlpha = 0.60; 

    const xG90 = this.blend(player.xG90_season, player.xG90_recent, blendAlpha, formWeight);
    const xA90 = this.blend(player.xA90_season, player.xA90_recent, blendAlpha, formWeight);

    const team_xG90  = this.blend(team.xG90_season,  team.xG90_recent,  0.5, 1);
    const team_xGA90 = this.blend(team.xGA90_season, team.xGA90_recent, 0.5, 1);
    const opp_xGA90  = this.blend(opponent.xGA90_season, opponent.xGA90_recent, 0.7, 1);
    const opp_deep   = this.blend(opponent.deep_season,  opponent.deep_recent,  0.6, 1);
    const opp_xG90   = this.blend(opponent.xG90_season,  opponent.xG90_recent,  0.5, 1);

    // 2. MATCH INTENSITY
    const lambda_att = this.lambdaAttack(team_xG90, opp_xGA90, opp_deep, team.isHome, leagueAvg);
    const lambda_def = this.lambdaDefense(opp_xG90, team_xGA90, team.deep_season, team.isHome, leagueAvg);
    
    const prob_cs = Math.exp(-lambda_def);
    
    const win_prob = lambda_att > lambda_def * 1.3 ? 0.65 : (lambda_att < lambda_def * 0.7 ? 0.2 : 0.35);

    // 3. EXPECTED RETURNS
    const prob_start = player.start_probability;
    const prob_60 = prob_start * 0.92; 
    
    const m_fac = (prob_start * (POS_MINUTES_SETTINGS[player.position].muStart / 90)) + 
                  ((1 - prob_start) * 0.05);

    const explosiveness = xG90 > 0.45 ? 1.15 : 1.0; 
    
    const team_xG_base = Math.max(0.1, team_xG90);
    const player_share_xG = (xG90 / team_xG_base);
    const player_share_xA = (xA90 / team_xG_base);

    const xG_hat = m_fac * lambda_att * player_share_xG * team_xG_base * explosiveness;
    const xA_hat = m_fac * lambda_att * player_share_xA * team_xG_base;

    // 4. SCORING
    const pts_app = (2 * prob_60) + (prob_start * 0.1); 

    const goal_pts = (player.position === "FORWARD" ? 4 : player.position === "MIDFIELDER" ? 5 : 6);
    const cs_pts   = (player.position === "FORWARD" ? 0 : player.position === "MIDFIELDER" ? 1 : 4);
    
    const pts_attack = (goal_pts * xG_hat) + (3 * xA_hat);
    
    const pts_defense = (cs_pts * prob_cs * prob_60) - 
                        (player.position === "DEFENDER" || player.position === "GOALKEEPER" 
                          ? 0.5 * lambda_def * prob_60 
                          : 0);

    // 5. SMART BONUS SYSTEM
    const pts_bonus = this.calculateSmartBonus({
        position: player.position,
        xG_hat,
        xA_hat,
        prob_cs,
        win_prob,
        isKeyPlayer: player.price > 8.0 
    });

    const total_raw = pts_app + pts_attack + pts_defense + pts_bonus;

    return {
       playerId: player.id,
       playerName: player.name,
       xPts: Number(total_raw.toFixed(2)),
       breakdown: {
         appearance: Number(pts_app.toFixed(2)),
         attack: Number(pts_attack.toFixed(2)),
         defense: Number(pts_defense.toFixed(2)),
         bonus: Number(pts_bonus.toFixed(2)),
         other: 0
       },
       raw: { xG: xG_hat, xA: xA_hat, csProb: prob_cs }
    };
  }

  // --- HELPERS ---

  private blend(season: number, recent: number | undefined, alpha: number, weight: number): number {
    if (recent === undefined) return season;
    const a = alpha * weight;
    return a * recent + (1 - a) * season;
  }

  private lambdaAttack(team_xG: number, opp_xGA: number, opp_deep: number, home: boolean, L: LeagueAverages): number {
    const beta = 0.85; 
    const betaH = 0.15; 
    const val = Math.exp(
       Math.log(L.avg_xG) 
       + beta * Math.log(Math.max(0.1, team_xG) / L.avg_xG)
       - beta * Math.log(Math.max(0.1, opp_xGA) / L.avg_xGA)
       + betaH * (home ? 1 : -0.1)
    );
    return Math.max(0.3, Math.min(3.8, val));
  }

  private lambdaDefense(opp_xG: number, team_xGA: number, team_deep: number, home: boolean, L: LeagueAverages): number {
    const beta = 0.85;
    const betaH = 0.15;
    const val = Math.exp(
      Math.log(L.avg_xGA)
      + beta * Math.log(Math.max(0.1, opp_xG) / L.avg_xG)
      - beta * Math.log(Math.max(0.1, team_xGA) / L.avg_xGA)
      - betaH * (home ? 1 : 0)
    );
    return Math.max(0.3, Math.min(3.5, val));
  }

  private calculateSmartBonus(opts: {
    position: Position;
    xG_hat: number;
    xA_hat: number;
    prob_cs: number;
    win_prob: number;
    isKeyPlayer: boolean;
  }): number {
    const { position, xG_hat, xA_hat, prob_cs, win_prob, isKeyPlayer } = opts;

    let prob_3 = 0, prob_2 = 0, prob_1 = 0;

    if (position === "FORWARD" || position === "MIDFIELDER") {
        const p_goal = 1 - Math.exp(-xG_hat);
        const p_brace = 1 - Math.exp(-xG_hat) * (1 + xG_hat); 
        
        prob_3 = p_brace * 0.85;
        prob_2 = (p_goal - p_brace) * 0.40;
        prob_1 = (p_goal - p_brace) * 0.30;
        
        if (xA_hat > 0.4) prob_1 += 0.2;
    } else {
        const p_return = 1 - Math.exp(-(xG_hat + xA_hat)); 
        prob_3 = (prob_cs * p_return) * 0.9;
        prob_2 = prob_cs * (1 - p_return) * 0.4; 
        prob_1 = prob_cs * (1 - p_return) * 0.4;
    }

    let expected_bonus = (3 * prob_3) + (2 * prob_2) + (1 * prob_1);

    expected_bonus *= (1 + win_prob * 0.2);
    if (isKeyPlayer) expected_bonus += 0.15;

    return Math.min(3, expected_bonus);
  }
}

// ==========================================
// 4. MAIN SERVICE
// ==========================================

const predictionEngine = new PredictionService();

export class FPLPredictionService {
  
  async getProjections(
    gameweeks: number[], 
    filters: { position?: Position; teamId?: number; playerIds?: number[] } = {}
  ) {
    if (gameweeks.length === 0) return [];

    const finishedMatches = await prisma.match.findMany({
      where: { finished: true },
      select: { homeTeamId: true, awayTeamId: true },
    });
    
    const gamesPlayedByTeam = new Map<number, number>();
    for (const m of finishedMatches) {
      gamesPlayedByTeam.set(m.homeTeamId, (gamesPlayedByTeam.get(m.homeTeamId) || 0) + 1);
      gamesPlayedByTeam.set(m.awayTeamId, (gamesPlayedByTeam.get(m.awayTeamId) || 0) + 1);
    }

    const leagueStats = await prisma.externalTeamStats.aggregate({
      _avg: { xG: true, xGA: true, deep: true, ppda: true },
      where: { source: "understat", gameweek: { gt: 0 } },
    });
    
    const leagueAvg: LeagueAverages = {
      avg_xG: leagueStats._avg.xG || 1.45,
      avg_xGA: leagueStats._avg.xGA || 1.45,
      avg_deep: leagueStats._avg.deep || 6.5,
      avg_ppda: leagueStats._avg.ppda || 11.5,
    };

    const where: Prisma.PlayerWhereInput = {};
    if (filters.position) where.position = filters.position;
    if (filters.teamId) where.teamId = filters.teamId;
    if (filters.playerIds && filters.playerIds.length > 0) where.id = { in: filters.playerIds };

    const STATS_TAKE = 38; 

    const players = await prisma.player.findMany({
      where,
      include: {
        team: {
          include: {
            externalStats: { orderBy: { gameweek: "desc" }, take: STATS_TAKE },
            homeMatches: {
              where: { gameweek: { in: gameweeks } },
              include: {
                awayTeam: {
                  include: { externalStats: { orderBy: { gameweek: "desc" }, take: STATS_TAKE } },
                },
              },
            },
            awayMatches: {
              where: { gameweek: { in: gameweeks } },
              include: {
                homeTeam: {
                  include: { externalStats: { orderBy: { gameweek: "desc" }, take: STATS_TAKE } },
                },
              },
            },
          },
        },
        externalStats: { orderBy: { gameweek: "desc" }, take: STATS_TAKE },
      },
    });

    const predictions = players.map((player) => {
        const team = player.team;
        const teamTotalGames = gamesPlayedByTeam.get(team.id) || 1;

        const pSeasonRaw = player.externalStats.find(s => s.gameweek === 0);
        let seasonMins = 0;
        
        // Manual object construction to avoid TS null errors
        let seasonStatsObj: { xG: number; xA: number; shots: number; keyPasses: number };

        if (pSeasonRaw) {
          seasonMins = pSeasonRaw.minutes || 0;
          seasonStatsObj = {
            xG: pSeasonRaw.xG || 0,
            xA: pSeasonRaw.xA || 0,
            shots: pSeasonRaw.shots || 0,
            keyPasses: pSeasonRaw.keyPasses || 0,
          };
        } else {
          const agg = aggregateStats(player.externalStats, 38);
          seasonMins = agg.minutes;
          seasonStatsObj = {
            xG: agg.xG,
            xA: agg.xA,
            shots: agg.shots,
            keyPasses: agg.keyPasses
          };
        }

        const recentPlayedStats = player.externalStats
          .filter(s => s.gameweek > 0 && (s.minutes || 0) > 0)
          .slice(0, 5);
        
        const aggRecent = aggregateStats(recentPlayedStats, 5);
        const recentMinsTotal = aggRecent.minutes;

        const minPrediction = predictMinutesAndProbability({
          position: player.position,
          seasonStats: { minutes: seasonMins, games: teamTotalGames },
          recentStats: { minutes: recentMinsTotal, games: recentPlayedStats.length || 1 },
          chanceOfPlaying: player.chanceOfPlaying ?? null
        });

        if (minPrediction.start_probability < 0.05) return null;

        const playerInput: PlayerInput = {
          id: player.id,
          name: player.webName,
          position: player.position,
          price: player.nowCost,
          
          xG90_season: safePer90(seasonStatsObj.xG, seasonMins),
          xA90_season: safePer90(seasonStatsObj.xA, seasonMins),
          shots90_season: safePer90(seasonStatsObj.shots, seasonMins),
          keyPasses90_season: safePer90(seasonStatsObj.keyPasses, seasonMins),
          
          xG90_recent: safePer90(aggRecent.xG, recentMinsTotal),
          xA90_recent: safePer90(aggRecent.xA, recentMinsTotal),
          shots90_recent: safePer90(aggRecent.shots, recentMinsTotal),
          keyPasses90_recent: safePer90(aggRecent.keyPasses, recentMinsTotal),
          
          minutes_recent: minPrediction.minutes_recent_proxy,
          season_minutes: seasonMins,
          start_probability: minPrediction.start_probability,
        };

        const teamSeasonAgg = aggregateStats(team.externalStats.filter(s => s.gameweek > 0), 38);
        const teamRecentAgg = aggregateStats(team.externalStats.filter(s => s.gameweek > 0), 6);
        
        const teamInputBase = {
          id: team.id,
          name: team.name,
          xG90_season: safePer90(teamSeasonAgg.xG, teamSeasonAgg.minutes / 11) || 1.5,
          xGA90_season: safePer90(teamSeasonAgg.xGA, teamSeasonAgg.minutes / 11) || 1.5,
          deep_season: safePer90(teamSeasonAgg.deep, teamSeasonAgg.minutes / 11) || 8.0,
          ppda_season: teamSeasonAgg.count ? teamSeasonAgg.ppdaSum / teamSeasonAgg.count : 12.0,

          xG90_recent: safePer90(teamRecentAgg.xG, teamRecentAgg.minutes / 11),
          xGA90_recent: safePer90(teamRecentAgg.xGA, teamRecentAgg.minutes / 11),
          deep_recent: safePer90(teamRecentAgg.deep, teamRecentAgg.minutes / 11),
          ppda_recent: teamRecentAgg.count ? teamRecentAgg.ppdaSum / teamRecentAgg.count : undefined,
        };

        const gwData: Record<number, any> = {};
        let totalXPts = 0;

        for (const gw of gameweeks) {
          const homeMatch = team.homeMatches.find((m) => m.gameweek === gw);
          const awayMatch = team.awayMatches.find((m) => m.gameweek === gw);

          let opponentTeam: any = null;
          let isHome = false;
          let fixtureStr = "BLANK";

          if (homeMatch) {
            isHome = true;
            opponentTeam = homeMatch.awayTeam;
            fixtureStr = `(H) vs ${opponentTeam.shortName}`;
          } else if (awayMatch) {
            isHome = false;
            opponentTeam = awayMatch.homeTeam;
            fixtureStr = `(A) vs ${opponentTeam.shortName}`;
          }

          if (!opponentTeam) {
            gwData[gw] = { xPts: 0, fixture: "-", opponent: "-" };
            continue;
          }

          const oppStatsRaw = opponentTeam.externalStats.filter((s: any) => s.gameweek > 0);
          const oppSeasonAgg = aggregateStats(oppStatsRaw, 38);
          const oppRecentAgg = aggregateStats(oppStatsRaw, 6); 

          const opponentInput: TeamInput = {
            id: opponentTeam.id,
            name: opponentTeam.name,
            isHome: !isHome,

            xG90_season: safePer90(oppSeasonAgg.xG, oppSeasonAgg.minutes / 11) || 1.2,
            xGA90_season: safePer90(oppSeasonAgg.xGA, oppSeasonAgg.minutes / 11) || 1.5,
            deep_season: safePer90(oppSeasonAgg.deep, oppSeasonAgg.minutes / 11) || 5.0,
            ppda_season: oppSeasonAgg.count ? oppSeasonAgg.ppdaSum / oppSeasonAgg.count : 12.0,

            xG90_recent: safePer90(oppRecentAgg.xG, oppRecentAgg.minutes / 11),
            xGA90_recent: safePer90(oppRecentAgg.xGA, oppRecentAgg.minutes / 11),
            deep_recent: safePer90(oppRecentAgg.deep, oppRecentAgg.minutes / 11),
            ppda_recent: oppRecentAgg.count ? oppRecentAgg.ppdaSum / oppRecentAgg.count : undefined,
            
            shotsAllowed90: safePer90(oppRecentAgg.shots, oppRecentAgg.minutes / 11) || 12.0 
          };

          const teamInput: TeamInput = { ...teamInputBase, isHome };

          const { xPts, breakdown, raw } = predictionEngine.calculateXPts(
            playerInput,
            teamInput,
            opponentInput,
            leagueAvg
          );

          gwData[gw] = {
            xPts,
            fixture: fixtureStr,
            opponent: opponentTeam.shortName,
            isHome,
            breakdown,
            raw,
          };

          totalXPts += xPts;
        }

        return {
          playerId: player.id,
          playerName: player.webName,
          position: player.position,
          price: player.nowCost,
          team: team.name,
          teamShort: team.shortName,
          totalXPts: Number(totalXPts.toFixed(2)),
          history: gwData,
        };
      })
      .filter(Boolean) as any[];

    return predictions.sort((a, b) => b.totalXPts - a.totalXPts);
  }
}