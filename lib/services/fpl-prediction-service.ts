import { PrismaClient, Position, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
// Импортируем типы из твоего файла с движком (предполагаем, что он в @/lib/services/predictionService)
import { 
  PredictionService, 
  PlayerInput, 
  TeamInput, 
  LeagueAverages 
} from "@/lib/services/predictionService";

const predictionEngine = new PredictionService();

/** --------------------------------------------------------
 * CONSTANTS & CONFIG
 * -------------------------------------------------------- */
const POS_MINUTES_SETTINGS: Record<Position, { muStart: number; threshold: number }> = {
  GOALKEEPER: { muStart: 90, threshold: 85 },
  DEFENDER:   { muStart: 85, threshold: 60 },
  MIDFIELDER: { muStart: 80, threshold: 60 },
  FORWARD:    { muStart: 80, threshold: 60 },
};

const CAMEO_MINUTES = 20;

/** --------------------------------------------------------
 * MATH HELPERS
 * -------------------------------------------------------- */

function clamp(x: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Безопасное деление для расчета Per 90
 */
function safePer90(value: number | null | undefined, minutes: number): number {
  if (!value || !minutes || minutes < 30) return 0;
  return (value / minutes) * 90;
}

/**
 * Агрегатор статистики из массива (сумма)
 */
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
      // PPDA усредняем, а не суммируем
      ppdaSum: acc.ppdaSum + (curr.ppda || 0),
      count: acc.count + 1,
    }),
    { minutes: 0, xG: 0, xA: 0, shots: 0, keyPasses: 0, xGA: 0, deep: 0, ppdaSum: 0, count: 0 }
  );
}

/**
 * Продвинутый предиктор минут.
 * Учитывает "Recent Form" (последние 5 матчей) с весом 70% и "Season" с весом 30%.
 */
function predictMinutesAndProbability(opts: {
  position: Position;
  seasonStats: { minutes: number; games: number };
  recentStats: { minutes: number; games: number }; // Last 5-6 GWs
  chanceOfPlaying: number | null; // 0-100 from FPL API
}) {
  const { position, seasonStats, recentStats, chanceOfPlaying } = opts;
  const settings = POS_MINUTES_SETTINGS[position];

  // 1. Calculate Expected Minutes (Weighted)
  const seasonAvg = seasonStats.games > 0 ? seasonStats.minutes / seasonStats.games : 0;
  
  // Если не играл недавно, но есть в сезоне - считаем 0 (потерял место).
  // Если начал играть недавно - recent вытянет вверх.
  const recentAvg = recentStats.games > 0 ? recentStats.minutes / recentStats.games : seasonAvg;

  // WEIGHTS: 70% Recent, 30% Season (решает проблему Recency Bias)
  const weightRecent = 0.7;
  const expectedMinutesRaw = (recentAvg * weightRecent) + (seasonAvg * (1 - weightRecent));

  // 2. Infer Start Probability
  // Решаем уравнение: E_min = p_start * muStart + (1 - p_start) * p_cameo * muCameo
  // Упрощенно: p_start ~ (E_min - CameoExpected) / (StartMinutes - CameoExpected)
  
  const muStart = settings.muStart;
  const muCameo = CAMEO_MINUTES;
  const pCameoGivenBench = 0.35; // вероятность выхода, если на лавке
  const expectedCameoContribution = pCameoGivenBench * muCameo; // ~7 минут

  let pStartBase = (expectedMinutesRaw - expectedCameoContribution) / (muStart - expectedCameoContribution);
  pStartBase = clamp(pStartBase, 0, 1.0);

  // 3. Apply Availability (Chance of Playing)
  // Если шанс 75%, мы жестко режем ожидание старта
  const availability = chanceOfPlaying !== null ? chanceOfPlaying / 100 : 1.0;
  
  // Штраф за риск ротации (если minutes_recent > 400 за 5 матчей - риск усталости мал, если < 300 - риск)
  // В данной версии опустим сложную логику усталости, оставим Availability
  
  const start_probability = clamp(pStartBase * availability, 0, 0.99);
  
  // Minutes Proxy for engine form weights
  const minutes_recent_proxy = Math.round(recentStats.minutes); // Сумма за последние N

  return { 
    start_probability, 
    minutes_recent_proxy,
    expected_minutes: expectedMinutesRaw * availability 
  };
}


