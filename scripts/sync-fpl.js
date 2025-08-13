// scripts/sync-fpl.js – Synchronize FPL teams and players into the database using CommonJS

const { prisma, connectDB, disconnectDB } = require('../lib/db');
const { getBootstrapData } = require('../lib/fplClient');
const { Prisma } = require('@prisma/client');

async function main() {
  // Connect to the database
  const connected = await connectDB();
  if (!connected) {
    throw new Error('Unable to connect to database');
  }
  // Fetch bootstrap data from FPL
  const { teams, elements } = await getBootstrapData();
  console.log(`Fetched ${teams.length} teams and ${elements.length} players from FPL API`);

  // Upsert teams
  for (const team of teams) {
    await prisma.team.upsert({
      where: { fplId: team.id },
      update: {
        name: team.name,
        shortName: team.short_name,
        lastSyncedAt: new Date(),
      },
      create: {
        fplId: team.id,
        name: team.name,
        shortName: team.short_name,
        lastSyncedAt: new Date(),
      },
    });
  }
  console.log(`Upserted ${teams.length} teams`);

  // Mapping from FPL element_type to Position enum
  const positionMap = {
    1: Prisma.Position.GOALKEEPER,
    2: Prisma.Position.DEFENDER,
    3: Prisma.Position.MIDFIELDER,
    4: Prisma.Position.FORWARD,
  };

  // Upsert players
  for (const el of elements) {
    await prisma.player.upsert({
      where: { fplId: el.id },
      update: {
        code: el.code,
        webName: el.web_name,
        firstName: el.first_name,
        secondName: el.second_name,
        position: { set: positionMap[el.element_type] },
        team: { connect: { fplId: el.team } },
        nowCost: el.now_cost,
        selectedBy: parseFloat(el.selected_by_percent),
        totalPoints: el.total_points,
        pointsPerGame: parseFloat(el.points_per_game),
        form: parseFloat(el.form),
        status: el.status || null,
        news: el.news || null,
        newsAdded: el.news_added ? new Date(el.news_added) : null,
        chanceOfPlaying: el.chance_of_playing_next_round ?? null,
        lastSyncedAt: new Date(),
      },
      create: {
        fplId: el.id,
        code: el.code,
        webName: el.web_name,
        firstName: el.first_name,
        secondName: el.second_name,
        position: positionMap[el.element_type],
        team: { connect: { fplId: el.team } },
        nowCost: el.now_cost,
        selectedBy: parseFloat(el.selected_by_percent),
        totalPoints: el.total_points,
        pointsPerGame: parseFloat(el.points_per_game),
        form: parseFloat(el.form),
        status: el.status || null,
        news: el.news || null,
        newsAdded: el.news_added ? new Date(el.news_added) : null,
        chanceOfPlaying: el.chance_of_playing_next_round ?? null,
        lastSyncedAt: new Date(),
      },
    });
  }
  console.log(`Upserted ${elements.length} players`);

  await disconnectDB();
  console.log('✅ FPL sync completed successfully');
}

main().catch((err) => {
  console.error(err);
  disconnectDB().catch(() => {});
});
