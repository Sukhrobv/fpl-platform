import { prisma } from "@/lib/db";
import { Gw1ReadinessService } from "@/lib/services/gw1ReadinessService";

function readArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=", 2)[1];
}

async function main() {
  const target = readArg("target") ?? "2026/27";
  const version = readArg("version");
  const result = await new Gw1ReadinessService(prisma).build({
    targetSeasonCode: target,
    priorVersion: version,
  });
  console.log(JSON.stringify(result));
  if (!result.ready) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
