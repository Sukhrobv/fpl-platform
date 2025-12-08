import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getTeamCodes() {
  const teams = await prisma.team.findMany({
    orderBy: { shortName: 'asc' }
  });
  
  console.log('Team Codes for TEAM_CODES mapping:');
  console.log('const TEAM_CODES: Record<string, number> = {');
  
  const codes = teams.map(t => `  ${t.shortName}: ${t.fplId}`).join(', ');
  console.log(codes);
  
  console.log('};');
  
  console.log('\n\nMissing from current mapping:');
  const current = ['ARS', 'AVL', 'BOU', 'BRE', 'BHA', 'CHE', 'CRY', 'EVE', 'FUL', 'IPS', 'LEI', 'LIV', 'MCI', 'MUN', 'NEW', 'NFO', 'SOU', 'TOT', 'WHU', 'WOL'];
  const allShortNames = teams.map(t => t.shortName);
  const missing = allShortNames.filter(name => !current.includes(name));
  
  missing.forEach(shortName => {
    const team = teams.find(t => t.shortName === shortName);
    if (team) {
      console.log(`${team.shortName}: ${team.fplId} // ${team.name}`);
    }
  });
  
  await prisma.$disconnect();
}

getTeamCodes();
