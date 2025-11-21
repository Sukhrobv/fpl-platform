
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Inspecting Saka in DB...");
  
  const sakas = await prisma.player.findMany({
    where: { webName: 'Saka' },
    include: {
      externalStats: true
    }
  });

  console.log(`Found ${sakas.length} Sakas.`);
  sakas.forEach(saka => {
    console.log(`Player: ${saka.webName} (ID: ${saka.id})`);
    console.log("External Stats:", JSON.stringify(saka.externalStats, null, 2));
  });
  
  const gyokeres = await prisma.player.findMany({
    where: { 
      OR: [
        { webName: { contains: 'Gy' } },
        { firstName: { contains: 'Viktor' } },
        { secondName: { contains: 'Gy' } }
      ]
    },
    include: { externalStats: true }
  });
  
  console.log(`\nFound ${gyokeres.length} Gyokeres-like players.`);
  gyokeres.forEach(p => {
      console.log(`Player: ${p.webName} (ID: ${p.id})`);
      console.log("External Stats:", JSON.stringify(p.externalStats, null, 2));
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
