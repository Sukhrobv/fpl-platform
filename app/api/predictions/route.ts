import { NextResponse } from "next/server";
import { PrismaClient, Position, Prisma } from "@prisma/client";
import { PredictionService, PlayerInput, TeamInput, LeagueAverages } from "@/lib/services/predictionService";


const prisma = new PrismaClient();
const predictionService = new PredictionService();

/** ---------------------------------
 * Minutes model constants by position
 * --------------------------------- */
const MU_START: Record<Position, number> = {
  GOALKEEPER: 90,
  DEFENDER: 86,
  MIDFIELDER: 78,
  FORWARD: 79,
};
const P60_IF_START: Record<Position, number> = {
  GOALKEEPER: 0.99,
  DEFENDER: 0.88,
  MIDFIELDER: 0.82,
  FORWARD: 0.82,
};
const MU_CAMEO = 20;
const P_CAM_PRIOR = 0.35; // cameo prob if did not start

function clamp(x: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Infer p_start/p_cameo/minutes from SEASON TOTALS only.
 * chanceOfPlaying is used as AVAILABILITY MULTIPLIER, not as start chance.
 */
function inferStartFromSeason(opts: {
  seasonMinutes: number;     // M
  teamGamesPlayed: number;   // G
  position: Position;
  chanceOfPlaying?: number | null; // 0..100
}) {
  const { seasonMinutes, teamGamesPlayed, position, chanceOfPlaying } = opts;
  const G = Math.max(1, teamGamesPlayed || 0);
  const muStart = MU_START[position];
  const pCam = P_CAM_PRIOR;
  const muCam = MU_CAMEO;

  // Minutes identity per match:
  // E[min/game] = p_start*muStart + (1 - p_start)*pCam*muCam
  const eMin = (seasonMinutes || 0) / G;
  const denom = muStart - pCam * muCam; // ~ muStart - 7
  let pStartBase = denom > 0 ? (eMin - pCam * muCam) / denom : 0;
  pStartBase = clamp(pStartBase, 0, 1);

  const avail = typeof chanceOfPlaying === "number" ? clamp(chanceOfPlaying / 100) : 1;

  // Availability reduces chances; не повышаем p_start (мультипликативный кап)
  const p_start = clamp(pStartBase * avail, 0, 0.98);
  const p_cameo_uncond = clamp((1 - pStartBase) * pCam * avail, 0, 1 - p_start);

  const P60 = p_start * P60_IF_START[position];
  const E_min = p_start * muStart + p_cameo_uncond * muCam;

  // Proxy "minutes_recent" for form weight: expected minutes over next 5 GWs
  const minutes_recent_proxy = 5 * E_min;

  return { p_start, p_cameo_uncond, P60, E_min, minutes_recent_proxy };
}

/** Convert team season totals → per-match. If value is null, fallback is used. */
function perMatch(value: number | null | undefined, gamesPlayed: number, fallbackPerMatch: number) {
  const G = Math.max(1, gamesPlayed || 0);
  if (typeof value === "number") return value / G;      // convert total → per match
  return fallbackPerMatch;                              // already per-match fallback
}

/**
 * Phase A1: Safe per-match conversion with auto-detection
 * Prevents double division: if raw > 5 and games >= 5, it's likely a season total
 * Otherwise, it's already per-match
 */
function toPerMatchSafe(
  raw: number | null | undefined,
  gamesPlayed: number,
  fallbackPerMatch: number
): number {
  if (raw == null || !Number.isFinite(raw)) return fallbackPerMatch;
  const v = Number(raw);
  const n = Math.max(1, gamesPlayed || 0);
  // Auto-detect: if value > 5 and we have enough games, it's likely a total
  return v > 5 && n >= 5 ? v / n : v;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get("position");
    const teamId = searchParams.get("teamId");
    const range = parseInt(searchParams.get("range") || "5", 10);

    // 1) Next distinct gameweeks
    const nextFixtures = await prisma.match.findMany({
      where: { finished: false },
      orderBy: { gameweek: "asc" },
      select: { gameweek: true },
      distinct: ["gameweek"],
      take: range,
    });
    const gameweeks = nextFixtures.map((f) => f.gameweek);
    if (gameweeks.length === 0) {
      return NextResponse.json({ gameweeks: [], predictions: [] });
    }

    // 2) Games played per team (finished matches)
    const finishedMatches = await prisma.match.findMany({
      where: { finished: true },
      select: { homeTeamId: true, awayTeamId: true },
    });
    const gamesPlayedByTeam = new Map<number, number>();
    for (const m of finishedMatches) {
      gamesPlayedByTeam.set(m.homeTeamId, (gamesPlayedByTeam.get(m.homeTeamId) || 0) + 1);
      gamesPlayedByTeam.set(m.awayTeamId, (gamesPlayedByTeam.get(m.awayTeamId) || 0) + 1);
    }

    // 3) League avgs (exclude gw=0 if that's season totals in your DB)
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

    // 4) Fetch players + teams + opps for target GWs
    const where: Prisma.PlayerWhereInput = {};
    if (position) where.position = position.toUpperCase() as Position;
    if (teamId) where.teamId = parseInt(teamId, 10);

    const players = await prisma.player.findMany({
      where,
      include: {
        team: {
          include: {
            externalStats: { orderBy: { gameweek: "desc" }, take: 6 },
            homeMatches: {
              where: { gameweek: { in: gameweeks } },
              include: {
                awayTeam: {
                  include: { externalStats: { orderBy: { gameweek: "desc" }, take: 6 } },
                },
              },
            },
            awayMatches: {
              where: { gameweek: { in: gameweeks } },
              include: {
                homeTeam: {
                  include: { externalStats: { orderBy: { gameweek: "desc" }, take: 6 } },
                },
              },
            },
          },
        },
        externalStats: { orderBy: { gameweek: "desc" }, take: 6 },
      },
    });

    // 5) Build predictions
    const predictions = players
      .map((player) => {
        const team = player.team;
        const teamGamesPlayed = gamesPlayedByTeam.get(team.id) || 15;

        // Player season totals (prefer gw=0)
        const pSeason =
          player.externalStats.find((s) => s.gameweek === 0) ||
          player.externalStats[player.externalStats.length - 1] ||
          null;
        if (!pSeason) return null;

        const seasonMinutes = pSeason.minutes || 0;

        // Infer minutes/starts from SEASON data only
        const inf = inferStartFromSeason({
          seasonMinutes,
          teamGamesPlayed,
          position: player.position,
          chanceOfPlaying: player.chanceOfPlaying ?? null,
        });

        // Player per90 (raw; EB-shrink happens in service)
        const denom = Math.max(1, seasonMinutes);
        const xG90_season = ((pSeason.xG || 0) / denom) * 90;
        const xA90_season = ((pSeason.xA || 0) / denom) * 90;
        const shots90_season = ((pSeason.shots || 0) / denom) * 90;
        const keyPasses90_season = ((pSeason.keyPasses || 0) / denom) * 90;

        // Team season totals (prefer gw=0)
        const teamSeason =
          team.externalStats?.find((s) => s.gameweek === 0) ||
          team.externalStats?.[team.externalStats.length - 1] ||
          null;

        // We'll fill teamInput per fixture (only isHome differs), but per-match values same
        const teamPM = {
          xG90_season: toPerMatchSafe(teamSeason?.xG, teamGamesPlayed, 1.5),
          xGA90_season: toPerMatchSafe(teamSeason?.xGA, teamGamesPlayed, 1.5),
          deep_season: toPerMatchSafe(teamSeason?.deep, teamGamesPlayed, 8.0),
          ppda_season: teamSeason?.ppda ?? 12.0, // PPDA обычно среднее, не сумма
        };

        const basePlayerInput: Omit<PlayerInput, "id" | "name" | "position" | "price"> = {
          xG90_season,
          xA90_season,
          shots90_season,
          keyPasses90_season,

          minutes_recent: Math.round(inf.minutes_recent_proxy),
          season_minutes: seasonMinutes,
          start_probability: inf.p_start,
        };

        const gwData: Record<number, { xPts: number; fixture: string; opponent: string; isHome?: boolean; breakdown?: { appearance: number; attack: number; defense: number; bonus: number; other: number }; raw?: { xG: number; xA: number; csProb: number } }> = {};
        let totalXPts = 0;

        for (const gw of gameweeks) {
          const homeMatch = team.homeMatches.find((m) => m.gameweek === gw);
          const awayMatch = team.awayMatches.find((m) => m.gameweek === gw);

          let opponentTeam: { id: number; name: string; shortName: string; externalStats?: { gameweek: number; xG: number | null; xGA: number | null; deep: number | null; ppda: number | null }[] } | null = null;
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

          const oppGamesPlayed = gamesPlayedByTeam.get(opponentTeam.id) || 15;
          const oppSeason =
            opponentTeam.externalStats?.find((s) => s.gameweek === 0) ||
            opponentTeam.externalStats?.[opponentTeam.externalStats.length - 1] ||
            null;

          const opponentInput: TeamInput = {
            id: opponentTeam.id,
            name: opponentTeam.name,
            isHome: !isHome,
            xG90_season: toPerMatchSafe(oppSeason?.xG, oppGamesPlayed, 1.2),
            xGA90_season: toPerMatchSafe(oppSeason?.xGA, oppGamesPlayed, 1.5),
            deep_season: toPerMatchSafe(oppSeason?.deep, oppGamesPlayed, 5.0),
            ppda_season: oppSeason?.ppda ?? 12.0,
          };

          const teamInput: TeamInput = {
            id: team.id,
            name: team.name,
            isHome,
            ...teamPM,
          };

          const playerInput: PlayerInput = {
            id: player.id,
            name: player.webName,
            position: player.position,
            price: player.nowCost,
            ...basePlayerInput,
          };

          const pred = predictionService.calculateXPts(
            playerInput,
            teamInput,
            opponentInput,
            leagueAvg
          );

          gwData[gw] = {
            xPts: pred.xPts,
            fixture: fixtureStr,
            opponent: opponentTeam.shortName,
            isHome,
            breakdown: {
              appearance: pred.breakdown.appearance,
              attack: pred.breakdown.attack,
              defense: pred.breakdown.defense,
              bonus: pred.breakdown.bonus,
              other: pred.breakdown.other,
            },
            raw: {
              xG: pred.raw.xG,
              xA: pred.raw.xA,
              csProb: pred.raw.csProb,
            },
          };

          totalXPts += pred.xPts;
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
      .filter(Boolean) as { playerId: number; playerName: string; position: Position; price: number; team: string; teamShort: string; totalXPts: number; history: Record<number, unknown> }[];

    predictions.sort((a, b) => b.totalXPts - a.totalXPts);

    return NextResponse.json({ gameweeks, predictions });
  } catch (error) {
    console.error("Error generating predictions:", error);
    return NextResponse.json({ error: "Failed to generate predictions" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

