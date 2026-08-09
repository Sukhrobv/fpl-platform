import { PrismaClient } from "@prisma/client";
import { RollingPredictionService } from "../lib/services/rollingPredictionService";

function readSeasonCode(): string {
  const season = process.argv
    .find((argument) => argument.startsWith("--season="))
    ?.split("=", 2)[1];
  if (!season || !/^20\d{2}\/\d{2}$/.test(season)) {
    throw new Error(
      "Usage: tsx scripts/build-rolling-prediction-preview.ts --season=2026/27",
    );
  }
  return season;
}

const prisma = new PrismaClient();

async function main() {
  const result = await new RollingPredictionService(prisma).build({
    targetSeasonCode: readSeasonCode(),
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
