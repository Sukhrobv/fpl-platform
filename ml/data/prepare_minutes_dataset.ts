/**
 * B6: Prepare Minutes ML Dataset
 * 
 * Generates CSV dataset for training minutes prediction models.
 * Features: schedule, injury, role, player stats
 * Targets: y_start (0/1), y_60 (0/1 if played 60+ minutes)
 * 
 * Usage: npx tsx ml/data/prepare_minutes_dataset.ts
 */

import { prisma } from "../../lib/db";
import { 
  buildScheduleFeatures, 
  buildInjuryFeatures, 
  buildRoleFeatures 
} from "../../lib/services/prediction/features";
import * as fs from "fs";
import * as path from "path";

interface MinutesDataRow {
  // Player context
  player_id: number;
  position: string;
  price: number;
  // Schedule features
  rest_days: number | null;
  has_europe_before: boolean;
  has_europe_after: boolean;
  // Injury features
  days_out: number | null;
  games_missed: number;
  game_index_since_return: number | null;
  // Role features
  perStart_xG: number;
  perSub_xG: number;
  perSub_ratio: number;
  // Historical averages
  season_avg_minutes: number;
  recent_avg_minutes: number;
  chance_of_playing: number | null;
  // Targets
  y_start: number; // 1 if started, 0 otherwise
  y_60: number;    // 1 if played 60+ minutes, 0 otherwise
  actual_minutes: number;
}

async function prepareMinutesDataset() {
  console.log("📊 Preparing Minutes ML Dataset...\n");

  const OUTPUT_PATH = path.join(__dirname, "minutes_dataset.csv");
  const rows: MinutesDataRow[] = [];

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
    if (matchStats.length < 5) continue; // Need history for features

    // Process each match as a training sample
    for (let i = 0; i < matchStats.length - 5; i++) {
      const targetMatch = matchStats[i];
      const historyMatches = matchStats.slice(i + 1, i + 11); // 10 previous games

      if (historyMatches.length < 5) continue;

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

      // Build features
      const scheduleFeatures = buildScheduleFeatures(historyBasic);
      const injuryFeatures = buildInjuryFeatures(historyBasic);
      const roleFeatures = buildRoleFeatures(historyBasic);

      // Calculate averages
      const seasonMins = player.externalStats.find(s => s.gameweek === 0)?.minutes || 0;
      const seasonGames = matchStats.length;
      const seasonAvg = seasonGames > 0 ? seasonMins / seasonGames : 0;

      const recentMins = historyBasic.slice(0, 5).reduce((sum, m) => sum + (m.minutes || 0), 0);
      const recentGames = historyBasic.slice(0, 5).filter(m => m.minutes && m.minutes > 0).length;
      const recentAvg = recentGames > 0 ? recentMins / recentGames : 0;

      // Calculate perSub ratio
      const perSubRatio = roleFeatures.perStart_xG > 0.01 
        ? roleFeatures.perSub_xG / roleFeatures.perStart_xG 
        : 0;

      // Target values
      const actualMins = targetMatch.minutes || 0;
      const yStart = actualMins >= 60 ? 1 : (actualMins > 0 ? 0.5 : 0); // Simplified: 60+ = start
      const y60 = actualMins >= 60 ? 1 : 0;

      rows.push({
        player_id: player.id,
        position: player.position,
        price: player.nowCost,
        rest_days: scheduleFeatures.rest_days,
        has_europe_before: scheduleFeatures.has_midweek_europe_before,
        has_europe_after: scheduleFeatures.has_midweek_europe_after,
        days_out: injuryFeatures.days_out,
        games_missed: injuryFeatures.games_missed,
        game_index_since_return: injuryFeatures.game_index_since_return,
        perStart_xG: roleFeatures.perStart_xG,
        perSub_xG: roleFeatures.perSub_xG,
        perSub_ratio: perSubRatio,
        season_avg_minutes: seasonAvg,
        recent_avg_minutes: recentAvg,
        chance_of_playing: player.chanceOfPlaying,
        y_start: yStart >= 0.5 ? 1 : 0,
        y_60: y60,
        actual_minutes: actualMins,
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

prepareMinutesDataset().catch(console.error);
