import { prisma } from "@/lib/db";
import { PulseLivePlayerSupplementService } from "@/lib/services/pulseLivePlayerSupplementService";

function arg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(`--${name}=`))
    ?.split("=", 2)[1];
}

async function main() {
  const season = arg("season");
  const gameweek = Number(arg("gameweek"));
  if (!season || !Number.isInteger(gameweek)) {
    throw new Error(
      "Usage: tsx scripts/complete-pulselive-player-totals.ts --season=2025/26 --gameweek=38",
    );
  }
  const result = await new PulseLivePlayerSupplementService({ prisma }).collect(
    season,
    gameweek,
  );
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
