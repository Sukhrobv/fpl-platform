
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning External Player Stats (GW 0)...");
  
  const { count } = await prisma.externalPlayerStats.deleteMany({
    where: { gameweek: 0, source: 'understat' }
  });
  
  console.log(`✅ Deleted ${count} records.`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
