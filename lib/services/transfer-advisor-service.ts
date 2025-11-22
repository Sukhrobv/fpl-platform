import { prisma } from "@/lib/db";
import { FPLContextService } from "./fpl-context-service";
import { FPLPredictionService } from "./fpl-prediction-service";
import { getBootstrapData } from "../fplClient";

export interface TransferRecommendation {
  playerOut: any & { xPts: number };
  playerIn: any & { xPts: number };
  xPtsDelta: number;
  reason: string;
  ownershipContext?: {
    eliteEo: number;
    isDifferential: boolean;
    isTemplate: boolean;
  };
}

export class TransferAdvisorService {
  private contextService = new FPLContextService();
  private predictionService = new FPLPredictionService();

  /**
   * Generates transfer recommendations for a user based on xPts.
   * Phase 3: Uses xPts projections for next 5 GWs.
   */
  async generateRecommendations(userId: number): Promise<TransferRecommendation[]> {
    // 1. Get User's latest squad
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
                    team: true,
                    externalStats: { orderBy: { gameweek: "desc" }, take: 1 }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user || user.fantasyTeams.length === 0) {
      return [];
    }

    const currentSquad = user.fantasyTeams[0];
    const currentGw = currentSquad.gameweek;
    
    // Determine next 5 GWs
    const bootstrap = await getBootstrapData();
    const nextEvent = bootstrap.events.find(e => e.is_next);
    if (!nextEvent) return []; // Season finished?
    
    const startGw = nextEvent.id;
    const gameweeks = Array.from({ length: 5 }, (_, i) => startGw + i);

    // Fetch Elite EO for context (using current GW for now, ideally next GW if available)
    const eliteEoMap = await this.contextService.getEliteOwnership(currentGw);

    // 2. Calculate xPts for current squad
    const squadPlayerIds = currentSquad.picks.map(p => p.playerId);
    const squadProjections = await this.predictionService.getProjections(gameweeks, { playerIds: squadPlayerIds });
    const squadProjMap = new Map(squadProjections.map(p => [p.playerId, p.totalXPts]));

    // 3. Identify weakest link (lowest projected xPts in starting XI)
    const startingXI = currentSquad.picks.filter(p => p.position <= 11);
    
    // Sort by projected xPts (asc)
    const sortedByXPts = [...startingXI].sort((a, b) => {
      const xPtsA = squadProjMap.get(a.playerId) || 0;
      const xPtsB = squadProjMap.get(b.playerId) || 0;
      return xPtsA - xPtsB;
    });
    
    // Take the worst player
    const playerOutPick = sortedByXPts[0];
    const playerOut = playerOutPick.player;
    const playerOutXPts = squadProjMap.get(playerOut.id) || 0;
    
    // 4. Find replacement
    // Same position, price <= sellingPrice + bank
    const budget = ((playerOutPick as any).sellingPrice || playerOut.nowCost) + currentSquad.bank;
    
    // Get top candidates by xPts for this position
    // We need to fetch projections for ALL players in this position within budget?
    // Optimization: Fetch top 50 by form/price first, then calculate xPts for them.
    // Or better: The prediction service can handle it if we pass filters.
    // But calculating for ALL players is heavy.
    // Let's fetch players who are fit and within budget, then project.
    
    const candidatePlayers = await prisma.player.findMany({
      where: {
        position: playerOut.position,
        nowCost: { lte: budget },
        id: { not: playerOut.id },
        status: 'a', // Available
        NOT: {
          id: { in: squadPlayerIds }
        }
      },
      orderBy: {
        form: 'desc' // Pre-filter by form to limit calculation size
      },
      take: 20, // Analyze top 20 candidates
      include: {
        team: true,
        externalStats: { orderBy: { gameweek: "desc" }, take: 1 }
      }
    });

    const candidateIds = candidatePlayers.map(p => p.id);
    const candidateProjections = await this.predictionService.getProjections(gameweeks, { playerIds: candidateIds });

    const recommendations: TransferRecommendation[] = [];

    for (const proj of candidateProjections) {
      const xPtsDelta = proj.totalXPts - playerOutXPts;
      
      if (xPtsDelta > 2.0) { // Minimum improvement threshold
        const candidate = candidatePlayers.find(p => p.id === proj.playerId);
        if (!candidate) continue;

        const eo = eliteEoMap[candidate.fplId] || 0;
        const isDifferential = eo < 10;
        const isTemplate = eo > 50;

        recommendations.push({
          playerOut: { ...playerOut, xPts: playerOutXPts },
          playerIn: { ...candidate, xPts: proj.totalXPts },
          xPtsDelta: xPtsDelta,
          reason: `Projected +${xPtsDelta.toFixed(1)} pts over 5 GWs`,
          ownershipContext: {
            eliteEo: eo,
            isDifferential,
            isTemplate
          }
        });
      }
    }

    // Sort by xPtsDelta
    return recommendations.sort((a, b) => b.xPtsDelta - a.xPtsDelta).slice(0, 5);
  }
}
