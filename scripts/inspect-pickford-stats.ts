
import { prisma } from "../lib/db";

async function main() {
  console.log("Inspecting Pickford stats...");

  const pickford = await prisma.player.findFirst({
    where: { webName: "Pickford" }
  });

  if (!pickford) {
    console.log("Pickford not found");
    return;
  }

  const stats = await prisma.fPLPlayerStats.findMany({
    where: { playerId: pickford.id },
    orderBy: { gameweek: 'asc' }
  });

  console.log(`Found ${stats.length} stats entries for Pickford:`);
  stats.forEach(s => {
    console.log(`GW${s.gameweek}: ${s.totalPoints} pts`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
