import { Prisma, PrismaClient, type Position } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
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
  historyOnly?: boolean;
  rosterOnly?: boolean;
  allowSeasonRollover?: boolean;
  activateSeason?: boolean;
  requestsPerMinute?: number;
  concurrency?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryJitterMs?: number;
}

export interface SyncSummary {
  season: string;
  rolloverActivated: boolean;
  rolloverReport?: RolloverReport;
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

interface SeasonContext {
  id: number;
  code: string;
  previousSeasonId: number | null;
  previousSeasonCode: string | null;
  isRollover: boolean;
}

export interface RolloverReport {
  fromSeason: string | null;
  toSeason: string;
  returningPlayers: number;
  newPlayers: number;
  transferredPlayers: number;
  promotedTeams: string[];
  relegatedTeams: string[];
  missingOptaIds: number[];
  identityConflicts: string[];
}

interface FixtureMaps {
  matchIdByFplId: Map<number, number>;
  playerIdByFplId: Map<number, number>;
  seasonPlayerIdByFplId: Map<number, number>;
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

export interface EventStatRow extends FixtureStatSnapshot {
  seasonPlayerId: number;
  playerId: number;
  matchId: number;
  gameweek: number;
  influence: number;
  creativity: number;
  threat: number;
  ictIndex: number;
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

export function determineTargetEvents(
  bootstrap: FPLBootstrapData,
  explicit?: number[],
): number[] {
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit)].sort((a, b) => a - b);
  }
  const current = bootstrap.events.find((event) => event.is_current);
  const previous = bootstrap.events.filter((event) => event.is_previous);
  const limit =
    current?.id ?? Math.max(0, ...previous.map((event) => event.id));
  return bootstrap.events
    .map((event) => event.id)
    .filter((id) => id <= limit && id > 0)
    .sort((a, b) => a - b);
}

