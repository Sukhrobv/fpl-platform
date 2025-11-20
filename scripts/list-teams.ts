import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listTeams() {
  const teams = await prisma.team.findMany();
  console.log('FPL Teams in DB:');
  teams.forEach(t => console.log(`- "${t.name}" (Short: ${t.shortName})`));
  await prisma.$disconnect();
}

listTeams();
