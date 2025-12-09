/**
 * B6: Prepare Attack ML Dataset
 * 
 * Generates CSV dataset for training attack prediction models (goals/assists).
 * Features: player stats, opponent strength, involvement metrics
 * Targets: y_goals, y_assists
 * 
 * Usage: npx tsx ml/data/prepare_attack_dataset.ts
 */

import { prisma } from "../../lib/db";
import { 
  buildTrendFeatures,
  buildTeamStrengthFeatures 
} from "../../lib/services/prediction/features";
import * as fs from "fs";
import * as path from "path";

interface AttackDataRow {
  // Player context
  player_id: number;
  position: string;
  price: number;
  // Per 90 stats
  xG90_season: number;
  xA90_season: number;
  shots90_season: number;
  keyPasses90_season: number;
  xG90_recent: number;
  xA90_recent: number;
  // Trend features
  slope_xG_5: number;
  slope_xA_5: number;
  rolling_avg_xG_5: number;
  rolling_avg_xA_5: number;
  // Team/Opponent context (placeholder - needs fixture data)
  is_home: number;
  team_xG_strength: number;
  // Minutes context
  minutes_recent: number;
  start_probability: number;
  // Targets
  y_goals: number;
  y_assists: number;
  y_xG: number;
  y_xA: number;
}

function safePer90(stat: number, minutes: number): number {
  if (minutes < 90) return stat > 0 ? stat : 0;
  return (stat / minutes) * 90;
}

async function prepareAttackDataset() {
  console.log("📊 Preparing Attack ML Dataset...\n");

  const OUTPUT_PATH = path.join(__dirname, "attack_dataset.csv");
  const rows: AttackDataRow[] = [];

  // Fetch all players with their match history
  const players = await prisma.player.findMany({
    include: {
      externalStats: {
        orderBy: { gameweek: "desc" },
        take: 38,
      },
    },
  });

  console.log(`Found ${players.length} players`);

  for (const player of players) {
    const matchStats = player.externalStats.filter(s => s.gameweek > 0);
    if (matchStats.length < 5) continue;

    // Get season aggregates
    const seasonRow = player.externalStats.find(s => s.gameweek === 0);
    const seasonMins = seasonRow?.minutes || 0;
    const seasonStats = {
      xG: seasonRow?.xG || 0,
      xA: seasonRow?.xA || 0,
      shots: seasonRow?.shots || 0,
      keyPasses: seasonRow?.keyPasses || 0,
    };

    // Process each match as a training sample
    for (let i = 0; i < matchStats.length - 5; i++) {
      const targetMatch = matchStats[i];
      const historyMatches = matchStats.slice(i + 1, i + 11);

      if (historyMatches.length < 5) continue;
      if ((targetMatch.minutes || 0) < 10) continue; // Skip if barely played

      // Convert to BasicMatchStat format
      const historyBasic = historyMatches.map(s => ({
        minutes: s.minutes,
        xG: s.xG,
        xA: s.xA,
        shots: s.shots,
        keyPasses: s.keyPasses,
        kickoff: null,
        isEurope: false,
      }));

      // Build trend features
      const trendFeatures = buildTrendFeatures(historyBasic);

      // Calculate recent per90 stats
      const recentMins = historyBasic.slice(0, 5).reduce((sum, m) => sum + (m.minutes || 0), 0);
      const recentXg = historyBasic.slice(0, 5).reduce((sum, m) => sum + (m.xG || 0), 0);
      const recentXa = historyBasic.slice(0, 5).reduce((sum, m) => sum + (m.xA || 0), 0);

      // Start probability estimate from recent minutes
      const recentAvgMins = recentMins / 5;
      const startProb = Math.min(1, recentAvgMins / 70);

      rows.push({
        player_id: player.id,
        position: player.position,
        price: player.nowCost,
        xG90_season: safePer90(seasonStats.xG, seasonMins),
        xA90_season: safePer90(seasonStats.xA, seasonMins),
        shots90_season: safePer90(seasonStats.shots, seasonMins),
        keyPasses90_season: safePer90(seasonStats.keyPasses, seasonMins),
        xG90_recent: safePer90(recentXg, recentMins),
        xA90_recent: safePer90(recentXa, recentMins),
        slope_xG_5: trendFeatures.slope_xG[5] || 0,
        slope_xA_5: trendFeatures.slope_xA[5] || 0,
        rolling_avg_xG_5: trendFeatures.rolling_avg_xG[5] || 0,
        rolling_avg_xA_5: trendFeatures.rolling_avg_xA[5] || 0,
        is_home: 0.5, // Placeholder - needs fixture data
        team_xG_strength: 1.0, // Placeholder
        minutes_recent: recentMins,
        start_probability: startProb,
        y_goals: targetMatch.goals || 0,
        y_assists: targetMatch.assists || 0,
        y_xG: targetMatch.xG || 0,
        y_xA: targetMatch.xA || 0,
      });
    }
  }

  console.log(`Generated ${rows.length} training samples\n`);

  // Write CSV
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]).join(",");
    const csvRows = rows.map(row => Object.values(row).join(","));
    const csv = [headers, ...csvRows].join("\n");

    fs.writeFileSync(OUTPUT_PATH, csv);
    console.log(`✅ Saved to ${OUTPUT_PATH}`);
  } else {
    console.log("⚠️ No data to export");
  }

  await prisma.$disconnect();
}

prepareAttackDataset().catch(console.error);
