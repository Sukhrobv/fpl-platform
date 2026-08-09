import { prisma } from "@/lib/db";
import { SeasonPredictionPublicationService } from "@/lib/services/seasonPredictionPublicationService";

function readArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=", 2)[1];
}

async function main() {
  const target = readArg("target") ?? "2026/27";
  const result = await new SeasonPredictionPublicationService(
    prisma,
  ).buildGw1Preview({
    targetSeasonCode: target,
  });
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
