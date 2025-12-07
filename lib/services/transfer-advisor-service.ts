import { prisma } from "@/lib/db";
import { FPLContextService } from "./fpl-context-service";
import { FPLPredictionService } from "./fpl-prediction-service";
import { getBootstrapData } from "../fplClient";

export interface TransferRecommendation {
  playerOut: any & { xPts: number; history?: Record<number, any> };
  playerIn: any & { xPts: number; history?: Record<number, any> };
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
    const squadProjMap = new Map(squadProjections.map(p => [p.playerId, p]));

    // 3. Identify weakest links (lowest projected xPts in starting XI)
    const startingXI = currentSquad.picks.filter(p => p.position <= 11);
    
    // Sort by projected xPts (asc)
    const sortedByXPts = [...startingXI].sort((a, b) => {
      const projA = squadProjMap.get(a.playerId);
      const projB = squadProjMap.get(b.playerId);
      return (projA?.totalXPts || 0) - (projB?.totalXPts || 0);
    });
    
    // Take bottom 3 players
    const candidatesOut = sortedByXPts.slice(0, 3);
    const recommendations: TransferRecommendation[] = [];

    for (const playerOutPick of candidatesOut) {
        const playerOut = playerOutPick.player;
        const playerOutProj = squadProjMap.get(playerOut.id);
        const playerOutXPts = playerOutProj?.totalXPts || 0;
        
        // 4. Find replacement for THIS player
        const budget = ((playerOutPick as any).sellingPrice || playerOut.nowCost) + currentSquad.bank;
        
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
            form: 'desc' 
          },
          take: 10, // Top 10 by form is enough for "best replacement" search
          include: {
            team: true,
            externalStats: { orderBy: { gameweek: "desc" }, take: 1 }
          }
        });

        const candidateIds = candidatePlayers.map(p => p.id);
        const candidateProjections = await this.predictionService.getProjections(gameweeks, { playerIds: candidateIds });

        // Find the BEST replacement for this specific playerOut
        let bestRec: TransferRecommendation | null = null;
        let maxDelta = 0;

        for (const proj of candidateProjections) {
          const xPtsDelta = proj.totalXPts - playerOutXPts;
          
          if (xPtsDelta > 1.5 && xPtsDelta > maxDelta) { // Lower threshold slightly to ensure we get options
            const candidate = candidatePlayers.find(p => p.id === proj.playerId);
            if (!candidate) continue;

            const eo = eliteEoMap[candidate.fplId] || 0;
            const isDifferential = eo < 10;
            const isTemplate = eo > 50;

            // If playerOut is missing from projections (e.g. < 5% start prob), generate 0-history
            const outHistory = playerOutProj?.history || gameweeks.reduce((acc, gw) => {
              acc[gw] = { xPts: 0, fixture: "-", opponent: "-" };
              return acc;
            }, {} as Record<number, any>);

            maxDelta = xPtsDelta;
            bestRec = {
              playerOut: { ...playerOut, xPts: playerOutXPts, history: outHistory },
              playerIn: { ...candidate, xPts: proj.totalXPts, history: proj.history },
              xPtsDelta: xPtsDelta,
              reason: `Upgrade ${playerOut.webName}: +${xPtsDelta.toFixed(1)} xPts`,
              ownershipContext: {
                eliteEo: eo,
                isDifferential,
                isTemplate
              }
            };
          }
        }

        if (bestRec) {
            recommendations.push(bestRec);
        }
    }

    // Sort recommendations by impact (xPtsDelta)
    return recommendations.sort((a, b) => b.xPtsDelta - a.xPtsDelta);
  }
}