/** --------------------------------------------------------
 * SERVICE CLASS
 * -------------------------------------------------------- */

export class FPLPredictionService {
  
  async getProjections(
    gameweeks: number[], 
    filters: { position?: Position; teamId?: number; playerIds?: number[] } = {}
  ) {
    if (gameweeks.length === 0) return [];

    // 1. Fetch Finished Matches (для подсчета сыгранных игр команд)
    const finishedMatches = await prisma.match.findMany({
      where: { finished: true },
      select: { homeTeamId: true, awayTeamId: true },
    });
    
    const gamesPlayedByTeam = new Map<number, number>();
    for (const m of finishedMatches) {
      gamesPlayedByTeam.set(m.homeTeamId, (gamesPlayedByTeam.get(m.homeTeamId) || 0) + 1);
      gamesPlayedByTeam.set(m.awayTeamId, (gamesPlayedByTeam.get(m.awayTeamId) || 0) + 1);
    }

    // 2. League Averages (Understat source)
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

    // 3. Fetch Data
    const where: Prisma.PlayerWhereInput = {};
    if (filters.position) where.position = filters.position;
    if (filters.teamId) where.teamId = filters.teamId;
    if (filters.playerIds && filters.playerIds.length > 0) where.id = { in: filters.playerIds };

    // Берем последние 38 записей статистики, чтобы точно покрыть сезон + форму
    const STATS_TAKE = 38; 

    const players = await prisma.player.findMany({
      where,
      include: {
        team: {
          include: {
            // Берем статистику команды для оценки силы
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
        // Статистика игрока
        externalStats: { orderBy: { gameweek: "desc" }, take: STATS_TAKE },
      },
    });

    // 4. Build Predictions
    const predictions = players.map((player) => {
        const team = player.team;
        const teamTotalGames = gamesPlayedByTeam.get(team.id) || 1;

        // --- A. ANALYZE PLAYER DATA (Split Season vs Recent) ---
        // 1. Season Total (use GW=0 or sum all available)
        const pSeasonRaw = player.externalStats.find(s => s.gameweek === 0);
        let seasonMins = 0;
        
        // Явно указываем тип, чтобы TS не ругался
        let seasonStatsObj: { xG: number; xA: number; shots: number; keyPasses: number };

        if (pSeasonRaw) {
          seasonMins = pSeasonRaw.minutes || 0;
          // ИСПРАВЛЕНИЕ: Раскладываем объект вручную, заменяя null на 0
          seasonStatsObj = {
            xG: pSeasonRaw.xG || 0,
            xA: pSeasonRaw.xA || 0,
            shots: pSeasonRaw.shots || 0,
            keyPasses: pSeasonRaw.keyPasses || 0,
          };
        } else {
          // Fallback: sum manually
          const agg = aggregateStats(player.externalStats, 38);
          seasonMins = agg.minutes;
          seasonStatsObj = {
            xG: agg.xG,
            xA: agg.xA,
            shots: agg.shots,
            keyPasses: agg.keyPasses
          };
        }

        // 2. Recent Form (Last 5 played matches approximately)
        // Фильтруем записи, где игрок играл > 0 минут, берем последние 5
        const recentPlayedStats = player.externalStats
          .filter(s => s.gameweek > 0 && (s.minutes || 0) > 0)
          .slice(0, 5); // Last 5 appearances
        
        const aggRecent = aggregateStats(recentPlayedStats, 5);
        const recentMinsTotal = aggRecent.minutes; // Сумма минут за ласт 5 матчей

        // --- B. PREDICT MINUTES & START PROBABILITY ---
        const minPrediction = predictMinutesAndProbability({
          position: player.position,
          seasonStats: { minutes: seasonMins, games: teamTotalGames },
          recentStats: { minutes: recentMinsTotal, games: recentPlayedStats.length || 1 }, // games here is appearances
          chanceOfPlaying: player.chanceOfPlaying ?? null
        });



        // --- C. PREPARE PLAYER INPUT (Per 90s) ---
        const playerInput: PlayerInput = {
          id: player.id,
          name: player.webName,
          position: player.position,
          price: player.nowCost,
          
          // Season Per 90
          xG90_season: safePer90(seasonStatsObj.xG, seasonMins),
          xA90_season: safePer90(seasonStatsObj.xA, seasonMins),
          shots90_season: safePer90(seasonStatsObj.shots, seasonMins),
          keyPasses90_season: safePer90(seasonStatsObj.keyPasses, seasonMins),
          
          // Recent Per 90 (Form)
          xG90_recent: safePer90(aggRecent.xG, recentMinsTotal),
          xA90_recent: safePer90(aggRecent.xA, recentMinsTotal),
          shots90_recent: safePer90(aggRecent.shots, recentMinsTotal),
          keyPasses90_recent: safePer90(aggRecent.keyPasses, recentMinsTotal),
          
          // Minutes data
          minutes_recent: minPrediction.minutes_recent_proxy,
          season_minutes: seasonMins,
          start_probability: minPrediction.start_probability,
        };

        // --- D. ANALYZE TEAM & OPPONENT (Loop GWs) ---
        
        // Prepare Team Stats (Season vs Recent)
        const teamSeasonAgg = aggregateStats(team.externalStats.filter(s => s.gameweek > 0), 38);
        const teamRecentAgg = aggregateStats(team.externalStats.filter(s => s.gameweek > 0), 6); // Last 6 GWs
        
        const teamInputBase: Omit<TeamInput, "isHome"> = {
          id: team.id,
          name: team.name,
          
          // Season
          xG90_season: safePer90(teamSeasonAgg.xG, teamSeasonAgg.minutes / 11) || 1.5, // Approx minutes normalized
          xGA90_season: safePer90(teamSeasonAgg.xGA, teamSeasonAgg.minutes / 11) || 1.5,
          deep_season: safePer90(teamSeasonAgg.deep, teamSeasonAgg.minutes / 11) || 8.0,
          ppda_season: teamSeasonAgg.count ? teamSeasonAgg.ppdaSum / teamSeasonAgg.count : 12.0,

          // Recent
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

          // Opponent Stats Analysis (Crucial for match difficulty)
          const oppStatsRaw = opponentTeam.externalStats.filter((s: any) => s.gameweek > 0);
          const oppSeasonAgg = aggregateStats(oppStatsRaw, 38);
          const oppRecentAgg = aggregateStats(oppStatsRaw, 6); // Last 6 matches of opponent

          // Opponent Input Construction
          const opponentInput: TeamInput = {
            id: opponentTeam.id,
            name: opponentTeam.name,
            isHome: !isHome, // Opponent is home if we are away

            // Season Data
            xG90_season: safePer90(oppSeasonAgg.xG, oppSeasonAgg.minutes / 11) || 1.2,
            xGA90_season: safePer90(oppSeasonAgg.xGA, oppSeasonAgg.minutes / 11) || 1.5,
            deep_season: safePer90(oppSeasonAgg.deep, oppSeasonAgg.minutes / 11) || 5.0,
            ppda_season: oppSeasonAgg.count ? oppSeasonAgg.ppdaSum / oppSeasonAgg.count : 12.0,

            // Recent Data (To catch defensive form changes)
            xG90_recent: safePer90(oppRecentAgg.xG, oppRecentAgg.minutes / 11),
            xGA90_recent: safePer90(oppRecentAgg.xGA, oppRecentAgg.minutes / 11),
            deep_recent: safePer90(oppRecentAgg.deep, oppRecentAgg.minutes / 11),
            ppda_recent: oppRecentAgg.count ? oppRecentAgg.ppdaSum / oppRecentAgg.count : undefined,
            
            // Context extras
            shotsAllowed90: safePer90(oppRecentAgg.shots, oppRecentAgg.minutes / 11) || 12.0 // Approx shots conceded
          };

          const teamInput: TeamInput = {
            ...teamInputBase,
            isHome,
          };

          // --- E. CALCULATE! ---
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
      .filter(Boolean) as any[]; // Type cast for brevity

    return predictions.sort((a, b) => b.totalXPts - a.totalXPts);
  }
}