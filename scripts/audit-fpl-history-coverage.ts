import { prisma } from "@/lib/db";

async function main() {
  const [playedRows, matches, mappedPlayers] = await Promise.all([
    prisma.fPLPlayerStats.findMany({
      where: { minutes: { gt: 0 } },
      select: { playerId: true, gameweek: true, minutes: true },
    }),
    prisma.match.findMany({
      select: { gameweek: true, finished: true },
    }),
    prisma.player.findMany({
      where: {
        playerMappings: { some: { source: "pulselive", status: "CONFIRMED" } },
      },
      select: {
        id: true,
        fplId: true,
        code: true,
        webName: true,
        playerMappings: {
          where: { source: "pulselive" },
          select: { externalId: true },
          take: 1,
        },
        fplStats: {
          where: { minutes: { gt: 0 } },
          select: { minutes: true },
        },
      },
    }),
  ]);

  const rowsByGameweek = new Map<number, number>();
  for (const row of playedRows) {
    rowsByGameweek.set(
      row.gameweek,
      (rowsByGameweek.get(row.gameweek) ?? 0) + 1,
    );
  }
  const matchesByGameweek = new Map<
    number,
    { total: number; finished: number }
  >();
  for (const match of matches) {
    const entry = matchesByGameweek.get(match.gameweek) ?? {
      total: 0,
      finished: 0,
    };
    entry.total += 1;
    if (match.finished) entry.finished += 1;
    matchesByGameweek.set(match.gameweek, entry);
  }

  const missingPlayedHistory = mappedPlayers
    .filter((player) => player.fplStats.length === 0)
    .map((player) => ({
      playerId: player.id,
      fplId: player.fplId,
      code: player.code,
      name: player.webName,
      optaId: player.playerMappings[0]?.externalId,
    }));

  console.log(
    JSON.stringify({
      matches: matches.length,
      finishedMatches: matches.filter((match) => match.finished).length,
      playedRows: playedRows.length,
      uniquePlayersWithHistory: new Set(playedRows.map((row) => row.playerId))
        .size,
      mappedPulseLivePlayers: mappedPlayers.length,
      mappedPlayersMissingFplHistory: missingPlayedHistory.length,
      missingPlayedHistorySample: missingPlayedHistory.slice(0, 20),
      gameweeks: [
        ...new Set([...rowsByGameweek.keys(), ...matchesByGameweek.keys()]),
      ]
        .sort((left, right) => left - right)
        .map((gameweek) => ({
          gameweek,
          matches: matchesByGameweek.get(gameweek)?.total ?? 0,
          finishedMatches: matchesByGameweek.get(gameweek)?.finished ?? 0,
          playedRows: rowsByGameweek.get(gameweek) ?? 0,
        })),
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
