import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  const mappings = await prisma.playerMapping.count({ where: { source: 'understat' } });
  const stats = await prisma.externalPlayerStats.count({ where: { source: 'understat' } });
  const teamStats = await prisma.externalTeamStats.count({ where: { source: 'understat' } });
  
  console.log(`Mappings: ${mappings}`);
  console.log(`Player Stats: ${stats}`);
  console.log(`Team Stats: ${teamStats}`);

  if (stats > 0) {
    const sample = await prisma.externalPlayerStats.findFirst({
      where: { source: 'understat', xG: { gt: 0 } },
      include: { player: true }
    });
    console.log('Sample Player Stat:', {
      player: sample?.player.webName,
      xG: sample?.xG,
      xA: sample?.xA
    });
  }

  if (teamStats > 0) {
    const sampleTeam = await prisma.externalTeamStats.findFirst({
        where: { source: 'understat' },
        include: { team: true }
    });
    console.log('Sample Team Stat:', {
        team: sampleTeam?.team.name,
        matchDate: sampleTeam?.matchDate,
        xGA: sampleTeam?.xGA,
        ppda: sampleTeam?.ppda
    });
  }
  
  await prisma.$disconnect();
}

checkData();
