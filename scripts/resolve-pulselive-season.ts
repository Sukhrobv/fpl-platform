import { prisma } from "@/lib/db";
import { PulseLiveSnapshotService } from "@/lib/services/pulseLiveSnapshotService";

function readSeason(): string {
  const season = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--season="))
    ?.split("=", 2)[1];
  if (!season) {
    throw new Error(
      "Usage: tsx scripts/resolve-pulselive-season.ts --season=2026/27",
    );
  }
  return season;
}

async function main() {
  const binding = await new PulseLiveSnapshotService({
    prisma,
  }).resolveAndStoreSeason(readSeason());
  console.log(JSON.stringify(binding));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
