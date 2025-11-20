import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PredictionService, PlayerInput, TeamInput, LeagueAverages } from "@/lib/services/predictionService";

const prisma = new PrismaClient();
const predictionService = new PredictionService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get("position");
    const teamId = searchParams.get("teamId");
    const sort = searchParams.get("sort") || "xPts"; // xPts, price, form

    // 1. Determine Next Gameweek
    const nextFixture = await prisma.match.findFirst({
      where: { finished: false },
      orderBy: { gameweek: 'asc' },
      select: { gameweek: true }
    });
    const targetGW = nextFixture?.gameweek || 38; // Default to last if all finished (or handle season end)

    // 2. Fetch Players with Team, Stats, and Next Fixture
    const where: any = {};
    if (position) where.position = position.toUpperCase();
    if (teamId) where.teamId = parseInt(teamId);

    const players = await prisma.player.findMany({
      where,
      include: {
        team: {
          include: {
            externalStats: {
              orderBy: { gameweek: 'desc' },
              take: 1
            },
            // Fetch potential Home Match for this GW
            homeMatches: {
              where: { gameweek: targetGW },
              include: {
                awayTeam: {
                  include: {
                    externalStats: { orderBy: { gameweek: 'desc' }, take: 1 }
                  }
                }
              }
            },
            // Fetch potential Away Match for this GW
            awayMatches: {
              where: { gameweek: targetGW },
              include: {
                homeTeam: {
                  include: {
                    externalStats: { orderBy: { gameweek: 'desc' }, take: 1 }
                  }
                }
              }
            }
          }
        },
        externalStats: {
          orderBy: { gameweek: 'desc' },
          take: 1
        }
      }
    });

    // 3. Calculate League Averages (Simplified for V1)
    const leagueAvg: LeagueAverages = {
      avg_xG: 1.45,
      avg_xGA: 1.45,
      avg_deep: 6.5,
      avg_ppda: 11.5
    };

    // 4. Generate Predictions
    const predictions = players.map(player => {
      const team = player.team;
      const extStats = player.externalStats[0];

      // Skip if no stats (or handle gracefully)
      if (!extStats) return null;

      // Determine Match Context (Home or Away?)
      let opponentTeam: any = null;
      let isHome = false;

      if (team.homeMatches.length > 0) {
        isHome = true;
        opponentTeam = team.homeMatches[0].awayTeam;
      } else if (team.awayMatches.length > 0) {
        isHome = false;
        opponentTeam = team.awayMatches[0].homeTeam;
      } else {
        // Blank Gameweek for this player
        return {
            playerId: player.id,
            playerName: player.webName,
            xPts: 0,
            breakdown: { appearance: 0, attack: 0, defense: 0, bonus: 0, other: 0 },
            raw: { xG: 0, xA: 0, csProb: 0 },
            fixture: "BLANK"
        };
      }

      // Prepare Opponent Input
      const oppStats = opponentTeam.externalStats[0];
      // Fallback to league average if opponent has no stats (e.g. promoted team with missing data)
      const opponentInput: TeamInput = {
        id: opponentTeam.id,
        name: opponentTeam.name,
        isHome: !isHome,
        xG90_season: oppStats?.xG || 1.2,
        xGA90_season: oppStats?.xGA || 1.5,
        deep_season: oppStats?.deep || 5,
        ppda_season: oppStats?.ppda || 12
      };

      // Prepare Player Input
      const minutes = extStats.minutes || 1;
      const playerInput: PlayerInput = {
        id: player.id,
        name: player.webName,
        position: player.position,
        price: player.nowCost,
        xG90_season: (extStats.xG || 0) / minutes * 90,
        xA90_season: (extStats.xA || 0) / minutes * 90,
        shots90_season: (extStats.shots || 0) / minutes * 90,
        keyPasses90_season: (extStats.keyPasses || 0) / minutes * 90,
        minutes_recent: 450, // Assume nailed
        start_probability: player.chanceOfPlaying !== null ? player.chanceOfPlaying / 100 : 1.0
      };

      // Prepare Team Input
      const teamStats = team.externalStats[0];
      const teamInput: TeamInput = {
        id: team.id,
        name: team.name,
        isHome: isHome,
        xG90_season: teamStats?.xG || 1.5,
        xGA90_season: teamStats?.xGA || 1.5,
        deep_season: teamStats?.deep || 8,
        ppda_season: teamStats?.ppda || 12
      };

      const prediction = predictionService.calculateXPts(playerInput, teamInput, opponentInput, leagueAvg);
      
      // Add fixture info to result
      return {
        ...prediction,
        fixture: `${isHome ? '(H)' : '(A)'} vs ${opponentTeam.name}`
      };

    }).filter(Boolean);

    // 5. Sort
    predictions.sort((a: any, b: any) => (b.xPts || 0) - (a.xPts || 0));

    return NextResponse.json({
        gameweek: targetGW,
        predictions
    });
  } catch (error) {
    console.error("Error generating predictions:", error);
    return NextResponse.json({ error: "Failed to generate predictions" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
