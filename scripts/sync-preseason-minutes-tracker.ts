import { PrismaClient } from "@prisma/client";
import { PreseasonMinutesTrackerService } from "../lib/services/preseasonMinutesTrackerService";
import { SeasonPredictionPublicationService } from "../lib/services/seasonPredictionPublicationService";
import { RollingPredictionService } from "../lib/services/rollingPredictionService";

function readSeasonCode(): string {
  const season = process.argv
    .find((argument) => argument.startsWith("--season="))
    ?.split("=", 2)[1];
  if (!season || !/^20\d{2}\/\d{2}$/.test(season)) {
    throw new Error(
      "Usage: tsx scripts/sync-preseason-minutes-tracker.ts --season=2026/27",
    );
  }
  return season;
}

const prisma = new PrismaClient();

async function main() {
  const targetSeasonCode = readSeasonCode();
  const sync = await new PreseasonMinutesTrackerService(prisma).sync({
    targetSeasonCode,
  });
  const season = await prisma.season.findUnique({
    where: { code: targetSeasonCode },
    select: { status: true, isCurrent: true },
  });
  if (!season) throw new Error(`Season ${targetSeasonCode} not found`);

  const forecast =
    season.status === "UPCOMING" && !season.isCurrent
      ? await new SeasonPredictionPublicationService(prisma).buildGw1Preview({
          targetSeasonCode,
        })
      : await new RollingPredictionService(prisma).build({ targetSeasonCode });
  console.log(JSON.stringify({ sync, forecast }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
