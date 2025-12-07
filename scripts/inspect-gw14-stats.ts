
import { prisma } from "../lib/db";

async function main() {
  console.log("Inspecting GW14 stats...");

  const stats = await prisma.fPLPlayerStats.findMany({
    where: {
      gameweek: 14,
      totalPoints: { gt: 0 }
    },
    take: 5,
    include: {
      player: true
    }
  });

  console.log(`Found ${stats.length} stats for GW14 with points > 0`);
  stats.forEach(s => {
    console.log(`${s.player.webName}: ${s.totalPoints} pts`);
  });

  // Check specifically for Pickford
  const pickford = await prisma.player.findFirst({
    where: { webName: "Pickford" }
  });

  if (pickford) {
    const pickfordStats = await prisma.fPLPlayerStats.findFirst({
      where: {
        playerId: pickford.id,
        gameweek: 14
      }
    });
    console.log(`Pickford GW14 stats:`, pickfordStats);
  } else {
    console.log("Pickford not found in DB");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
