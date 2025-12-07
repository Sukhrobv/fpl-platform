
import { prisma } from "../lib/db";

async function main() {
  const players = await prisma.player.findMany({
    where: {
      OR: [
        { webName: "Sánchez" },
        { webName: "Bruno G." }
      ]
    }
  });

  console.log("FPL Players:");
  for (const p of players) {
    console.log(`ID: ${p.id}, WebName: "${p.webName}", First: "${p.firstName}", Second: "${p.secondName}"`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
