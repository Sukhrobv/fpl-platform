/**
 * Resumable per-fixture DEFCON backfill from the official FPL API.
 *
 * Run the regular FPL sync first so players, fixtures and base match rows exist.
 * Usage: npx tsx lib/scripts/syncFplDefensiveStats.ts
 */

import { Prisma, type Position } from "@prisma/client";
import { FPLCollector } from "@/lib/collectors/fplCollector";
import { prisma } from "@/lib/db";
import { calculateOfficialDefconActions } from "@/lib/services/prediction/points";
import type { FPLPlayerHistoryEntry } from "@/types";

const REQUESTS_PER_MINUTE = 45;
const CONCURRENCY = 4;
const BATCH_SIZE = 12;

interface BackfillPlayer {
  id: number;
  fplId: number;
  webName: string;
  position: Position;
}

export interface DefconBackfillSummary {
  playersEligible: number;
  playersProcessed: number;
  playersFailed: number;
  fixturesUpdated: number;
  fixturesMissingBaseRow: number;
  rowsMissingOfficialFields: number;
  reconciliationMismatches: number;
}

interface PlayerResult {
  rows: DefconUpdateRow[];
  missingBaseRows: number;
  missingOfficialFields: number;
  mismatches: number;
  failed: boolean;
}

interface DefconUpdateRow {
  playerId: number;
  matchId: number;
  cbi: number;
  tackles: number;
  recoveries: number;
  defensiveContribution: number | null;
}

function hasOfficialDefensiveFields(item: FPLPlayerHistoryEntry): boolean {
  return (
    item.clearances_blocks_interceptions != null &&
    item.tackles != null &&
    item.recoveries != null
  );
}

/**
 * A player is eligible only when the regular FPL sync already has a played
 * fixture row and at least one official defensive field is still missing.
 * Re-running the command therefore resumes instead of starting from scratch.
 */
async function getPlayersNeedingBackfill(): Promise<BackfillPlayer[]> {
  const rows = await prisma.fPLPlayerStats.findMany({
    where: {
      minutes: { gt: 0 },
      OR: [{ cbi: null }, { tackles: null }, { recoveries: null }],
    },
    select: {
      player: {
        select: {
          id: true,
          fplId: true,
          webName: true,
          position: true,
        },
      },
    },
  });
  return Array.from(
    new Map(rows.map((row) => [row.player.id, row.player])).values(),
  );
}

async function syncPlayer(
  collector: FPLCollector,
  player: BackfillPlayer,
  matchIdByFplId: Map<number, number>,
): Promise<PlayerResult> {
  const result: PlayerResult = {
    rows: [],
    missingBaseRows: 0,
    missingOfficialFields: 0,
    mismatches: 0,
    failed: false,
  };

  try {
    const summary = await collector.getPlayerSummary(player.fplId);
    for (const item of summary.history) {
      if (item.minutes <= 0) continue;
      if (!hasOfficialDefensiveFields(item)) {
        result.missingOfficialFields += 1;
        continue;
      }

      const matchId = matchIdByFplId.get(item.fixture);
      if (!matchId) {
        result.missingBaseRows += 1;
        continue;
      }

      const calculatedActions = calculateOfficialDefconActions({
        position: player.position,
        cbi: item.clearances_blocks_interceptions!,
        tackles: item.tackles!,
        recoveries: item.recoveries!,
      });
      const officialActions = Number(item.defensive_contribution);
      if (
        Number.isFinite(officialActions) &&
        calculatedActions !== officialActions
      ) {
        result.mismatches += 1;
        console.warn(
          `DEFCON mismatch: ${player.webName}, fixture ${item.fixture}, calculated ${calculatedActions}, official ${officialActions}`,
        );
      }

      result.rows.push({
        playerId: player.id,
        matchId,
        cbi: item.clearances_blocks_interceptions!,
        tackles: item.tackles!,
        recoveries: item.recoveries!,
        defensiveContribution: Number.isFinite(officialActions)
          ? officialActions
          : null,
      });
    }
  } catch (error) {
    result.failed = true;
    console.error(
      `DEFCON backfill failed for ${player.webName} (${player.fplId})`,
      error,
    );
  }

  return result;
}

