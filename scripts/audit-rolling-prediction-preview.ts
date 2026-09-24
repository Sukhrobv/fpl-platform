import { prisma } from "@/lib/db";
import { RollingPredictionAuditService } from "@/lib/services/rollingPredictionAuditService";

function readArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=", 2)[1];
}

async function main() {
  const targetSeasonCode = readArg("season") ?? "2026/27";
  const gameweek = Number(readArg("gameweek"));
  const result = await new RollingPredictionAuditService(prisma).auditGameweek({
    targetSeasonCode,
    gameweek,
  });
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