export function inferSeason(bootstrap: FPLBootstrapData): string {
  const deadline = bootstrap.events
    .map((event) => event.deadline_time)
    .find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  if (!deadline)
    throw new Error("FPL bootstrap has no event deadline for season inference");
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Invalid FPL event deadline '${deadline}'`);
  const startYear =
    date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function assertSeasonTransitionAllowed(
  currentSeason: string,
  incomingSeason: string,
  allowSeasonRollover = false,
): boolean {
  const isRollover = currentSeason !== incomingSeason;
  if (isRollover && !allowSeasonRollover) {
    throw new Error(
      `FPL season changed from ${currentSeason} to ${incomingSeason}. Raw bootstrap was captured, but transformation is blocked. Re-run with explicit rollover mode after reviewing the snapshot.`,
    );
  }
  return isRollover;
}

export function shouldActivateRollover(
  isRollover: boolean,
  activateSeason = false,
): boolean {
  return isRollover && activateSeason;
}

export function validateFixtureCoverage(
  fixtures: FPLFixture[],
  bootstrap: FPLBootstrapData,
): string[] {
  const errors: string[] = [];
  if (fixtures.length !== 380) {
    errors.push(`expected 380 fixtures, received ${fixtures.length}`);
  }
  const teamIds = new Set(bootstrap.teams.map((team) => team.id));
  const fixtureIds = new Set<number>();
  for (const fixture of fixtures) {
    if (fixtureIds.has(fixture.id)) {
      errors.push(`duplicate FPL fixture id ${fixture.id}`);
    }
    if (!teamIds.has(fixture.team_h) || !teamIds.has(fixture.team_a)) {
      errors.push(`fixture ${fixture.id} references an unknown team`);
    }
    if (fixture.event != null && (fixture.event < 1 || fixture.event > 38)) {
      errors.push(`fixture ${fixture.id} has invalid event ${fixture.event}`);
    }
    fixtureIds.add(fixture.id);
  }
  return errors;
}

export function validateBootstrapCoverage(
  bootstrap: FPLBootstrapData,
): string[] {
  const errors: string[] = [];
  if (bootstrap.teams.length !== 20)
    errors.push(`expected 20 teams, received ${bootstrap.teams.length}`);
  if (bootstrap.events.length !== 38) {
    errors.push(`expected 38 events, received ${bootstrap.events.length}`);
  }
  if (bootstrap.elements.length < 500 || bootstrap.elements.length > 1000) {
    errors.push(`implausible player count ${bootstrap.elements.length}`);
  }
  const teamIds = new Set(bootstrap.teams.map((team) => team.id));
  const playerIds = new Set<number>();
  const playerCodes = new Set<number>();
  for (const player of bootstrap.elements) {
    if (playerIds.has(player.id))
      errors.push(`duplicate FPL player id ${player.id}`);
    if (playerCodes.has(player.code))
      errors.push(`duplicate FPL player code ${player.code}`);
    if (!teamIds.has(player.team))
      errors.push(`player ${player.id} references unknown team ${player.team}`);
    if (!POSITION_MAP[player.element_type]) {
      errors.push(
        `player ${player.id} has invalid position ${player.element_type}`,
      );
    }
    playerIds.add(player.id);
    playerCodes.add(player.code);
  }
  return errors;
}

function toFloat(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPlayerUpsertData(
  element: FPLBootstrapData["elements"][number],
) {
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

export function buildMatchUpsertData(
  fixture: FPLFixture,
  teamIds: Map<number, number>,
) {
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
      kickoffTime: fixture.kickoff_time
        ? new Date(fixture.kickoff_time)
        : UNIX_EPOCH,
      homeScore: fixture.team_h_score,
      awayScore: fixture.team_a_score,
      finished: fixture.finished,
      started: fixture.started,
    },
    update: {
      gameweek: fixture.event ?? 0,
      homeTeam: { connect: { id: homeTeamId } },
      awayTeam: { connect: { id: awayTeamId } },
      kickoffTime: fixture.kickoff_time
        ? new Date(fixture.kickoff_time)
        : UNIX_EPOCH,
      homeScore: fixture.team_h_score,
      awayScore: fixture.team_a_score,
      finished: fixture.finished,
      started: fixture.started,
    },
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

function applyStatEntry(
  target: FixtureStatSnapshot,
  entry: FPLLiveElementExplainStat,
) {
  const key = STAT_IDENTIFIER_MAP[entry.identifier];
  if (key) {
    target[key] = entry.value;
  }
  target.totalPoints += entry.points + (entry.points_modification ?? 0);
}

export function buildEventStatRows(
  live: FPLEventLiveResponse,
  eventId: number,
  playerIdByFplId: Map<number, number>,
  seasonPlayerIdByFplId: Map<number, number>,
  matchIdByFplId: Map<number, number>,
): EventStatRow[] {
  const rows: EventStatRow[] = [];
  for (const element of live.elements) {
    const playerId = playerIdByFplId.get(element.id);
    const seasonPlayerId = seasonPlayerIdByFplId.get(element.id);
    if (!playerId || !seasonPlayerId) continue;
    for (const explain of element.explain) {
      const matchId = matchIdByFplId.get(explain.fixture);
      if (!matchId) continue;
      const snapshot = extractFixtureStats(explain, element.stats);
      rows.push({
        seasonPlayerId,
        playerId,
        matchId,
        gameweek: eventId,
        ...snapshot,
        influence: toFloat(element.stats.influence),
        creativity: toFloat(element.stats.creativity),
        threat: toFloat(element.stats.threat),
        ictIndex: toFloat(element.stats.ict_index),
      });
    }
  }
  return rows;
}

export function validateEventCoverage(
  eventId: number,
  rowCount: number,
  finishedMatches: number,
): void {
  const minimumRows = finishedMatches * 20;
  if (finishedMatches > 0 && rowCount < minimumRows) {
    throw new Error(
      `FPL event ${eventId} coverage is incomplete: ${rowCount} player-fixture rows for ${finishedMatches} finished matches (minimum ${minimumRows})`,
    );
  }
}

async function persistBootstrapSnapshot(
  context: SyncContext,
  bootstrap: FPLBootstrapData,
  season: string,
  seasonId?: number,
): Promise<number> {
  const errors = validateBootstrapCoverage(bootstrap);
  const payload = bootstrap as unknown as Prisma.InputJsonValue;
  const checksum = createHash("sha256")
    .update(JSON.stringify(bootstrap))
    .digest("hex");
  const gameweek = Math.max(
    0,
    ...bootstrap.events
      .filter((event) => event.finished)
      .map((event) => event.id),
  );
  const snapshot = await context.prisma.sourceSnapshot.create({
    data: {
      seasonId,
      source: "fpl",
      dataset: "bootstrap-static",
      season,
      sourceSeasonId: season,
      gameweek: gameweek || null,
      batchId: randomUUID(),
      schemaVersion: 1,
      fetchedAt: context.now,
      checksum,
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : null,
      recordCount: bootstrap.elements.length,
      payload,
    },
  });
  if (errors.length > 0) {
    throw new Error(
      `FPL bootstrap coverage validation failed: ${errors.join("; ")}`,
    );
  }
  return snapshot.id;
}

async function persistFixtureSnapshot(
  context: SyncContext,
  fixtures: FPLFixture[],
  bootstrap: FPLBootstrapData,
  season: SeasonContext,
): Promise<void> {
  const errors = validateFixtureCoverage(fixtures, bootstrap);
  const checksum = createHash("sha256")
    .update(JSON.stringify(fixtures))
    .digest("hex");
  await context.prisma.sourceSnapshot.create({
    data: {
      seasonId: season.id,
      source: "fpl",
      dataset: "fixtures",
      season: season.code,
      sourceSeasonId: season.code,
      gameweek: null,
      batchId: randomUUID(),
      schemaVersion: 1,
      fetchedAt: context.now,
      checksum,
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : null,
      recordCount: fixtures.length,
      payload: fixtures as unknown as Prisma.InputJsonValue,
    },
  });
  if (errors.length > 0) {
    throw new Error(
      `FPL fixture coverage validation failed: ${errors.join("; ")}`,
    );
  }
}

function parseSeasonCode(code: string): { startYear: number; endYear: number } {
  const match = /^(\d{4})\/(\d{2})$/.exec(code);
  if (!match) throw new Error(`Invalid season code '${code}'`);
  const startYear = Number(match[1]);
  const endYear = Math.floor(startYear / 100) * 100 + Number(match[2]);
  if (endYear !== startYear + 1) {
    throw new Error(`Season code '${code}' is not consecutive`);
  }
  return { startYear, endYear };
}

async function resolveSeasonContext(
  context: SyncContext,
  incomingSeason: string,
  options: SyncOptions,
): Promise<SeasonContext> {
  const current = await context.prisma.season.findFirst({
    where: { isCurrent: true },
    select: { id: true, code: true, startYear: true },
  });
  if (!current) {
    throw new Error("No canonical current season is configured");
  }
  const isRollover = assertSeasonTransitionAllowed(
    current.code,
    incomingSeason,
    options.allowSeasonRollover,
  );
  if (!isRollover) {
    return {
      id: current.id,
      code: current.code,
      previousSeasonId: null,
      previousSeasonCode: null,
      isRollover: false,
    };
  }
  if (options.historyOnly) {
    throw new Error("Season rollover cannot run in --history-only mode");
  }
  const years = parseSeasonCode(incomingSeason);
  if (years.startYear !== current.startYear + 1) {
    throw new Error(
      `Refusing non-consecutive rollover ${current.code} -> ${incomingSeason}`,
    );
  }
  const target = await context.prisma.season.upsert({
    where: { code: incomingSeason },
    create: {
      code: incomingSeason,
      startYear: years.startYear,
      endYear: years.endYear,
      status: "UPCOMING",
      isCurrent: false,
    },
    update: {},
    select: { id: true, code: true, isCurrent: true },
  });
  if (target.isCurrent) {
    throw new Error(
      `Season ${incomingSeason} is already current but ${current.code} is also marked current`,
    );
  }
  return {
    id: target.id,
    code: target.code,
    previousSeasonId: current.id,
    previousSeasonCode: current.code,
    isRollover: true,
  };
}

export async function syncFplData(
  options: SyncOptions = {},
  deps: Dependencies = {},
): Promise<SyncSummary> {
  if (options.historyOnly && options.rosterOnly) {
    throw new Error("--history-only and --roster-only cannot be used together");
  }
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
    season: "",
    rolloverActivated: false,
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
  let syncSeasonId: number | undefined;

  try {
    const bootstrap = await collector.getBootstrap();
    const incomingSeason = inferSeason(bootstrap);
    summary.season = incomingSeason;
    const knownSeason = await prisma.season.findUnique({
      where: { code: incomingSeason },
      select: { id: true },
    });
    const bootstrapSnapshotId = await persistBootstrapSnapshot(
      context,
      bootstrap,
      incomingSeason,
      knownSeason?.id,
    );
    const season = await resolveSeasonContext(context, incomingSeason, options);
    syncSeasonId = season.id;
    if (!knownSeason) {
      await prisma.sourceSnapshot.update({
        where: { id: bootstrapSnapshotId },
        data: { seasonId: season.id },
      });
    }
    const targetEvents = options.rosterOnly
      ? []
      : determineTargetEvents(bootstrap, options.events);
    summary.eventsProcessed = targetEvents;

    if (!options.historyOnly) {
      const teamCounters = await syncTeams(context, bootstrap, season);
      summary.teamsCreated = teamCounters.created;
      summary.teamsUpdated = teamCounters.updated;

      const playerCounters = await syncPlayers(context, bootstrap, season);
      summary.playersCreated = playerCounters.created;
      summary.playersUpdated = playerCounters.updated;

      const fixtures = await collector.getFixtures();
      await persistFixtureSnapshot(context, fixtures, bootstrap, season);
      const fixtureCounters = await syncFixtures(context, season, fixtures);
      summary.matchesCreated = fixtureCounters.created;
      summary.matchesUpdated = fixtureCounters.updated;

      if (season.isRollover) {
        summary.rolloverReport = await buildRolloverReport(
          context,
          bootstrap,
          season,
        );
        await assertRolloverReadiness(
          context,
          bootstrap,
          season,
          summary.rolloverReport,
        );
      }
    }

    const statsCount = await syncEventStats(context, season, targetEvents);
    summary.statsUpserted = statsCount;

    if (shouldActivateRollover(season.isRollover, options.activateSeason)) {
      await activateSeason(context, season);
      summary.rolloverActivated = true;
    }

    summary.completedAt = new Date();

    const log = await prisma.syncLog.create({
      data: {
        seasonId: season.id,
        source: "fpl",
        syncType: options.historyOnly
          ? "history-only"
          : options.rosterOnly
            ? "roster-only"
            : "full-sync",
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
        duration: Math.max(
          1,
          Math.round(
            (summary.completedAt.getTime() - startedAt.getTime()) / 1000,
          ),
        ),
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
        seasonId: syncSeasonId,
        source: "fpl",
        syncType: options.historyOnly
          ? "history-only"
          : options.rosterOnly
            ? "roster-only"
            : "full-sync",
        gameweek: summary.eventsProcessed.at(-1) ?? null,
        success: false,
        recordsUpdated: summary.statsUpserted,
        recordsFailed: 1,
        startedAt,
        completedAt: summary.completedAt,
        duration: Math.max(
          1,
          Math.round(
            (summary.completedAt.getTime() - startedAt.getTime()) / 1000,
          ),
        ),
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

async function syncTeams(
  context: SyncContext,
  bootstrap: FPLBootstrapData,
  season: SeasonContext,
): Promise<UpsertCounters> {
  const { prisma } = context;
  const [stableTeams, existingRegistrations] = await Promise.all([
    prisma.team.findMany(),
    prisma.seasonTeam.findMany({ where: { seasonId: season.id } }),
  ]);
  const registrationByFplId = new Map(
    existingRegistrations.map((registration) => [
      registration.fplId,
      registration,
    ]),
  );
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en-GB");
  const claimedStableTeams = new Map<number, number>();
  const counters: UpsertCounters = { created: 0, updated: 0 };
  for (const team of bootstrap.teams) {
    const existingRegistration = registrationByFplId.get(team.id);
    const candidates = stableTeams.filter(
      (stable) =>
        normalize(stable.name) === normalize(team.name) ||
        normalize(stable.shortName) === normalize(team.short_name),
    );
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    if (!existingRegistration && candidateIds.size > 1) {
      throw new Error(
        `Ambiguous stable team identity for ${team.name}: ${candidates.map((candidate) => candidate.name).join(", ")}`,
      );
    }
    let stableTeamId = existingRegistration?.teamId ?? candidates[0]?.id;
    if (stableTeamId == null) {
      const created = await prisma.team.create({
        data: {
          fplId: team.id,
          name: team.name,
          shortName: team.short_name,
          lastSyncedAt: context.now,
        },
      });
      stableTeams.push(created);
      stableTeamId = created.id;
    } else if (!season.isRollover) {
      await prisma.team.update({
        where: { id: stableTeamId },
        data: {
          fplId: team.id,
          name: team.name,
          shortName: team.short_name,
          lastSyncedAt: context.now,
        },
      });
    }
    const claimedBy = claimedStableTeams.get(stableTeamId);
    if (claimedBy != null && claimedBy !== team.id) {
      throw new Error(
        `Stable team ${stableTeamId} is claimed by FPL teams ${claimedBy} and ${team.id}`,
      );
    }
    claimedStableTeams.set(stableTeamId, team.id);
    await prisma.seasonTeam.upsert({
      where: { seasonId_fplId: { seasonId: season.id, fplId: team.id } },
      create: {
        seasonId: season.id,
        teamId: stableTeamId,
        fplId: team.id,
        name: team.name,
        shortName: team.short_name,
        active: true,
      },
      update: {
        teamId: stableTeamId,
        name: team.name,
        shortName: team.short_name,
        active: true,
      },
    });
    if (existingRegistration) counters.updated += 1;
    else counters.created += 1;
  }
  await prisma.seasonTeam.updateMany({
    where: {
      seasonId: season.id,
      fplId: { notIn: bootstrap.teams.map((team) => team.id) },
    },
    data: { active: false },
  });
  return counters;
}

async function syncPlayers(
  context: SyncContext,
  bootstrap: FPLBootstrapData,
  season: SeasonContext,
): Promise<UpsertCounters> {
  const { prisma } = context;
  const [existingRegistrations, seasonTeams] = await Promise.all([
    prisma.seasonPlayer.findMany({
      where: { seasonId: season.id },
      select: { fplId: true },
    }),
    prisma.seasonTeam.findMany({
      where: { seasonId: season.id, active: true },
      select: { id: true, teamId: true, fplId: true },
    }),
  ]);
  const existingIds = new Set(
    existingRegistrations.map((registration) => registration.fplId),
  );
  const seasonTeamByFplId = new Map(
    seasonTeams.map((team) => [team.fplId, team]),
  );
  const counters: UpsertCounters = {
    created: bootstrap.elements.filter(
      (element) => !existingIds.has(element.id),
    ).length,
    updated: bootstrap.elements.filter((element) => existingIds.has(element.id))
      .length,
  };
  const batchSize = 250;
  for (let index = 0; index < bootstrap.elements.length; index += batchSize) {
    const batch = bootstrap.elements.slice(index, index + batchSize);
    const values = batch.map((element) => {
      const seasonTeam = seasonTeamByFplId.get(element.team);
      if (seasonTeam == null)
        throw new Error(`Missing team mapping for player ${element.id}`);
      const position = POSITION_MAP[element.element_type];
      if (!position)
        throw new Error(`Invalid position for player ${element.id}`);
      return Prisma.sql`(
        ${element.id}, ${element.code}, ${element.web_name}, ${element.first_name},
        ${element.second_name}, CAST(${position} AS "Position"), ${seasonTeam.teamId}, ${element.now_cost},
        ${toFloat(element.selected_by_percent)}, ${element.total_points},
        ${toFloat(element.points_per_game)}, ${toFloat(element.form)}, ${element.status ?? null},
        ${element.news || null}, ${element.news_added ? new Date(element.news_added) : null},
        ${element.chance_of_playing_next_round ?? null}, ${season.code}, ${!season.isRollover},
        ${context.now}, ${context.now}, ${context.now}, ${context.now}, ${context.now}
      )`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "players" (
        "fplId", "code", "webName", "firstName", "secondName", "position", "teamId",
        "nowCost", "selectedBy", "totalPoints", "pointsPerGame", "form", "status", "news",
        "newsAdded", "chanceOfPlaying", "season", "active", "firstSeenAt", "lastSeenAt",
        "createdAt", "updatedAt", "lastSyncedAt"
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT ("code") DO UPDATE SET
        "fplId" = CASE WHEN ${season.isRollover} THEN "players"."fplId" ELSE EXCLUDED."fplId" END,
        "webName" = EXCLUDED."webName",
        "firstName" = EXCLUDED."firstName",
        "secondName" = EXCLUDED."secondName",
        "position" = CASE WHEN ${season.isRollover} THEN "players"."position" ELSE EXCLUDED."position" END,
        "teamId" = CASE WHEN ${season.isRollover} THEN "players"."teamId" ELSE EXCLUDED."teamId" END,
        "nowCost" = CASE WHEN ${season.isRollover} THEN "players"."nowCost" ELSE EXCLUDED."nowCost" END,
        "selectedBy" = CASE WHEN ${season.isRollover} THEN "players"."selectedBy" ELSE EXCLUDED."selectedBy" END,
        "totalPoints" = CASE WHEN ${season.isRollover} THEN "players"."totalPoints" ELSE EXCLUDED."totalPoints" END,
        "pointsPerGame" = CASE WHEN ${season.isRollover} THEN "players"."pointsPerGame" ELSE EXCLUDED."pointsPerGame" END,
        "form" = CASE WHEN ${season.isRollover} THEN "players"."form" ELSE EXCLUDED."form" END,
        "status" = CASE WHEN ${season.isRollover} THEN "players"."status" ELSE EXCLUDED."status" END,
        "news" = CASE WHEN ${season.isRollover} THEN "players"."news" ELSE EXCLUDED."news" END,
        "newsAdded" = CASE WHEN ${season.isRollover} THEN "players"."newsAdded" ELSE EXCLUDED."newsAdded" END,
        "chanceOfPlaying" = CASE WHEN ${season.isRollover} THEN "players"."chanceOfPlaying" ELSE EXCLUDED."chanceOfPlaying" END,
        "season" = CASE WHEN ${season.isRollover} THEN "players"."season" ELSE EXCLUDED."season" END,
        "active" = CASE WHEN ${season.isRollover} THEN "players"."active" ELSE TRUE END,
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "updatedAt" = EXCLUDED."updatedAt",
        "lastSyncedAt" = EXCLUDED."lastSyncedAt"
    `);
  }

  const stablePlayers = await prisma.player.findMany({
    where: { code: { in: bootstrap.elements.map((element) => element.code) } },
    select: { id: true, code: true },
  });
  const playerIdByCode = new Map(
    stablePlayers.map((player) => [player.code, player.id]),
  );
  for (let index = 0; index < bootstrap.elements.length; index += batchSize) {
    const batch = bootstrap.elements.slice(index, index + batchSize);
    const values = batch.map((element) => {
      const playerId = playerIdByCode.get(element.code);
      const seasonTeam = seasonTeamByFplId.get(element.team);
      const position = POSITION_MAP[element.element_type];
      if (playerId == null || seasonTeam == null || position == null) {
        throw new Error(`Missing seasonal identity for player ${element.id}`);
      }
      return Prisma.sql`(
        ${season.id}, ${playerId}, ${seasonTeam.id}, ${element.id}, CAST(${position} AS "Position"),
        ${element.now_cost}, ${toFloat(element.selected_by_percent)}, ${element.total_points},
        ${toFloat(element.points_per_game)}, ${toFloat(element.form)}, ${element.status ?? null},
        ${element.news || null}, ${element.news_added ? new Date(element.news_added) : null},
        ${element.chance_of_playing_next_round ?? null}, TRUE, ${context.now}, ${context.now},
        ${context.now}, ${context.now}
      )`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "season_players" (
        "seasonId", "playerId", "seasonTeamId", "fplId", "position", "nowCost",
        "selectedBy", "totalPoints", "pointsPerGame", "form", "status", "news",
        "newsAdded", "chanceOfPlaying", "active", "firstSeenAt", "lastSeenAt",
        "createdAt", "updatedAt"
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT ("seasonId", "fplId") DO UPDATE SET
        "playerId" = EXCLUDED."playerId",
        "seasonTeamId" = EXCLUDED."seasonTeamId",
        "position" = EXCLUDED."position",
        "nowCost" = EXCLUDED."nowCost",
        "selectedBy" = EXCLUDED."selectedBy",
        "totalPoints" = EXCLUDED."totalPoints",
        "pointsPerGame" = EXCLUDED."pointsPerGame",
        "form" = EXCLUDED."form",
        "status" = EXCLUDED."status",
        "news" = EXCLUDED."news",
        "newsAdded" = EXCLUDED."newsAdded",
        "chanceOfPlaying" = EXCLUDED."chanceOfPlaying",
        "active" = TRUE,
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
  }
  await prisma.seasonPlayer.updateMany({
    where: {
      seasonId: season.id,
      fplId: { notIn: bootstrap.elements.map((element) => element.id) },
    },
    data: { active: false },
  });
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "season_player_mappings" (
      "seasonPlayerId", "source", "externalId", "method", "status", "confidence",
      "mappedBy", "mappedAt", "verifiedAt", "notes"
    )
    SELECT
      sp."id", pm."source", pm."externalId", pm."method", pm."status", pm."confidence",
      pm."mappedBy", pm."mappedAt", pm."verifiedAt", pm."notes"
    FROM "season_players" sp
    JOIN "player_mappings" pm ON pm."playerId" = sp."playerId"
    WHERE sp."seasonId" = ${season.id}
    ON CONFLICT ("seasonPlayerId", "source") DO NOTHING
  `);
  return counters;
}

async function syncFixtures(
  context: SyncContext,
  season: SeasonContext,
  fixtures: FPLFixture[],
): Promise<UpsertCounters> {
  const { prisma } = context;
  const [teams, existingMatches] = await Promise.all([
    prisma.seasonTeam.findMany({
      where: { seasonId: season.id, active: true },
      select: { id: true, teamId: true, fplId: true },
    }),
    prisma.match.findMany({
      where: { seasonId: season.id },
      select: { fplId: true },
    }),
  ]);
  const teamIds = new Map(teams.map((team) => [team.fplId, team]));
  const existingIds = new Set(existingMatches.map((match) => match.fplId));
  const counters: UpsertCounters = {
    created: fixtures.filter((fixture) => !existingIds.has(fixture.id)).length,
    updated: fixtures.filter((fixture) => existingIds.has(fixture.id)).length,
  };
  const batchSize = 200;
  for (let index = 0; index < fixtures.length; index += batchSize) {
    const batch = fixtures.slice(index, index + batchSize);
    const values = batch.map((fixture) => {
      const homeTeam = teamIds.get(fixture.team_h);
      const awayTeam = teamIds.get(fixture.team_a);
      if (homeTeam == null || awayTeam == null) {
        throw new Error(`Missing team mapping for fixture ${fixture.id}`);
      }
      return Prisma.sql`(
        ${season.id}, ${fixture.id}, ${fixture.event ?? 0}, ${homeTeam.teamId}, ${awayTeam.teamId},
        ${homeTeam.id}, ${awayTeam.id},
        ${fixture.kickoff_time ? new Date(fixture.kickoff_time) : UNIX_EPOCH},
        ${fixture.team_h_score}, ${fixture.team_a_score}, ${fixture.finished},
        ${fixture.started}, ${context.now}, ${context.now}
      )`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "matches" (
        "seasonId", "fplId", "gameweek", "homeTeamId", "awayTeamId",
        "homeSeasonTeamId", "awaySeasonTeamId", "kickoffTime",
        "homeScore", "awayScore", "finished", "started", "createdAt", "updatedAt"
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT ("seasonId", "fplId") DO UPDATE SET
        "gameweek" = EXCLUDED."gameweek",
        "homeTeamId" = EXCLUDED."homeTeamId",
        "awayTeamId" = EXCLUDED."awayTeamId",
        "homeSeasonTeamId" = EXCLUDED."homeSeasonTeamId",
        "awaySeasonTeamId" = EXCLUDED."awaySeasonTeamId",
        "kickoffTime" = EXCLUDED."kickoffTime",
        "homeScore" = EXCLUDED."homeScore",
        "awayScore" = EXCLUDED."awayScore",
        "finished" = EXCLUDED."finished",
        "started" = EXCLUDED."started",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
  }
  return counters;
}

async function buildRolloverReport(
  context: SyncContext,
  bootstrap: FPLBootstrapData,
  season: SeasonContext,
): Promise<RolloverReport> {
  const currentPlayers = await context.prisma.seasonPlayer.findMany({
    where: { seasonId: season.id, active: true },
    select: {
      fplId: true,
      playerId: true,
      seasonTeam: { select: { teamId: true } },
    },
  });
  const previousPlayers = season.previousSeasonId
    ? await context.prisma.seasonPlayer.findMany({
        where: { seasonId: season.previousSeasonId, active: true },
        select: {
          playerId: true,
          seasonTeam: { select: { teamId: true } },
        },
      })
    : [];
  const [currentTeams, previousTeams, mappings] = await Promise.all([
    context.prisma.seasonTeam.findMany({
      where: { seasonId: season.id, active: true },
      select: { teamId: true, name: true },
    }),
    season.previousSeasonId
      ? context.prisma.seasonTeam.findMany({
          where: { seasonId: season.previousSeasonId, active: true },
          select: { teamId: true, name: true },
        })
      : Promise.resolve([]),
    context.prisma.seasonPlayerMapping.findMany({
      where: { seasonPlayer: { seasonId: season.id } },
      select: {
        source: true,
        externalId: true,
        seasonPlayer: { select: { fplId: true } },
      },
    }),
  ]);
  const previousPlayerById = new Map(
    previousPlayers.map((player) => [player.playerId, player]),
  );
  const currentTeamIds = new Set(currentTeams.map((team) => team.teamId));
  const previousTeamIds = new Set(previousTeams.map((team) => team.teamId));
  const identityConflicts: string[] = [];
  const missingOptaIds: number[] = [];
  const optaOwners = new Map<string, number>();
  for (const element of bootstrap.elements) {
    const expected = `p${element.code}`;
    const opta = element.opta_code?.trim().toLowerCase();
    if (!opta) {
      missingOptaIds.push(element.id);
      continue;
    }
    if (opta !== expected.toLowerCase()) {
      identityConflicts.push(
        `FPL player ${element.id} has code ${element.code} but opta_code '${element.opta_code}'`,
      );
    }
    const owner = optaOwners.get(opta);
    if (owner != null && owner !== element.id) {
      identityConflicts.push(
        `Opta ID '${opta}' belongs to FPL players ${owner} and ${element.id}`,
      );
    }
    optaOwners.set(opta, element.id);
  }
  const mappingOwners = new Map<string, number>();
  for (const mapping of mappings) {
    const key = `${mapping.source}:${mapping.externalId}`;
    const owner = mappingOwners.get(key);
    if (owner != null && owner !== mapping.seasonPlayer.fplId) {
      identityConflicts.push(
        `Mapping '${key}' belongs to seasonal players ${owner} and ${mapping.seasonPlayer.fplId}`,
      );
    }
    mappingOwners.set(key, mapping.seasonPlayer.fplId);
  }
  return {
    fromSeason: season.previousSeasonCode,
    toSeason: season.code,
    returningPlayers: currentPlayers.filter((player) =>
      previousPlayerById.has(player.playerId),
    ).length,
    newPlayers: currentPlayers.filter(
      (player) => !previousPlayerById.has(player.playerId),
    ).length,
    transferredPlayers: currentPlayers.filter((player) => {
      const previous = previousPlayerById.get(player.playerId);
      return (
        previous && previous.seasonTeam.teamId !== player.seasonTeam.teamId
      );
    }).length,
    promotedTeams: currentTeams
      .filter((team) => !previousTeamIds.has(team.teamId))
      .map((team) => team.name)
      .sort(),
    relegatedTeams: previousTeams
      .filter((team) => !currentTeamIds.has(team.teamId))
      .map((team) => team.name)
      .sort(),
    missingOptaIds,
    identityConflicts: [...new Set(identityConflicts)],
  };
}

async function assertRolloverReadiness(
  context: SyncContext,
  bootstrap: FPLBootstrapData,
  season: SeasonContext,
  report: RolloverReport,
): Promise<void> {
  const [teams, players, matches] = await Promise.all([
    context.prisma.seasonTeam.count({
      where: { seasonId: season.id, active: true },
    }),
    context.prisma.seasonPlayer.count({
      where: { seasonId: season.id, active: true },
    }),
    context.prisma.match.count({ where: { seasonId: season.id } }),
  ]);
  const errors = [
    ...(teams === 20 ? [] : [`season has ${teams} active teams, expected 20`]),
    ...(players === bootstrap.elements.length
      ? []
      : [
          `season has ${players} active registrations, expected ${bootstrap.elements.length}`,
        ]),
    ...(matches === 380
      ? []
      : [`season has ${matches} fixtures, expected 380`]),
    ...report.identityConflicts,
  ];
  if (errors.length > 0) {
    throw new Error(`Rollover readiness failed: ${errors.join("; ")}`);
  }
}

async function activateSeason(
  context: SyncContext,
  season: SeasonContext,
): Promise<void> {
  await context.prisma.$transaction(async (tx) => {
    await tx.season.updateMany({
      where: { isCurrent: true, id: { not: season.id } },
      data: { isCurrent: false, status: "COMPLETE", endedAt: context.now },
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "teams" t
      SET "fplId" = st."fplId",
          "name" = st."name",
          "shortName" = st."shortName",
          "updatedAt" = ${context.now},
          "lastSyncedAt" = ${context.now}
      FROM "season_teams" st
      WHERE st."seasonId" = ${season.id} AND st."teamId" = t."id" AND st."active" = TRUE
    `);
    await tx.player.updateMany({ data: { active: false } });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "players" p
      SET "fplId" = sp."fplId",
          "position" = sp."position",
          "teamId" = st."teamId",
          "nowCost" = sp."nowCost",
          "selectedBy" = sp."selectedBy",
          "totalPoints" = sp."totalPoints",
          "pointsPerGame" = sp."pointsPerGame",
          "form" = sp."form",
          "status" = sp."status",
          "news" = sp."news",
          "newsAdded" = sp."newsAdded",
          "chanceOfPlaying" = sp."chanceOfPlaying",
          "season" = ${season.code},
          "active" = sp."active",
          "lastSeenAt" = sp."lastSeenAt",
          "updatedAt" = ${context.now},
          "lastSyncedAt" = ${context.now}
      FROM "season_players" sp
      JOIN "season_teams" st ON st."id" = sp."seasonTeamId"
      WHERE sp."seasonId" = ${season.id} AND sp."playerId" = p."id"
    `);
    await tx.season.update({
      where: { id: season.id },
      data: {
        isCurrent: true,
        status: "ACTIVE",
        startedAt: context.now,
        endedAt: null,
      },
    });
  });
}

async function syncEventStats(
  context: SyncContext,
  season: SeasonContext,
  events: number[],
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }
  const { prisma, collector } = context;
  const fixtureMaps = await buildFixtureMaps(prisma, season.id);
  let upserted = 0;
  for (const eventId of events) {
    try {
      const live = await collector.getEventLive(eventId);
      const rows = buildEventStatRows(
        live,
        eventId,
        fixtureMaps.playerIdByFplId,
        fixtureMaps.seasonPlayerIdByFplId,
        fixtureMaps.matchIdByFplId,
      );
      const finishedMatches = await prisma.match.count({
        where: { seasonId: season.id, gameweek: eventId, finished: true },
      });
      validateEventCoverage(eventId, rows.length, finishedMatches);
      await persistEventStatRows(prisma, season.id, rows);
      upserted += rows.length;
    } catch (error) {
      const message =
        error instanceof FPLCollectorError ? error.message : String(error);
      throw new Error(`FPL event ${eventId} sync failed: ${message}`, {
        cause: error,
      });
    }
  }
  return upserted;
}

async function persistEventStatRows(
  prisma: PrismaClient,
  seasonId: number,
  rows: EventStatRow[],
): Promise<void> {
  const batchSize = 250;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const now = new Date();
    const values = batch.map(
      (row) => Prisma.sql`(
        ${seasonId}, ${row.seasonPlayerId}, ${row.playerId}, ${row.matchId}, ${row.gameweek}, ${row.minutes}, ${row.goals},
        ${row.assists}, ${row.cleanSheets}, ${row.goalsConceded}, ${row.ownGoals},
        ${row.penaltiesSaved}, ${row.penaltiesMissed}, ${row.yellowCards}, ${row.redCards},
        ${row.saves}, ${row.bonus}, ${row.bps}, ${row.totalPoints}, ${row.influence},
        ${row.creativity}, ${row.threat}, ${row.ictIndex}, ${now}, ${now}
      )`,
    );
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "fpl_player_stats" (
        "seasonId", "seasonPlayerId", "playerId", "matchId", "gameweek", "minutes", "goals", "assists",
        "cleanSheets", "goalsConceded", "ownGoals", "penaltiesSaved", "penaltiesMissed",
        "yellowCards", "redCards", "saves", "bonus", "bps", "totalPoints",
        "influence", "creativity", "threat", "ictIndex", "createdAt", "updatedAt"
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT ("seasonPlayerId", "matchId") DO UPDATE SET
        "gameweek" = EXCLUDED."gameweek",
        "minutes" = EXCLUDED."minutes",
        "goals" = EXCLUDED."goals",
        "assists" = EXCLUDED."assists",
        "cleanSheets" = EXCLUDED."cleanSheets",
        "goalsConceded" = EXCLUDED."goalsConceded",
        "ownGoals" = EXCLUDED."ownGoals",
        "penaltiesSaved" = EXCLUDED."penaltiesSaved",
        "penaltiesMissed" = EXCLUDED."penaltiesMissed",
        "yellowCards" = EXCLUDED."yellowCards",
        "redCards" = EXCLUDED."redCards",
        "saves" = EXCLUDED."saves",
        "bonus" = EXCLUDED."bonus",
        "bps" = EXCLUDED."bps",
        "totalPoints" = EXCLUDED."totalPoints",
        "influence" = EXCLUDED."influence",
        "creativity" = EXCLUDED."creativity",
        "threat" = EXCLUDED."threat",
        "ictIndex" = EXCLUDED."ictIndex",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
  }
}

async function buildFixtureMaps(
  prisma: PrismaClient,
  seasonId: number,
): Promise<FixtureMaps> {
  const [players, matches] = await Promise.all([
    prisma.seasonPlayer.findMany({
      where: { seasonId, active: true },
      select: { id: true, playerId: true, fplId: true },
    }),
    prisma.match.findMany({
      where: { seasonId },
      select: { id: true, fplId: true },
    }),
  ]);
  const playerIdByFplId = new Map<number, number>();
  const seasonPlayerIdByFplId = new Map<number, number>();
  players.forEach((player) => {
    playerIdByFplId.set(player.fplId, player.playerId);
    seasonPlayerIdByFplId.set(player.fplId, player.id);
  });
  const matchIdByFplId = new Map<number, number>();
  matches.forEach((match) => matchIdByFplId.set(match.fplId, match.id));
  return { playerIdByFplId, seasonPlayerIdByFplId, matchIdByFplId };
}

export type { FixtureStatSnapshot };
