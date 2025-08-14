// scripts/sync-fpl.js – синхронизация команд и игроков FPL в базу данных
//
// Эта версия скрипта использует общий логгер и функции подключения к
// базе данных из модуля `lib/db`.  Она сохраняет прежнюю логику
// upsert'ов для команд и игроков, но выводит сообщения через
// структурированный логгер вместо прямых вызовов console.log.

const { prisma, connectDB, disconnectDB } = require('../lib/db');
const { getBootstrapData } = require('../lib/fplClient');
const { logger } = require('../lib/logger');
const { Prisma } = require('@prisma/client');

async function main() {
  // Подключаемся к базе через helper
  const connected = await connectDB();
  if (!connected) {
    throw new Error('Unable to connect to database');
  }

  // Получаем команды и игроков из FPL API
  const { teams, elements } = await getBootstrapData();
  logger.info(`Fetched ${teams.length} teams and ${elements.length} players from FPL API`);

  // Обновляем или создаём команды (используем fplId как уникальный ключ)
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
  logger.info(`Upserted ${teams.length} teams`);

  // Карта соответствия FPL element_type → enum Position
  const positionMap = {
    1: Prisma.Position.GOALKEEPER,
    2: Prisma.Position.DEFENDER,
    3: Prisma.Position.MIDFIELDER,
    4: Prisma.Position.FORWARD,
  };

  // Обновляем или создаём игроков и связываем их с командами по fplId
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
  logger.info(`Upserted ${elements.length} players`);

  await disconnectDB();
  logger.info('✅ FPL sync completed successfully');
}

main().catch((err) => {
  logger.error(err);
  disconnectDB().catch(() => {});
});