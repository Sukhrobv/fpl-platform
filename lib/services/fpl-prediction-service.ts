import { Position, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  PredictionEngine,
  PlayerInput,
  TeamInput,
  LeagueAverages,
  predictMinutesAndProbability,
  safePer90Player,
  safePer90Team,
  aggregateStats,
  share,
} from "./prediction";

const predictionEngine = new PredictionEngine();

export class FPLPredictionService {
  async getProjections(
    gameweeks: number[],
    filters: { position?: Position; teamId?: number; playerIds?: number[] } = {}
  ) {
    if (gameweeks.length === 0) return [];

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
    if (filters.playerIds && filters.playerIds.length > 0) {
      where.id = { in: filters.playerIds };
    }

    const STATS_TAKE = 38;

    const players = await prisma.player.findMany({
      where,
      include: {
        team: {
          include: {
            externalStats: {
              orderBy: { gameweek: "desc" },
              take: STATS_TAKE,
            },
            homeMatches: {
              where: { gameweek: { in: gameweeks } },
              include: {
                awayTeam: {
                  include: {
                    externalStats: {
                      orderBy: { gameweek: "desc" },
                      take: STATS_TAKE,
                    },
                  },
                },
              },
            },
            awayMatches: {
              where: { gameweek: { in: gameweeks } },
              include: {
                homeTeam: {
                  include: {
                    externalStats: {
                      orderBy: { gameweek: "desc" },
                      take: STATS_TAKE,
                    },
                  },
                },
              },
            },
          },
        },
        externalStats: {
          orderBy: { gameweek: "desc" },
          take: STATS_TAKE,
        },
      },
    });

    const predictions = players
      .map((player) => {
        const team = player.team;
        const appearanceGames = player.externalStats.filter(
          (s) => s.gameweek > 0 && (s.minutes || 0) > 0
        ).length;
        const teamGamesSample = player.team.externalStats.filter((s) => s.gameweek > 0).length;
        const gamesPlayedForSeason = appearanceGames || teamGamesSample || 1;

        const pSeasonRaw = player.externalStats.find((s) => s.gameweek === 0);
        let seasonMins = 0;
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
            keyPasses: agg.keyPasses,
          };
        }

        const recentPlayedStats = player.externalStats
          .filter((s) => s.gameweek > 0 && (s.minutes || 0) > 0)
          .slice(0, 5);

        const aggRecent = aggregateStats(recentPlayedStats, 5);
        const recentMinsTotal = aggRecent.minutes;

        const minPrediction = predictMinutesAndProbability({
          position: player.position,
          seasonStats: { minutes: seasonMins, games: gamesPlayedForSeason },
          recentStats: {
            minutes: recentMinsTotal,
            games: Math.max(recentPlayedStats.length, 1),
          },
          chanceOfPlaying: player.chanceOfPlaying ?? null,
        });

        // if (minPrediction.start_probability < 0.05) return null;

        const playerInput: PlayerInput = {
          id: player.id,
          name: player.webName,
          position: player.position,
          price: player.nowCost,
          xG90_season: safePer90Player(seasonStatsObj.xG, seasonMins),
          xA90_season: safePer90Player(seasonStatsObj.xA, seasonMins),
          shots90_season: safePer90Player(seasonStatsObj.shots, seasonMins),
          keyPasses90_season: safePer90Player(seasonStatsObj.keyPasses, seasonMins),
          xG90_recent: safePer90Player(aggRecent.xG, recentMinsTotal),
          xA90_recent: safePer90Player(aggRecent.xA, recentMinsTotal),
          shots90_recent: safePer90Player(aggRecent.shots, recentMinsTotal),
          keyPasses90_recent: safePer90Player(aggRecent.keyPasses, recentMinsTotal),
          minutes_recent: minPrediction.minutes_recent_proxy,
          season_minutes: seasonMins,
          start_probability: minPrediction.start_probability,
        };

        const teamSeasonAgg = aggregateStats(team.externalStats.filter((s) => s.gameweek > 0), 38);
        const teamRecentAgg = aggregateStats(team.externalStats.filter((s) => s.gameweek > 0), 6);

        const teamInputBase: Omit<TeamInput, "isHome"> = {
          id: team.id,
          name: team.name,
          xG90_season: safePer90Team(teamSeasonAgg.xG, teamSeasonAgg.minutes / 11) || 1.5,
          xGA90_season: safePer90Team(teamSeasonAgg.xGA, teamSeasonAgg.minutes / 11) || 1.5,
          deep_season: safePer90Team(teamSeasonAgg.deep, teamSeasonAgg.minutes / 11) || 8.0,
          ppda_season: teamSeasonAgg.count ? teamSeasonAgg.ppdaSum / teamSeasonAgg.count : 12.0,
          xG90_recent: safePer90Team(teamRecentAgg.xG, teamRecentAgg.minutes / 11),
          xGA90_recent: safePer90Team(teamRecentAgg.xGA, teamRecentAgg.minutes / 11),
          deep_recent: safePer90Team(teamRecentAgg.deep, teamRecentAgg.minutes / 11),
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
            xG90_season: safePer90Team(oppSeasonAgg.xG, oppSeasonAgg.minutes / 11) || 1.2,
            xGA90_season: safePer90Team(oppSeasonAgg.xGA, oppSeasonAgg.minutes / 11) || 1.5,
            deep_season: safePer90Team(oppSeasonAgg.deep, oppSeasonAgg.minutes / 11) || 5.0,
            ppda_season: oppSeasonAgg.count ? oppSeasonAgg.ppdaSum / oppSeasonAgg.count : 12.0,
            xG90_recent: safePer90Team(oppRecentAgg.xG, oppRecentAgg.minutes / 11),
            xGA90_recent: safePer90Team(oppRecentAgg.xGA, oppRecentAgg.minutes / 11),
            deep_recent: safePer90Team(oppRecentAgg.deep, oppRecentAgg.minutes / 11),
            ppda_recent: oppRecentAgg.count ? oppRecentAgg.ppdaSum / oppRecentAgg.count : undefined,
            shotsAllowed90: safePer90Team(oppRecentAgg.shots, oppRecentAgg.minutes / 11) || 12.0,
          };

          const teamInput: TeamInput = {
            ...teamInputBase,
            isHome,
          };

          const { xPts, breakdown, raw } = predictionEngine.calculateXPts(
            playerInput,
            teamInput,
            opponentInput,
            leagueAvg
          );

          const extendedRaw = {
            ...raw,
            pStart: playerInput.start_probability,
            eMin: minPrediction.expected_minutes,
            oppXga90: opponentInput.xGA90_recent ?? opponentInput.xGA90_season,
            teamXg90: teamInput.xG90_recent ?? teamInput.xG90_season,
            oppDeep: opponentInput.deep_recent ?? opponentInput.deep_season,
            goalShare: share(
              playerInput.xG90_recent ?? playerInput.xG90_season,
              teamInput.xG90_recent ?? teamInput.xG90_season
            ),
            assistShare: share(
              playerInput.xA90_recent ?? playerInput.xA90_season,
              teamInput.xG90_recent ?? teamInput.xG90_season
            ),
          };

          const context = {
            player: {
              xG90_recent: playerInput.xG90_recent,
              xA90_recent: playerInput.xA90_recent,
              shots90_recent: playerInput.shots90_recent,
              xG90_season: playerInput.xG90_season,
              xA90_season: playerInput.xA90_season,
              shots90_season: playerInput.shots90_season,
            },
            opponent: {
              xGA90_recent: opponentInput.xGA90_recent,
              deep_recent: opponentInput.deep_recent,
              shotsAllowed90_recent: opponentInput.shotsAllowed90,
            },
            venue: { isHome },
          };

          gwData[gw] = {
            xPts,
            fixture: fixtureStr,
            opponent: opponentTeam.shortName,
            isHome,
            breakdown,
            raw: extendedRaw,
            context,
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
