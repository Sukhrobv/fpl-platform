import { prisma } from "@/lib/db";
import { calculateOfficialDefconActions } from "@/lib/services/prediction/points";

async function main() {
  const playedRows = await prisma.fPLPlayerStats.findMany({
    where: { minutes: { gt: 0 } },
    select: {
      cbi: true,
      tackles: true,
      recoveries: true,
      defensiveContribution: true,
      player: { select: { id: true, position: true } },
    },
  });

  let complete = 0;
  let mismatches = 0;
  let goalkeeperViolations = 0;
  const playersMissing = new Set<number>();

  for (const row of playedRows) {
    if (row.cbi == null || row.tackles == null || row.recoveries == null) {
      playersMissing.add(row.player.id);
      continue;
    }
    complete += 1;
    const calculated = calculateOfficialDefconActions({
      position: row.player.position,
      cbi: row.cbi,
      tackles: row.tackles,
      recoveries: row.recoveries,
    });
    if (
      row.defensiveContribution != null &&
      row.defensiveContribution !== calculated
    ) {
      mismatches += 1;
    }
    if (
      row.player.position === "GOALKEEPER" &&
      row.defensiveContribution != null &&
      row.defensiveContribution !== 0
    ) {
      goalkeeperViolations += 1;
    }
  }

  const result = {
    playedRows: playedRows.length,
    completeRows: complete,
    missingRows: playedRows.length - complete,
    playersNeedingBackfill: playersMissing.size,
    reconciliationMismatches: mismatches,
    goalkeeperViolations,
    coverage: playedRows.length ? Number((complete / playedRows.length).toFixed(4)) : 0,
  };
  console.log(JSON.stringify(result));
  if (result.missingRows > 0 || mismatches > 0 || goalkeeperViolations > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
