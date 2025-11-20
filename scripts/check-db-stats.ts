
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';

async function main() {
  try {
    const teamCount = await prisma.team.count();
    const playerCount = await prisma.player.count();
    const matchCount = await prisma.match.count();
    const fplStatsCount = await prisma.fPLPlayerStats.count();

    logger.info('📊 Database Statistics:');
    logger.info(`Teams: ${teamCount}`);
    logger.info(`Players: ${playerCount}`);
    logger.info(`Matches: ${matchCount}`);
    logger.info(`FPL Player Stats: ${fplStatsCount}`);

    if (playerCount === 0) {
      logger.warn('⚠️ No players found in the database. Data loading might be incomplete.');
    } else {
      logger.info('✅ Data seems to be populated.');
    }

  } catch (error) {
    logger.error('❌ Error checking database stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