async function persistDefconRows(rows: DefconUpdateRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map(
    (row) => Prisma.sql`(
      CAST(${row.playerId} AS INTEGER), CAST(${row.matchId} AS INTEGER),
      CAST(${row.cbi} AS INTEGER), CAST(${row.tackles} AS INTEGER),
      CAST(${row.recoveries} AS INTEGER), CAST(${row.defensiveContribution} AS INTEGER)
    )`,
  );
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "fpl_player_stats" AS target
    SET "cbi" = source."cbi",
        "tackles" = source."tackles",
        "recoveries" = source."recoveries",
        "defensiveContribution" = source."defensiveContribution",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM (VALUES ${Prisma.join(values)}) AS source(
      "playerId", "matchId", "cbi", "tackles", "recoveries", "defensiveContribution"
    )
    WHERE target."playerId" = source."playerId"
      AND target."matchId" = source."matchId"
  `);
}

export async function syncAllFplDefensiveStats(): Promise<DefconBackfillSummary> {
  const startedAt = new Date();
  const collector = new FPLCollector({
    requestsPerMinute: REQUESTS_PER_MINUTE,
    concurrency: CONCURRENCY,
    maxRetries: 3,
    retryBaseDelayMs: 750,
    retryJitterMs: 250,
  });
  const [players, matches] = await Promise.all([
    getPlayersNeedingBackfill(),
    prisma.match.findMany({ select: { id: true, fplId: true } }),
  ]);
  const matchIdByFplId = new Map(
    matches.map((match) => [match.fplId, match.id]),
  );
  const summary: DefconBackfillSummary = {
    playersEligible: players.length,
    playersProcessed: 0,
    playersFailed: 0,
    fixturesUpdated: 0,
    fixturesMissingBaseRow: 0,
    rowsMissingOfficialFields: 0,
    reconciliationMismatches: 0,
  };

  console.log(`DEFCON backfill: ${players.length} players require data.`);
  for (let offset = 0; offset < players.length; offset += BATCH_SIZE) {
    const batch = players.slice(offset, offset + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((player) => syncPlayer(collector, player, matchIdByFplId)),
    );
    const rows = results.flatMap((result) => result.rows);
    const updated = await persistDefconRows(rows);
    summary.fixturesUpdated += updated;
    summary.fixturesMissingBaseRow += rows.length - updated;
    for (const result of results) {
      summary.playersProcessed += 1;
      summary.playersFailed += Number(result.failed);
      summary.fixturesMissingBaseRow += result.missingBaseRows;
      summary.rowsMissingOfficialFields += result.missingOfficialFields;
      summary.reconciliationMismatches += result.mismatches;
    }
    console.log(
      `Progress ${summary.playersProcessed}/${summary.playersEligible}; fixtures updated ${summary.fixturesUpdated}`,
    );
  }

  const completedAt = new Date();
  await prisma.syncLog.create({
    data: {
      source: "fpl",
      syncType: "defcon-backfill",
      success:
        summary.playersFailed === 0 && summary.fixturesMissingBaseRow === 0,
      recordsUpdated: summary.fixturesUpdated,
      recordsFailed:
        summary.playersFailed +
        summary.fixturesMissingBaseRow +
        summary.rowsMissingOfficialFields +
        summary.reconciliationMismatches,
      startedAt,
      completedAt,
      duration: Math.max(
        1,
        Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
      ),
      errorMessage:
        summary.playersFailed > 0 || summary.fixturesMissingBaseRow > 0
          ? JSON.stringify(summary)
          : null,
    },
  });

  console.log(`DEFCON backfill complete: ${JSON.stringify(summary)}`);
  return summary;
}

syncAllFplDefensiveStats()
  .then((summary) => {
    if (summary.playersFailed > 0 || summary.fixturesMissingBaseRow > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
