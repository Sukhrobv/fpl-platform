import { prisma } from "@/lib/db";
import { HistoricalWalkForwardService } from "@/lib/services/historicalWalkForwardService";

function readArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=", 2)[1];
}

async function main() {
  const report = await new HistoricalWalkForwardService(prisma).evaluate({
    sourceSeasonCode: readArg("season") ?? "2025/26",
    firstGameweek: Number(readArg("from") ?? 6),
    minimumHistoryFixtures: Number(readArg("history") ?? 5),
  });
  console.log(JSON.stringify(report));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
