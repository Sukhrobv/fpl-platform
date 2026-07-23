import { prisma } from "@/lib/db";
import {
  DEFAULT_PRIOR_VERSION,
  PlayerSeasonPriorService,
} from "@/lib/services/playerSeasonPriorService";

function readArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=", 2)[1];
}

async function main() {
  const sourceSeasonCode = readArg("source");
  const targetSeasonCode = readArg("target");
  const version = readArg("version") ?? DEFAULT_PRIOR_VERSION;
  if (!sourceSeasonCode || !targetSeasonCode) {
    throw new Error(
      "Usage: tsx scripts/build-season-priors.ts --source=2025/26 --target=2026/27 [--version=gw1-prior-v5]",
    );
  }
  const result = await new PlayerSeasonPriorService(prisma).build({
    sourceSeasonCode,
    targetSeasonCode,
    version,
  });
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
