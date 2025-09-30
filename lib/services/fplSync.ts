import { Prisma, PrismaClient, type Position } from "@prisma/client";
import type {
  FPLEventLiveResponse,
  FPLFixture,
  FPLBootstrapData,
  FPLLiveElementExplain,
  FPLLiveElementExplainStat,
} from "@/types";
import { logger as defaultLogger } from "@/lib/logger";
import { FPLCollector, FPLCollectorError } from "@/lib/collectors/fplCollector";

const POSITION_MAP: Record<number, Position> = {
  1: "GOALKEEPER",
  2: "DEFENDER",
  3: "MIDFIELDER",
  4: "FORWARD",
};

const DEFAULT_POSITION: Position = "MIDFIELDER" as const;

const UNIX_EPOCH = new Date("1970-01-01T00:00:00.000Z");

export interface SyncOptions {
  events?: number[];
  requestsPerMinute?: number;
  concurrency?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryJitterMs?: number;
}

export interface SyncSummary {
  teamsCreated: number;
  teamsUpdated: number;
  playersCreated: number;
  playersUpdated: number;
  matchesCreated: number;
  matchesUpdated: number;
  statsUpserted: number;
  eventsProcessed: number[];
  startedAt: Date;
  completedAt: Date;
  syncLogId?: number;
}

type Logger = typeof defaultLogger;

interface Dependencies {
  prisma?: PrismaClient;
  collector?: FPLCollector;
  logger?: Logger;
  now?: Date;
}

interface UpsertCounters {
  created: number;
  updated: number;
}

interface SyncContext {
  prisma: PrismaClient;
  collector: FPLCollector;
  logger: Logger;
  now: Date;
}

interface FixtureMaps {
  teamIdByFplId: Map<number, number>;
  matchIdByFplId: Map<number, number>;
  playerIdByFplId: Map<number, number>;
}

interface FixtureStatSnapshot {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  bps: number;
  totalPoints: number;
}

const STAT_IDENTIFIER_MAP: Record<string, keyof FixtureStatSnapshot> = {
  minutes: "minutes",
  goals_scored: "goals",
  assists: "assists",
  clean_sheets: "cleanSheets",
  goals_conceded: "goalsConceded",
  own_goals: "ownGoals",
  penalties_saved: "penaltiesSaved",
  penalties_missed: "penaltiesMissed",
  yellow_cards: "yellowCards",
  red_cards: "redCards",
  saves: "saves",
  bonus: "bonus",
  bps: "bps",
};

const DEFAULT_STAT_SNAPSHOT: FixtureStatSnapshot = {
  minutes: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  goalsConceded: 0,
  ownGoals: 0,
  penaltiesSaved: 0,
  penaltiesMissed: 0,
  yellowCards: 0,
  redCards: 0,
  saves: 0,
  bonus: 0,
  bps: 0,
  totalPoints: 0,
};

export function determineTargetEvents(bootstrap: FPLBootstrapData, explicit?: number[]): number[] {
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit)].sort((a, b) => a - b);
  }
  const current = bootstrap.events.find((event) => event.is_current);
  const previous = bootstrap.events.filter((event) => event.is_previous);
  const limit = current?.id ?? Math.max(0, ...previous.map((event) => event.id));
  return bootstrap.events
    .map((event) => event.id)
    .filter((id) => id <= limit && id > 0)
    .sort((a, b) => a - b);
}

