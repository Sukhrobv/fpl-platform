import { prisma } from "@/lib/db";
import { PulseLiveMappingService } from "@/lib/services/pulseLiveMappingService";

function readSeason(): string {
  const season = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--season="))
    ?.split("=", 2)[1];
  if (!season)
    throw new Error(
      "Usage: tsx scripts/map-pulselive-players.ts --season=2025/26",
    );
  return season;
}

async function main() {
  const run = await new PulseLiveMappingService({ prisma }).mapLatestSeason(
    readSeason(),
  );
  console.log(
    JSON.stringify({
      batchId: run.batchId,
      season: run.season,
      gameweek: run.gameweek,
      sourcePlayers: run.sourcePlayers,
      fplRosterPlayers: run.fplRosterPlayers,
      fplPlayedPlayers: run.fplPlayedPlayers,
      mappingsWritten: run.mappingsWritten,
      unmatchedSource: run.unmatchedSource,
      unmatchedFplCount: run.unmatchedFpl.length,
      unmatchedPlayedFpl: run.unmatchedFpl.filter((player) => player.played),
      mappedSourceWithoutFplHistoryCount:
        run.mappedSourceWithoutFplHistory.length,
      mappedSourceWithoutFplHistory: run.mappedSourceWithoutFplHistory,
      conflicts: run.conflicts,
      sourceCoverage: run.sourceCoverage,
      fplPlayedMappingCoverage: run.fplPlayedMappingCoverage,
      rosterCoverage: run.rosterCoverage,
      eligibleForRollout: run.eligibleForRollout,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
