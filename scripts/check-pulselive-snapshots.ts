import { PULSELIVE_METRICS } from "@/lib/collectors/pulseLiveCollector";
import { prisma } from "@/lib/db";

async function main() {
  const latest = await prisma.sourceSnapshot.findFirst({
    where: { source: "pulselive", season: "2025/26", valid: true },
    orderBy: { fetchedAt: "desc" },
    select: { batchId: true, gameweek: true },
  });
  if (!latest) throw new Error("No valid PulseLive snapshot batch found");

  const rows = await prisma.sourceSnapshot.findMany({
    where: { source: "pulselive", season: "2025/26", batchId: latest.batchId },
    select: {
      dataset: true,
      valid: true,
      recordCount: true,
      checksum: true,
      gameweek: true,
    },
  });
  const byDataset = new Map(rows.map((row) => [row.dataset, row]));
  const missing = PULSELIVE_METRICS.map((metric) => `stat:${metric}`).filter(
    (dataset) => !byDataset.get(dataset)?.valid,
  );
  const result = {
    batchId: latest.batchId,
    gameweek: latest.gameweek,
    datasets: rows.length,
    validDatasets: rows.filter((row) => row.valid).length,
    totalRecords: rows.reduce((sum, row) => sum + row.recordCount, 0),
    missing,
  };
  console.log(JSON.stringify(result));
  if (missing.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
