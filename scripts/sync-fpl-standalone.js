const { PrismaClient, Prisma } = require('@prisma/client');

// Instantiate a new Prisma client
const prisma = new PrismaClient();

// Base URL for the public Fantasy Premier League API
const FPL_API_BASE_URL = 'https://fantasy.premierleague.com/api';

// Fetch the bootstrap-static data which contains all teams and players
async function getBootstrapData() {
  const res = await fetch(`${FPL_API_BASE_URL}/bootstrap-static/`);
  if (!res.ok) {
    throw new Error(`Failed to fetch bootstrap data: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  console.log('Connecting to database...');
  await prisma.$connect();
  console.log('Database connected');

  // Retrieve FPL data
  console.log('Fetching data from FPL API...');
  const { teams, elements } = await getBootstrapData();
  console.log(`Fetched ${teams.length} teams and ${elements.length} players`);

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

  // Вместо использования Prisma.Position.* задаём строковые значения enum
    const positionMap = {
        1: 'GOALKEEPER',
        2: 'DEFENDER',
        3: 'MIDFIELDER',
        4: 'FORWARD',
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

  await prisma.$disconnect();
  console.log('✅ FPL sync completed successfully');
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().catch(() => {});
});
