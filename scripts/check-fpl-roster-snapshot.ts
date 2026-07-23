import { prisma } from "@/lib/db";

async function main() {
  const latest = await prisma.sourceSnapshot.findFirst({
    where: { source: "fpl", dataset: "bootstrap-static", valid: true },
    orderBy: { fetchedAt: "desc" },
    select: {
      batchId: true,
      season: true,
      gameweek: true,
      recordCount: true,
      checksum: true,
      fetchedAt: true,
    },
  });
  if (!latest) throw new Error("No valid FPL bootstrap snapshot found");
  const players = await prisma.player.findMany({
    where: { season: latest.season, active: true },
    select: { fplId: true, code: true },
  });
  const duplicateFplIds =
    players.length - new Set(players.map((player) => player.fplId)).size;
  const duplicateCodes =
    players.length - new Set(players.map((player) => player.code)).size;
  const result = {
    ...latest,
    activePlayers: players.length,
    duplicateFplIds,
    duplicateCodes,
    complete:
      players.length === latest.recordCount &&
      duplicateFplIds === 0 &&
      duplicateCodes === 0,
  };
  console.log(JSON.stringify(result));
  if (!result.complete) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