function toFloat(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPlayerUpsertData(element: FPLBootstrapData["elements"][number]) {
  const position = POSITION_MAP[element.element_type] ?? DEFAULT_POSITION;
  const base = {
    code: element.code,
    webName: element.web_name,
    firstName: element.first_name,
    secondName: element.second_name,
    position,
    nowCost: element.now_cost,
    selectedBy: toFloat(element.selected_by_percent),
    totalPoints: element.total_points,
    pointsPerGame: toFloat(element.points_per_game),
    form: toFloat(element.form),
    status: element.status ?? null,
    news: element.news || null,
    newsAdded: element.news_added ? new Date(element.news_added) : null,
    chanceOfPlaying: element.chance_of_playing_next_round ?? null,
    lastSyncedAt: new Date(),
  };

  return {
    fplId: element.id,
    team: { connect: { fplId: element.team } },
    create: {
      fplId: element.id,
      ...base,
      team: { connect: { fplId: element.team } },
    },
    update: {
      code: element.code,
      webName: element.web_name,
      firstName: element.first_name,
      secondName: element.second_name,
      position: { set: position },
      team: { connect: { fplId: element.team } },
      nowCost: element.now_cost,
      selectedBy: toFloat(element.selected_by_percent),
      totalPoints: element.total_points,
      pointsPerGame: toFloat(element.points_per_game),
      form: toFloat(element.form),
      status: element.status ?? null,
      news: element.news || null,
      newsAdded: element.news_added ? new Date(element.news_added) : null,
      chanceOfPlaying: element.chance_of_playing_next_round ?? null,
      lastSyncedAt: new Date(),
    },
  };
}

export function buildTeamUpsertData(team: FPLBootstrapData["teams"][number]) {
  return {
    fplId: team.id,
    create: {
      fplId: team.id,
      name: team.name,
      shortName: team.short_name,
      lastSyncedAt: new Date(),
    },
    update: {
      name: team.name,
      shortName: team.short_name,
      lastSyncedAt: new Date(),
    },
  } satisfies {
    fplId: number;
    create: Prisma.TeamCreateInput;
    update: Prisma.TeamUpdateInput;
  };
}

export function buildMatchUpsertData(fixture: FPLFixture, teamIds: Map<number, number>) {
  const homeTeamId = teamIds.get(fixture.team_h);
  const awayTeamId = teamIds.get(fixture.team_a);
  if (homeTeamId == null || awayTeamId == null) {
    throw new Error(`Missing team mapping for fixture ${fixture.id}`);
  }
  return {
    fplId: fixture.id,
    create: {
      fplId: fixture.id,
      gameweek: fixture.event ?? 0,
      homeTeam: { connect: { id: homeTeamId } },
      awayTeam: { connect: { id: awayTeamId } },
      kickoffTime: fixture.kickoff_time ? new Date(fixture.kickoff_time) : UNIX_EPOCH,
      homeScore: fixture.team_h_score,
      awayScore: fixture.team_a_score,
      finished: fixture.finished,
      started: fixture.started,
    },
    update: {
      gameweek: fixture.event ?? 0,
      homeTeam: { connect: { id: homeTeamId } },
      awayTeam: { connect: { id: awayTeamId } },
      kickoffTime: fixture.kickoff_time ? new Date(fixture.kickoff_time) : UNIX_EPOCH,
      homeScore: fixture.team_h_score,
      awayScore: fixture.team_a_score,
      finished: fixture.finished,
      started: fixture.started,
    },
  } satisfies {
    fplId: number;
    create: Prisma.MatchCreateInput;
    update: Prisma.MatchUpdateInput;
  };
}

export function extractFixtureStats(
  explain: FPLLiveElementExplain,
  cumulativeStats: FPLEventLiveResponse["elements"][number]["stats"],
): FixtureStatSnapshot {
  const snapshot: FixtureStatSnapshot = { ...DEFAULT_STAT_SNAPSHOT };
  for (const stat of explain.stats) {
    applyStatEntry(snapshot, stat);
  }
  // Fallback total points and ICT metrics derived from cumulative stats
  snapshot.totalPoints = snapshot.totalPoints || cumulativeStats.total_points;
  return snapshot;
}

function applyStatEntry(target: FixtureStatSnapshot, entry: FPLLiveElementExplainStat) {
  const key = STAT_IDENTIFIER_MAP[entry.identifier];
  if (key) {
    target[key] = entry.value;
  }
  target.totalPoints += entry.points + (entry.points_modification ?? 0);
}

export async function syncFplData(options: SyncOptions = {}, deps: Dependencies = {}): Promise<SyncSummary> {
  const prisma = deps.prisma ?? new PrismaClient();
  const collector =
    deps.collector ??
    new FPLCollector({
      requestsPerMinute: options.requestsPerMinute,
      concurrency: options.concurrency,
      maxRetries: options.maxRetries,
      retryBaseDelayMs: options.retryBaseDelayMs,
      retryJitterMs: options.retryJitterMs,
    });
  const logger = deps.logger ?? defaultLogger;
  const now = deps.now ?? new Date();
  const context: SyncContext = { prisma, collector, logger, now };

  const startedAt = now;
  const summary: SyncSummary = {
    teamsCreated: 0,
    teamsUpdated: 0,
    playersCreated: 0,
    playersUpdated: 0,
    matchesCreated: 0,
    matchesUpdated: 0,
    statsUpserted: 0,
    eventsProcessed: [],
    startedAt,
    completedAt: startedAt,
  };

  try {
    const bootstrap = await collector.getBootstrap();
    const targetEvents = determineTargetEvents(bootstrap, options.events);
    summary.eventsProcessed = targetEvents;

    const teamCounters = await syncTeams(context, bootstrap);
    summary.teamsCreated = teamCounters.created;
    summary.teamsUpdated = teamCounters.updated;

    const playerCounters = await syncPlayers(context, bootstrap);
    summary.playersCreated = playerCounters.created;
    summary.playersUpdated = playerCounters.updated;

    const fixtureCounters = await syncFixtures(context, bootstrap);
    summary.matchesCreated = fixtureCounters.created;
    summary.matchesUpdated = fixtureCounters.updated;

    const statsCount = await syncEventStats(context, targetEvents);
    summary.statsUpserted = statsCount;

    summary.completedAt = new Date();

    const log = await prisma.syncLog.create({
      data: {
        source: "fpl",
        syncType: "full-sync",
        gameweek: targetEvents.at(-1) ?? null,
        success: true,
        recordsUpdated:
          summary.teamsUpdated +
          summary.playersUpdated +
          summary.matchesUpdated +
          summary.statsUpserted,
        recordsFailed: 0,
        startedAt,
        completedAt: summary.completedAt,
        duration: Math.max(1, Math.round((summary.completedAt.getTime() - startedAt.getTime()) / 1000)),
      },
    });
    summary.syncLogId = log.id;
    logger.info(
      `FPL sync complete — Teams: +${summary.teamsCreated}/${summary.teamsUpdated}, Players: +${summary.playersCreated}/${summary.playersUpdated}, Matches: +${summary.matchesCreated}/${summary.matchesUpdated}, Stats upserted: ${summary.statsUpserted}`,
    );
  } catch (error) {
    summary.completedAt = new Date();
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.syncLog.create({
      data: {
        source: "fpl",
        syncType: "full-sync",
        gameweek: summary.eventsProcessed.at(-1) ?? null,
        success: false,
        recordsUpdated: summary.statsUpserted,
        recordsFailed: 1,
        startedAt,
        completedAt: summary.completedAt,
        duration: Math.max(1, Math.round((summary.completedAt.getTime() - startedAt.getTime()) / 1000)),
        errorMessage: message,
      },
    });
    throw error;
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
  }

  return summary;
}

async function syncTeams(context: SyncContext, bootstrap: FPLBootstrapData): Promise<UpsertCounters> {
  const { prisma } = context;
  const counters: UpsertCounters = { created: 0, updated: 0 };
  for (const team of bootstrap.teams) {
    const data = buildTeamUpsertData(team);
    const existing = await prisma.team.findUnique({ where: { fplId: data.fplId }, select: { id: true } });
    await prisma.team.upsert({
      where: { fplId: data.fplId },
      create: data.create,
      update: data.update,
    });
    if (existing) counters.updated += 1;
    else counters.created += 1;
  }
  return counters;
}

async function syncPlayers(context: SyncContext, bootstrap: FPLBootstrapData): Promise<UpsertCounters> {
  const { prisma } = context;
  const counters: UpsertCounters = { created: 0, updated: 0 };
  for (const element of bootstrap.elements) {
    const upsert = buildPlayerUpsertData(element);
    const existing = await prisma.player.findUnique({ where: { fplId: upsert.fplId }, select: { id: true } });
    await prisma.player.upsert({
      where: { fplId: upsert.fplId },
      create: upsert.create,
      update: upsert.update,
    });
    if (existing) counters.updated += 1;
    else counters.created += 1;
  }
  return counters;
}

async function syncFixtures(context: SyncContext, bootstrap: FPLBootstrapData): Promise<UpsertCounters> {
  const { prisma } = context;
  const counters: UpsertCounters = { created: 0, updated: 0 };
  const teamIds = new Map<number, number>();
  const teams = await prisma.team.findMany({ select: { id: true, fplId: true } });
  teams.forEach((team) => teamIds.set(team.fplId, team.id));

  const fixtures = await context.collector.getFixtures();
  for (const fixture of fixtures) {
    try {
      const data = buildMatchUpsertData(fixture, teamIds);
      const existing = await prisma.match.findUnique({ where: { fplId: data.fplId }, select: { id: true } });
      await prisma.match.upsert({
        where: { fplId: data.fplId },
        create: data.create,
        update: data.update,
      });
      if (existing) counters.updated += 1;
      else counters.created += 1;
    } catch (error) {
      context.logger.warn(`Skipping fixture ${fixture.id} due to missing teams`, error);
    }
  }
  return counters;
}

async function syncEventStats(context: SyncContext, events: number[]): Promise<number> {
  if (events.length === 0) {
    return 0;
  }
  const { prisma, collector } = context;
  const fixtureMaps = await buildFixtureMaps(prisma);
  let upserted = 0;
  for (const eventId of events) {
    let live: FPLEventLiveResponse;
    try {
      live = await collector.getEventLive(eventId);
    } catch (error) {
      if (error instanceof FPLCollectorError) {
        context.logger.warn(`Failed to load live data for event ${eventId}: ${error.message}`);
        continue;
      }
      throw error;
    }
    for (const element of live.elements) {
      const playerId = fixtureMaps.playerIdByFplId.get(element.id);
      if (!playerId) {
        continue;
      }
      for (const explain of element.explain) {
        const matchId = fixtureMaps.matchIdByFplId.get(explain.fixture);
        if (!matchId) continue;
        const snapshot = extractFixtureStats(explain, element.stats);
        await prisma.fPLPlayerStats.upsert({
          where: {
            playerId_matchId: {
              playerId,
              matchId,
            },
          },
          create: {
            player: { connect: { id: playerId } },
            match: { connect: { id: matchId } },
            gameweek: eventId,
            minutes: snapshot.minutes,
            goals: snapshot.goals,
            assists: snapshot.assists,
            cleanSheets: snapshot.cleanSheets,
            goalsConceded: snapshot.goalsConceded,
            ownGoals: snapshot.ownGoals,
            penaltiesSaved: snapshot.penaltiesSaved,
            penaltiesMissed: snapshot.penaltiesMissed,
            yellowCards: snapshot.yellowCards,
            redCards: snapshot.redCards,
            saves: snapshot.saves,
            bonus: snapshot.bonus,
            bps: snapshot.bps,
            totalPoints: snapshot.totalPoints,
            influence: toFloat(element.stats.influence),
            creativity: toFloat(element.stats.creativity),
            threat: toFloat(element.stats.threat),
            ictIndex: toFloat(element.stats.ict_index),
          },
          update: {
            minutes: snapshot.minutes,
            goals: snapshot.goals,
            assists: snapshot.assists,
            cleanSheets: snapshot.cleanSheets,
            goalsConceded: snapshot.goalsConceded,
            ownGoals: snapshot.ownGoals,
            penaltiesSaved: snapshot.penaltiesSaved,
            penaltiesMissed: snapshot.penaltiesMissed,
            yellowCards: snapshot.yellowCards,
            redCards: snapshot.redCards,
            saves: snapshot.saves,
            bonus: snapshot.bonus,
            bps: snapshot.bps,
            totalPoints: snapshot.totalPoints,
            influence: toFloat(element.stats.influence),
            creativity: toFloat(element.stats.creativity),
            threat: toFloat(element.stats.threat),
            ictIndex: toFloat(element.stats.ict_index),
            updatedAt: new Date(),
          },
        });
        upserted += 1;
      }
    }
  }
  return upserted;
}

async function buildFixtureMaps(prisma: PrismaClient): Promise<FixtureMaps> {
  const [teams, players, matches] = await Promise.all([
    prisma.team.findMany({ select: { id: true, fplId: true } }),
    prisma.player.findMany({ select: { id: true, fplId: true } }),
    prisma.match.findMany({ select: { id: true, fplId: true } }),
  ]);
  const teamIdByFplId = new Map<number, number>();
  teams.forEach((team) => teamIdByFplId.set(team.fplId, team.id));
  const playerIdByFplId = new Map<number, number>();
  players.forEach((player) => playerIdByFplId.set(player.fplId, player.id));
  const matchIdByFplId = new Map<number, number>();
  matches.forEach((match) => matchIdByFplId.set(match.fplId, match.id));
  return { teamIdByFplId, playerIdByFplId, matchIdByFplId };
}

export type { FixtureStatSnapshot };











