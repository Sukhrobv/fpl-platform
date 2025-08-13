"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/sync-fpl.ts – синхронизация команд и игроков FPL в базу данных
const db_1 = require("../lib/db");
const fplClient_1 = require("../lib/fplClient");
async function main() {
    var _a, _b;
    const connected = await (0, db_1.connectDB)();
    if (!connected) {
        throw new Error("Unable to connect to database");
    }
    const { teams, elements } = await (0, fplClient_1.getBootstrapData)();
    console.log(`Fetched ${teams.length} teams and ${elements.length} players from FPL API`);
    // Обновляем/создаём команды (используем fplId как уникальный ключ)
    for (const team of teams) {
        await db_1.prisma.team.upsert({
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
    // Карта соответствия FPL element_type → enum Position
    const positionMap = {
        1: "GOALKEEPER",
        2: "DEFENDER",
        3: "MIDFIELDER",
        4: "FORWARD",
    };
    // Обновляем/создаём игроков и связываем их с командами по fplId
    for (const el of elements) {
        await db_1.prisma.player.upsert({
            where: { fplId: el.id },
            update: {
                code: el.code,
                webName: el.web_name,
                firstName: el.first_name,
                secondName: el.second_name,
                // для enum поля используем обёртку set:
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
                chanceOfPlaying: (_a = el.chance_of_playing_next_round) !== null && _a !== void 0 ? _a : null,
                lastSyncedAt: new Date(),
            },
            create: {
                fplId: el.id,
                code: el.code,
                webName: el.web_name,
                firstName: el.first_name,
                secondName: el.second_name,
                // при создании достаточно указать enum напрямую
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
                chanceOfPlaying: (_b = el.chance_of_playing_next_round) !== null && _b !== void 0 ? _b : null,
                lastSyncedAt: new Date(),
            },
        });
    }
    console.log(`Upserted ${elements.length} players`);
    await (0, db_1.disconnectDB)();
    console.log("✅ FPL sync completed successfully");
}
main().catch((err) => {
    console.error(err);
    (0, db_1.disconnectDB)().catch(() => { });
});
