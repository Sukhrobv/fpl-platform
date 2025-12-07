import { prisma } from "@/lib/db";
import { FPLPredictionService } from "./fpl-prediction-service";
import { getBootstrapData } from "../fplClient";

export interface ChipRecommendation {
  chip: "wildcard" | "bench_boost" | "triple_captain" | "free_hit";
  confidence: number; // 0-100
  reasoning: string;
  expectedValue: number; // estimated points gain
  trigger: string; // what triggered this recommendation
}

export class ChipStrategyService {
  private predictionService = new FPLPredictionService();

  async analyzeChipOpportunities(userId: number): Promise<ChipRecommendation[]> {
    const recommendations: ChipRecommendation[] = [];

    // Get user's squad
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
                  include: { team: true }
                }
              }
            }
          }
        }
      }
    });

    if (!user || user.fantasyTeams.length === 0) return [];

    const squad = user.fantasyTeams[0];
    const bootstrap = await getBootstrapData();
    const nextEvent = bootstrap.events.find(e => e.is_next);
    if (!nextEvent) return [];

    const currentGw = nextEvent.id;

    // Check each chip
    if (squad.wildcardAvailable) {
      const wcRec = await this.evaluateWildcard(squad, currentGw);
      if (wcRec) recommendations.push(wcRec);
    }

    if (squad.benchBoostAvailable) {
      const bbRec = await this.evaluateBenchBoost(squad, currentGw);
      if (bbRec) recommendations.push(bbRec);
    }

    if (squad.tripleCaptainAvailable) {
      const tcRec = await this.evaluateTripleCaptain(squad, currentGw);
      if (tcRec) recommendations.push(tcRec);
    }

    if (squad.freeHitAvailable) {
      const fhRec = await this.evaluateFreeHit(squad, currentGw);
      if (fhRec) recommendations.push(fhRec);
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  private async evaluateWildcard(squad: any, currentGw: number): Promise<ChipRecommendation | null> {
    // Triggers for Wildcard:
    // 1. Many injured/unavailable players (>3)
    // 2. Expensive bench (>25m)
    // 3. Poor upcoming fixtures overall + ability to upgrade

    let confidence = 0;
    let reasons: string[] = [];
    let expectedValue = 0;

    // Count unavailable players
    const unavailable = squad.picks.filter((p: any) => 
      p.player.status !== 'a' || (p.player.chanceOfPlaying !== null && p.player.chanceOfPlaying < 75)
    );

    if (unavailable.length >= 4) {
      confidence += 40;
      reasons.push(`${unavailable.length} players unavailable/doubtful`);
      expectedValue += unavailable.length * 3; // ~3pts per fixed player
    } else if (unavailable.length >= 2) {
      confidence += 20;
      reasons.push(`${unavailable.length} players with availability issues`);
      expectedValue += unavailable.length * 2;
    }

    // Check bench value
    const bench = squad.picks.filter((p: any) => p.position > 11);
    const benchValue = bench.reduce((sum: number, p: any) => sum + p.player.nowCost, 0);

    if (benchValue > 250) { // >25.0m
      confidence += 30;
      reasons.push(`£${(benchValue / 10).toFixed(1)}m stuck on bench`);
      expectedValue += 10; // potential upgrade gain
    }

    // Check next 5 GW fixtures potential
    const gameweeks = Array.from({ length: 5 }, (_, i) => currentGw + i);
    const playerIds = squad.picks.map((p: any) => p.playerId);
    const projections = await this.predictionService.getProjections(gameweeks, { playerIds });
    
    const avgXPts = projections.reduce((sum, p) => sum + p.totalXPts, 0) / projections.length;

    if (avgXPts < 15) { // Low projected xPts
      confidence += 30;
      reasons.push(`Low xPts projection (avg ${avgXPts.toFixed(1)} over 5 GWs)`);
      expectedValue += 15;
    }

    // Only recommend if confidence >50
    if (confidence < 50) return null;

    return {
      chip: "wildcard",
      confidence: Math.min(confidence, 100),
      reasoning: reasons.join("; "),
      expectedValue,
      trigger: unavailable.length >= 4 ? "Multiple injuries" : "Squad restructure needed"
    };
  }

  private async evaluateBenchBoost(squad: any, currentGw: number): Promise<ChipRecommendation | null> {
    // Trigger: DGW (Double Gameweek) with strong bench
    // Check if next GW is DGW
    const bootstrap = await getBootstrapData();
    const nextGwData = bootstrap.events.find(e => e.id === currentGw);
    
    // Simple heuristic: check if any team has 2 matches this GW
    // (More reliable: check fixtures API, but for MVP we'll use xPts as proxy)

    const bench = squad.picks.filter((p: any) => p.position > 11);
    const benchPlayerIds = bench.map((p: any) => p.playerId);
    
    const projections = await this.predictionService.getProjections([currentGw], { playerIds: benchPlayerIds });
    const totalBenchXPts = projections.reduce((sum, p) => sum + p.totalXPts, 0);

    let confidence = 0;
    let reasons: string[] = [];

    // If bench projects >12pts, it's worth considering
    if (totalBenchXPts > 12) {
      confidence = Math.min((totalBenchXPts / 18) * 100, 90); // Scale to confidence
      reasons.push(`Bench projects ${totalBenchXPts.toFixed(1)} pts this GW`);
      
      // Check if it's actually DGW (multiple players with high xPts indicates DGW)
      const highXPts = projections.filter(p => p.totalXPts > 4).length;
      if (highXPts >= 2) {
        confidence += 10;
        reasons.push("Likely DGW for bench players");
      }

      return {
        chip: "bench_boost",
        confidence: Math.min(confidence, 100),
        reasoning: reasons.join("; "),
        expectedValue: totalBenchXPts,
        trigger: "Strong bench projection"
      };
    }

    return null;
  }

  private async evaluateTripleCaptain(squad: any, currentGw: number): Promise<ChipRecommendation | null> {
    // Trigger: Single player with very high xPts (>12) for one GW + favorable fixture

    const playerIds = squad.picks.filter((p: any) => p.position <= 11).map((p: any) => p.playerId);
    const projections = await this.predictionService.getProjections([currentGw], { playerIds });

    // Find best captain candidate
    const best = projections.sort((a, b) => b.totalXPts - a.totalXPts)[0];

    if (best && best.totalXPts > 10) {
      const confidence = Math.min((best.totalXPts / 15) * 100, 95);
      const playerName = squad.picks.find((p: any) => p.playerId === best.playerId)?.player.webName || "Top scorer";

      return {
        chip: "triple_captain",
        confidence,
        reasoning: `${playerName} projects ${best.totalXPts.toFixed(1)} pts this GW`,
        expectedValue: best.totalXPts * 2, // TC gives 3x instead of 2x, so +1x more
        trigger: "Favorable single GW matchup"
      };
    }

    return null;
  }

  private async evaluateFreeHit(squad: any, currentGw: number): Promise<ChipRecommendation | null> {
    // Trigger: BGW (Blank Gameweek) where many players don't play
    // Count how many players have fixtures

    const playerIds = squad.picks.filter((p: any) => p.position <= 11).map((p: any) => p.playerId);
    const projections = await this.predictionService.getProjections([currentGw], { playerIds });

    // If many players have 0 or very low xPts, it might be BGW
    const blankingPlayers = projections.filter(p => p.totalXPts < 1).length;

    if (blankingPlayers >= 6) { // >50% of starting XI not playing
      const confidence = Math.min((blankingPlayers / 11) * 100, 95);

      return {
        chip: "free_hit",
        confidence,
        reasoning: `${blankingPlayers} players likely not playing this GW (BGW)`,
        expectedValue: blankingPlayers * 5, // ~5pts per replacement
        trigger: "Blank Gameweek detected"
      };
    }

    return null;
  }
}
