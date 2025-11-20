import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSpecificTeams() {
  const targetTeams = ['Sunderland', 'Leeds', 'Burnley'];
  
  for (const name of targetTeams) {
    const team = await prisma.team.findFirst({ where: { name: name } });
    if (!team) {
        console.log(`❌ Team ${name} not found in DB`);
        continue;
    }
    
    const statsCount = await prisma.externalTeamStats.count({
        where: { teamId: team.id, source: 'understat' }
    });
    
    console.log(`Team: ${name} (ID: ${team.id}) - Stats Entries: ${statsCount}`);
  }
  
  await prisma.$disconnect();
}

checkSpecificTeams();
