
import { PrismaClient, Position } from "@prisma/client";
import { PredictionService, PlayerInput, TeamInput, LeagueAverages } from "../lib/services/predictionService";

const prisma = new PrismaClient();
const predictionService = new PredictionService();

// Helper to map dates to GWs (approximate for 2024/25)
function getGameweekFromDate(date: Date): number {
  // Simplified mapping, can be improved with actual fixture dates
  const d = new Date(date);
  if (d < new Date('2024-08-20')) return 1;
  if (d < new Date('2024-08-27')) return 2;
  if (d < new Date('2024-09-03')) return 3;
  // ... add more if needed, but for now we rely on upcoming fixtures
  return 0;
}

async function main() {
  console.log("🧪 Validating Predictions for GW 12...");

  // 1. Fetch upcoming fixtures for GW 12
  const fixtures = await prisma.match.findMany({
    where: { gameweek: 12 },
    include: {
      homeTeam: { include: { externalStats: true } },
      awayTeam: { include: { externalStats: true } }
    }
  });

  if (fixtures.length === 0) {
    console.error("❌ No fixtures found for GW 12. Check database.");
    return;
  }

  console.log(`📅 Found ${fixtures.length} fixtures for GW 12.`);

  // 2. Fetch Players
  const players = await prisma.player.findMany({
    where: { 
      chanceOfPlaying: { gt: 0 }, // Only available players
    },
    include: {
      team: {
        include: {
          externalStats: true
        }
      },
      externalStats: true
    }
  });

  console.log(`👥 Analyzing ${players.length} players...`);

  // 3. League Averages (Mock or Calc)
  const leagueAvg: LeagueAverages = {
    avg_xG: 1.45,
    avg_xGA: 1.45,
    avg_deep: 6.5,
    avg_ppda: 11.5
  };

  const predictions: any[] = [];

  for (const player of players) {
    // Find player's fixture in GW 12
    const fixture = fixtures.find(f => f.homeTeamId === player.teamId || f.awayTeamId === player.teamId);
    if (!fixture) continue;

    const isHome = fixture.homeTeamId === player.teamId;
    const opponentTeam = isHome ? fixture.awayTeam : fixture.homeTeam;

    // Prepare Inputs (using Season Totals from GW 0)
    const pStats = player.externalStats.find(s => s.gameweek === 0) || player.externalStats[0];
    if (!pStats) continue;

    if (player.webName === 'Saka' || player.webName === 'Havertz') {
        console.log(`\n🔍 Debug ${player.webName}:`);
        console.log(`   pStats: ${JSON.stringify(pStats)}`);
        console.log(`   Calc xA90: ${(pStats.xA || 0)} / ${(pStats.minutes || 1)} * 90 = ${(pStats.xA || 0) / (pStats.minutes || 1) * 90}`);
    }
    const teamStats = player.team.externalStats.find(s => s.gameweek === 0) || player.team.externalStats[0];
    const oppStats = opponentTeam.externalStats.find(s => s.gameweek === 0) || opponentTeam.externalStats[0];

    // Normalize to per-match
    const G = 11; // Approx games played
    const minutes_recent_proxy = (pStats.minutes || 0) / G * 5;
    
    // Estimate start probability based on minutes
    // If avg minutes per game < 45, likely a sub or rotation risk
    const avg_mins = (pStats.minutes || 0) / G;
    const estimated_start_prob = Math.min(0.95, Math.max(0.05, avg_mins / 70));

    const playerInput: PlayerInput = {
      id: player.id,
      name: player.webName,
      position: player.position,
      price: player.nowCost,
      xG90_season: (pStats.xG || 0) / (pStats.minutes || 1) * 90,
      xA90_season: (pStats.xA || 0) / (pStats.minutes || 1) * 90,
      shots90_season: (pStats.shots || 0) / (pStats.minutes || 1) * 90,
      keyPasses90_season: (pStats.keyPasses || 0) / (pStats.minutes || 1) * 90,
      minutes_recent: minutes_recent_proxy,
      season_minutes: pStats.minutes || 0,
      start_probability: estimated_start_prob
    };

    const teamInput: TeamInput = {
      id: player.teamId,
      name: player.team.name,
      isHome: isHome,
      xG90_season: (teamStats?.xG || 15) / G,
      xGA90_season: (teamStats?.xGA || 15) / G,
      deep_season: (teamStats?.deep || 70) / G,
      ppda_season: teamStats?.ppda || 12
    };

    const oppInput: TeamInput = {
      id: opponentTeam.id,
      name: opponentTeam.name,
      isHome: !isHome,
      xG90_season: (oppStats?.xG || 15) / G,
      xGA90_season: (oppStats?.xGA || 15) / G,
      deep_season: (oppStats?.deep || 70) / G,
      ppda_season: oppStats?.ppda || 12,
      shotsAllowed90: 12.0 // Fallback
    };

    const pred = predictionService.calculateXPts(playerInput, teamInput, oppInput, leagueAvg);
    predictions.push({ ...pred, position: player.position, price: player.nowCost });
  }

  // 4. Analysis
  console.log("\n📊 Analysis Results:");

  // Average xPts by Position
  const byPos: Record<string, number[]> = {};
  predictions.forEach(p => {
    if (!byPos[p.position]) byPos[p.position] = [];
    byPos[p.position].push(p.xPts);
  });

  console.log("\nAverage xPts by Position:");
  for (const pos in byPos) {
    const avg = byPos[pos].reduce((a, b) => a + b, 0) / byPos[pos].length;
    console.log(`   ${pos}: ${avg.toFixed(2)}`);
  }

  // Top 10 Players
  console.log("\n🏆 Top 10 Predicted Players for GW 12:");
  predictions.sort((a, b) => b.xPts - a.xPts);
  predictions.slice(0, 10).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.playerName} (${p.position}): ${p.xPts} xPts`);
    if (i < 5) {
      console.log(`      Raw Stats: xG90=${p.raw.xG.toFixed(2)}, xA90=${p.raw.xA.toFixed(2)}`);
      console.log(`      Breakdown: Att=${p.breakdown.attack}, App=${p.breakdown.appearance}, Bonus=${p.breakdown.bonus}`);
    }
  });

  // Price Correlation
  // Simple check: do expensive players score more?
  const expensive = predictions.filter(p => p.price > 100); // >10.0m
  const cheap = predictions.filter(p => p.price < 50); // <5.0m
  
  const avgExp = expensive.reduce((a, b) => a + b.xPts, 0) / expensive.length;
  const avgCheap = cheap.reduce((a, b) => a + b.xPts, 0) / cheap.length;

  console.log("\n💰 Price Validation:");
  console.log(`   Avg xPts (Price > 10.0m): ${avgExp.toFixed(2)}`);
  console.log(`   Avg xPts (Price < 5.0m): ${avgCheap.toFixed(2)}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
