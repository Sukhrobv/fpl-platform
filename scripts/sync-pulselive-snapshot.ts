import { prisma } from "@/lib/db";
import { PulseLiveDeltaService } from "@/lib/services/pulseLiveDeltaService";
import { PulseLiveSnapshotService } from "@/lib/services/pulseLiveSnapshotService";

function readArgs(): { season: string; gameweek: number } {
  const args = process.argv.slice(2);
  const season = args
    .find((arg) => arg.startsWith("--season="))
    ?.split("=", 2)[1];
  const gameweekValue = args
    .find((arg) => arg.startsWith("--gameweek="))
    ?.split("=", 2)[1];
  if (!season || gameweekValue == null) {
    throw new Error(
      "Usage: tsx scripts/sync-pulselive-snapshot.ts --season=2025/26 --gameweek=38",
    );
  }
  const gameweek = Number(gameweekValue);
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error("--gameweek must be an integer from 1 to 38");
  }
  return { season, gameweek };
}

async function main() {
  const startedAt = new Date();
  const { season, gameweek } = readArgs();
  try {
    const service = new PulseLiveSnapshotService({ prisma });
    const run = await service.collectSeason(season, gameweek);
    const delta = await new PulseLiveDeltaService({ prisma }).deriveForBatch(
      run.batchId,
    );
    const completedAt = new Date();
    await prisma.syncLog.create({
      data: {
        seasonId: run.seasonId,
        source: "pulselive",
        syncType: "raw-snapshot",
        gameweek,
        success: true,
        recordsUpdated: run.snapshots.reduce(
          (sum, item) => sum + item.recordCount,
          0,
        ),
        recordsFailed: 0,
        startedAt,
        completedAt,
        duration: Math.max(
          1,
          Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
        ),
      },
    });
    console.log(JSON.stringify({ ...run, delta }));
  } catch (error) {
    const completedAt = new Date();
    const message =
      error instanceof Error ? error.message : "Unknown PulseLive error";
    await prisma.syncLog.create({
      data: {
        source: "pulselive",
        syncType: "raw-snapshot",
        success: false,
        recordsUpdated: 0,
        recordsFailed: 1,
        errorMessage: message,
        startedAt,
        completedAt,
        duration: Math.max(
          1,
          Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
        ),
      },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
