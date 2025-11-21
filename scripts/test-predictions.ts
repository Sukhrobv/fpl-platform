import { PrismaClient } from "@prisma/client";
import { PredictionService, PlayerInput, TeamInput, LeagueAverages } from "../lib/services/predictionService";

const prisma = new PrismaClient();
const predictionService = new PredictionService();

async function main() {
  console.log("🧪 Testing Prediction Service...");

  // 1. Fetch some top players with their stats
  const players = await prisma.player.findMany({
    where: {
      webName: { in: ["Haaland", "Salah", "Saka", "Palmer", "Gabriel", "Raya"] } // Test mix of positions
    },
    include: {
      team: {
        include: {
          externalStats: true
        }
      },
      externalStats: {
        orderBy: { gameweek: 'desc' },
        take: 1
      }
    }
  });

  console.log(`Found ${players.length} players for testing.`);

  // 2. Mock League Averages (in production we'd calculate these)
  const leagueAvg: LeagueAverages = {
    avg_xG: 1.45,
    avg_xGA: 1.45,
    avg_deep: 6.5,
    avg_ppda: 11.5
  };

  // 3. Run Predictions
  for (const player of players) {
    const team = player.team;
    const extStats = player.externalStats[0];

    if (!extStats) {
      console.warn(`⚠️ No external stats for ${player.webName}`);
      continue;
    }

    // Mock Opponent (Let's assume they play against a mid-table team like Fulham or Brentford)
    // In reality we'd fetch the actual next fixture
    const mockOpponent: TeamInput = {
      id: 999,
      name: "Mock Opponent (Mid-Table)",
      isHome: false, // Player is at Home
      xG90_season: 1.3,
      xGA90_season: 1.4,
      deep_season: 5.0,
      ppda_season: 12.0,
      shotsAllowed90: 14.5 // Phase B3: Slightly high shots allowed (open game)
    };

    // Calculate per 90 stats
    const minutes = extStats.minutes || 1; // Avoid division by zero
    const xG90 = (extStats.xG || 0) / minutes * 90;
    const xA90 = (extStats.xA || 0) / minutes * 90;
    const shots90 = (extStats.shots || 0) / minutes * 90;
    const kp90 = (extStats.keyPasses || 0) / minutes * 90;

    // Prepare Player Input
    const playerInput: PlayerInput = {
      id: player.id,
      name: player.webName,
      position: player.position,
      price: player.nowCost,
      xG90_season: xG90,
      xA90_season: xA90,
      shots90_season: shots90,
      keyPasses90_season: kp90,
      minutes_recent: 450, // Assume nailed for test
      season_minutes: extStats.minutes || 0, // Phase B requirement
      start_probability: 1.0
    };

    // Prepare Team Input
    // We need team stats. Let's grab the latest from externalStats array
    const teamStats = team.externalStats.length > 0 ? team.externalStats[team.externalStats.length - 1] : null;
    
    const teamInput: TeamInput = {
      id: team.id,
      name: team.name,
      isHome: true,
      xG90_season: teamStats?.xG || 1.8,
      xGA90_season: teamStats?.xGA || 1.2,
      deep_season: teamStats?.deep || 8,
      ppda_season: teamStats?.ppda || 10,
      savesFactor: 1.0 // Phase B4: Standard GK ability
    };

    const prediction = predictionService.calculateXPts(playerInput, teamInput, mockOpponent, leagueAvg);

    console.log(`\n🔮 Prediction for ${player.webName} (${player.position}) vs ${mockOpponent.name}:`);
    console.log(`   xPts: ${prediction.xPts}`);
    console.log(`   Breakdown: App=${prediction.breakdown.appearance}, Att=${prediction.breakdown.attack}, Def=${prediction.breakdown.defense}, Bonus=${prediction.breakdown.bonus}`);
    console.log(`   Raw: xG=${prediction.raw.xG}, xA=${prediction.raw.xA}, CS=${prediction.raw.csProb}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
