import { PrismaClient } from "@prisma/client";
import { FplHistoricalH2hService } from "@/lib/services/fplHistoricalH2hService";

async function main() {
  const season = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--season="))
    ?.split("=", 2)[1];
  if (!season || !/^\d{4}\/\d{2}$/.test(season)) {
    throw new Error(
      "Usage: tsx scripts/sync-fpl-historical-h2h.ts --season=2025/26",
    );
  }
  const prisma = new PrismaClient();
  try {
    console.log(
      JSON.stringify(
        await new FplHistoricalH2hService(prisma).sync({
          sourceSeasonCode: season,
        }),
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main();
