
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Checking available data...");

  // Check FPL Stats (Actual Points)
  const fplStats = await prisma.fPLPlayerStats.groupBy({
    by: ['gameweek'],
    _count: { id: true }
  });
  console.log("\n📊 FPL Player Stats (Actual Points):");
  fplStats.sort((a, b) => a.gameweek - b.gameweek).forEach(g => {
    console.log(`   GW ${g.gameweek}: ${g._count.id} records`);
  });

  // Check External Stats (Input Data)
  const extStats = await prisma.externalPlayerStats.groupBy({
    by: ['gameweek'],
    _count: { id: true }
  });
  console.log("\n📈 External Player Stats (Understat Data):");
  extStats.sort((a, b) => a.gameweek - b.gameweek).forEach(g => {
    console.log(`   GW ${g.gameweek}: ${g._count.id} records`);
  });

  // Check Matches
  const matches = await prisma.match.groupBy({
    by: ['gameweek', 'finished'],
    _count: { id: true }
  });
  console.log("\n⚽ Matches:");
  matches.sort((a, b) => a.gameweek - b.gameweek).forEach(g => {
    console.log(`   GW ${g.gameweek} (${g.finished ? 'Finished' : 'Upcoming'}): ${g._count.id} matches`);
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
