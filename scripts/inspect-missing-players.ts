
import { prisma } from "../lib/db";

async function main() {
  console.log("Inspecting Sanchez and Bruno G...");

  const players = await prisma.player.findMany({
    where: {
      OR: [
        { webName: "Sánchez" }, // Robert Sánchez
        { webName: "Bruno G." }  // Bruno Guimarães
      ]
    },
    include: {
      externalStats: { orderBy: { gameweek: "desc" } }
    }
  });

  for (const p of players) {
    console.log(`\nPlayer: ${p.webName} (ID: ${p.id})`);
    console.log(`Stats count (limited to 6): ${p.externalStats.length}`);
    const hasGw0 = p.externalStats.some(s => s.gameweek === 0);
    console.log(`Has GW0 in top 6? ${hasGw0}`);
    p.externalStats.forEach(s => console.log(`  - GW${s.gameweek}: xG=${s.xG}`));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
