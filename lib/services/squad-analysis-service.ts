import { prisma } from "@/lib/db";
import { Position } from "@prisma/client";
import { FPLPredictionService } from "./fpl-prediction-service";
import { getBootstrapData } from "../fplClient";

export interface SquadProblem {
  type: "INJURY" | "BENCH_VALUE" | "FIXTURE_RISK" | "LOW_XPTS";
  severity: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  playerId?: number;
  playerName?: string;
}

export interface SquadHealth {
  score: number; // 0-100
  verdict: string;
  breakdown: {
    availability: number;
    fixtures: number;
    form: number;
  };
}

export class SquadAnalysisService {
  private predictionService = new FPLPredictionService();

  async analyzeSquad(userId: number): Promise<{ health: SquadHealth; problems: SquadProblem[] }> {
    // 1. Fetch Squad
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        fantasyTeams: {
          orderBy: { gameweek: "desc" },
          take: 1,
          include: {
            picks: {
              include: {
                player: {
                  include: {
                    team: {
                      include: {
                        homeMatches: { where: { finished: false }, take: 5, orderBy: { gameweek: "asc" } },
                        awayMatches: { where: { finished: false }, take: 5, orderBy: { gameweek: "asc" } },
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user || user.fantasyTeams.length === 0) {
      throw new Error("User squad not found");
    }

    const squad = user.fantasyTeams[0];
    const problems: SquadProblem[] = [];
    let healthScore = 100;
    
    // Breakdown scores (start at 100)
    let availabilityScore = 100;
    let fixturesScore = 100;
    let formScore = 100;

    // 2. Analyze Problems
    const startingXI = squad.picks.filter(p => p.position <= 11);
    const bench = squad.picks.filter(p => p.position > 11);

    // A. Injuries / Availability
    for (const pick of squad.picks) {
      const player = pick.player;
      if (player.status !== 'a' || (player.chanceOfPlaying !== null && player.chanceOfPlaying < 75)) {
        const isStarter = pick.position <= 11;
        const severity = isStarter ? "HIGH" : "MEDIUM";
        
        problems.push({
          type: "INJURY",
          severity,
          message: `${player.webName} is doubtful/injured (${player.news || 'Unknown'})`,
          playerId: player.id,
          playerName: player.webName
        });

        availabilityScore -= isStarter ? 15 : 5;
      }
    }

    // B. Bench Value
    const benchValue = bench.reduce((sum, p) => sum + ((p as any).sellingPrice || p.player.nowCost), 0);
    if (benchValue > 220) { // > 22.0m
      problems.push({
        type: "BENCH_VALUE",
        severity: "MEDIUM",
        message: `Too much budget on bench (£${(benchValue / 10).toFixed(1)}m). Upgrade your starting XI.`,
      });
      formScore -= 10;
    }

    // C. Fixture Risk (Simple check: next 3 games against top 6 teams?)
    // We need a better way to check difficulty. For now, let's use xPts projections.
    // If xPts for next 3 GWs is very low for a premium player.
    
    const bootstrap = await getBootstrapData();
    const nextEvent = bootstrap.events.find(e => e.is_next);
    if (nextEvent) {
      const startGw = nextEvent.id;
      const gameweeks = [startGw, startGw + 1, startGw + 2];
      
      const playerIds = startingXI.map(p => p.playerId);
      const projections = await this.predictionService.getProjections(gameweeks, { playerIds });
      
      for (const proj of projections) {
        const player = startingXI.find(p => p.playerId === proj.playerId)?.player;
        if (!player) continue;

        // If premium player (> 8.0m) has low xPts (< 10 in 3 GWs)
        if (player.nowCost > 80 && proj.totalXPts < 10) {
           problems.push({
            type: "FIXTURE_RISK",
            severity: "LOW",
            message: `${player.webName} (£${(player.nowCost/10).toFixed(1)}m) has tough fixtures/low xPts projected (${proj.totalXPts.toFixed(1)} pts / 3 GWs).`,
            playerId: player.id,
            playerName: player.webName
          });
          fixturesScore -= 5;
        }
      }
    }

    // 3. Calculate Final Health
    healthScore = Math.round((availabilityScore * 0.4) + (fixturesScore * 0.3) + (formScore * 0.3));
    healthScore = Math.max(0, Math.min(100, healthScore));

    let verdict = "Excellent";
    if (healthScore < 50) verdict = "Critical Attention Needed";
    else if (healthScore < 70) verdict = "Needs Improvement";
    else if (healthScore < 85) verdict = "Good";

    return {
      health: {
        score: healthScore,
        verdict,
        breakdown: {
          availability: Math.max(0, availabilityScore),
          fixtures: Math.max(0, fixturesScore),
          form: Math.max(0, formScore)
        }
      },
      problems
    };
  }
}
