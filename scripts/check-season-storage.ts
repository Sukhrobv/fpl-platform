import { prisma } from "@/lib/db";

async function main() {
  const season = await prisma.season.findUnique({
    where: { code: "2025/26" },
    select: { id: true, code: true, status: true, isCurrent: true },
  });
  if (!season) throw new Error("Season 2025/26 is missing");

  const [
    currentSeasons,
    teams,
    seasonTeams,
    players,
    seasonPlayers,
    activeSeasonPlayers,
    matches,
    seasonMatches,
    fplStats,
    seasonFplStats,
    playedFplStats,
    externalPlayerStats,
    seasonExternalPlayerStats,
    externalTeamStats,
    seasonExternalTeamStats,
    playerMappings,
    seasonMappings,
    unscopedSnapshots,
  ] = await Promise.all([
    prisma.season.count({ where: { isCurrent: true } }),
    prisma.team.count(),
    prisma.seasonTeam.count({ where: { seasonId: season.id } }),
    prisma.player.count(),
    prisma.seasonPlayer.count({ where: { seasonId: season.id } }),
    prisma.seasonPlayer.count({ where: { seasonId: season.id, active: true } }),
    prisma.match.count(),
    prisma.match.count({ where: { seasonId: season.id } }),
    prisma.fPLPlayerStats.count(),
    prisma.fPLPlayerStats.count({ where: { seasonId: season.id } }),
    prisma.fPLPlayerStats.count({
      where: { seasonId: season.id, minutes: { gt: 0 } },
    }),
    prisma.externalPlayerStats.count(),
    prisma.externalPlayerStats.count({ where: { seasonId: season.id } }),
    prisma.externalTeamStats.count(),
    prisma.externalTeamStats.count({ where: { seasonId: season.id } }),
    prisma.playerMapping.count(),
    prisma.seasonPlayerMapping.count({
      where: { seasonPlayer: { seasonId: season.id } },
    }),
    prisma.sourceSnapshot.count({
      where: { season: season.code, seasonId: null },
    }),
  ]);

  const checks = {
    oneCurrentSeason: currentSeasons === 1,
    teamsPreserved: seasonTeams === teams,
    playersPreserved: seasonPlayers === players,
    matchesPreserved: seasonMatches === matches,
    fplStatsPreserved: seasonFplStats === fplStats,
    externalPlayerStatsPreserved:
      seasonExternalPlayerStats === externalPlayerStats,
    externalTeamStatsPreserved: seasonExternalTeamStats === externalTeamStats,
    mappingsPreserved: seasonMappings === playerMappings,
    snapshotsScoped: unscopedSnapshots === 0,
  };
  const result = {
    season,
    counts: {
      seasonTeams,
      seasonPlayers,
      activeSeasonPlayers,
      seasonMatches,
      seasonFplStats,
      playedFplStats,
      seasonExternalPlayerStats,
      seasonExternalTeamStats,
      seasonMappings,
    },
    checks,
    complete: Object.values(checks).every(Boolean),
  };
  console.log(JSON.stringify(result));
  if (!result.complete) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
