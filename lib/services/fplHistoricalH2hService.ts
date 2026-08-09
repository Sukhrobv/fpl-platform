import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseCsv } from "@/lib/collectors/preseasonMinutesTrackerCollector";

export const FPL_HISTORICAL_H2H_SOURCE = "fpl_historical_mirror";
export const FPL_HISTORICAL_H2H_DATASET = "player-fixture-xgxa";
const MIRROR_BASE_URL =
  "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data";

interface MirrorRow {
  element: number;
  fixture: number;
  minutes: number;
  goals: number;
  assists: number;
  expectedGoals: number;
  expectedAssists: number;
  opponentTeam: number;
  wasHome: boolean;
}

function asInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${label}: '${value}'`);
  }
  return parsed;
}

function asNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: '${value}'`);
  }
  return parsed;
}

function mirrorSeasonPath(code: string) {
  const [start, end] = code.split("/");
  if (!start || !end) throw new Error(`Invalid season code ${code}`);
  return `${start}-${end}`;
}

function parseMirrorGameweek(csv: string): MirrorRow[] {
  const rows = parseCsv(csv);
  const header = rows[0]?.map((value) => value.trim());
  if (!header) throw new Error("Historical FPL CSV has no header");
  const index = (name: string) => {
    const result = header.indexOf(name);
    if (result < 0) throw new Error(`Historical FPL CSV has no ${name} column`);
    return result;
  };
  const elementIndex = index("element");
  const fixtureIndex = index("fixture");
  const minutesIndex = index("minutes");
  const goalsIndex = index("goals_scored");
  const assistsIndex = index("assists");
  const expectedGoalsIndex = index("expected_goals");
  const expectedAssistsIndex = index("expected_assists");
  const opponentIndex = index("opponent_team");
  const homeIndex = index("was_home");

  return rows.slice(1).map((row) => ({
    element: asInteger(row[elementIndex] ?? "", "element"),
    fixture: asInteger(row[fixtureIndex] ?? "", "fixture"),
    minutes: asInteger(row[minutesIndex] ?? "", "minutes"),
    goals: asInteger(row[goalsIndex] ?? "", "goals_scored"),
    assists: asInteger(row[assistsIndex] ?? "", "assists"),
    expectedGoals: asNumber(row[expectedGoalsIndex] ?? "", "expected_goals"),
    expectedAssists: asNumber(
      row[expectedAssistsIndex] ?? "",
      "expected_assists",
    ),
    opponentTeam: asInteger(row[opponentIndex] ?? "", "opponent_team"),
    wasHome: (row[homeIndex] ?? "").trim().toLowerCase() === "true",
  }));
}

export class FplHistoricalH2hService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sync(input: { sourceSeasonCode: string }) {
    const season = await this.prisma.season.findUnique({
      where: { code: input.sourceSeasonCode },
      select: { id: true, code: true },
    });
    if (!season) throw new Error(`Season ${input.sourceSeasonCode} not found`);

    const gameweeks = await Promise.all(
      Array.from({ length: 38 }, async (_, index) => {
        const gameweek = index + 1;
        const url = `${MIRROR_BASE_URL}/${mirrorSeasonPath(season.code)}/gws/gw${gameweek}.csv`;
        const response = await this.fetchImpl(url, {
          headers: { "User-Agent": "FPL Platform historical H2H sync" },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          throw new Error(
            `Could not fetch historical FPL GW${gameweek}: HTTP ${response.status}`,
          );
        }
        const csv = await response.text();
        return {
          gameweek,
          url,
          checksum: createHash("sha256").update(csv).digest("hex"),
          rows: parseMirrorGameweek(csv),
        };
      }),
    );

    const [players, teams, matches, officialStats] = await Promise.all([
      this.prisma.seasonPlayer.findMany({
        where: { seasonId: season.id },
        select: { fplId: true, playerId: true },
      }),
      this.prisma.seasonTeam.findMany({
        where: { seasonId: season.id },
        select: { fplId: true, teamId: true },
      }),
      this.prisma.match.findMany({
        where: { seasonId: season.id },
        select: { id: true, fplId: true, kickoffTime: true },
      }),
      this.prisma.fPLPlayerStats.findMany({
        where: { seasonId: season.id, minutes: { gt: 0 } },
        select: { playerId: true, matchId: true, minutes: true },
      }),
    ]);
    const playerByFplId = new Map(
      players.map((player) => [player.fplId, player]),
    );
    const teamIdByFplId = new Map(
      teams.map((team) => [team.fplId, team.teamId]),
    );
    const matchByFplId = new Map(matches.map((match) => [match.fplId, match]));
    const officialMinutes = new Map(
      officialStats.map((stat) => [
        `${stat.playerId}:${stat.matchId}`,
        stat.minutes,
      ]),
    );

    const validation = {
      totalPlayedRows: 0,
      unresolved: 0,
      minuteMismatch: 0,
      duplicateRows: 0,
    };
    const recordsByKey = new Map<
      string,
      Prisma.ExternalPlayerMatchStatsCreateManyInput
    >();
    for (const { rows } of gameweeks) {
      for (const row of rows) {
        if (row.minutes <= 0) continue;
        validation.totalPlayedRows += 1;
        const player = playerByFplId.get(row.element);
        const match = matchByFplId.get(row.fixture);
        const opponentTeamId = teamIdByFplId.get(row.opponentTeam);
        if (!player || !match || !opponentTeamId) {
          validation.unresolved += 1;
          continue;
        }
        if (
          officialMinutes.get(`${player.playerId}:${match.id}`) !== row.minutes
        ) {
          validation.minuteMismatch += 1;
          continue;
        }
        const record: Prisma.ExternalPlayerMatchStatsCreateManyInput = {
          seasonId: season.id,
          playerId: player.playerId,
          source: FPL_HISTORICAL_H2H_SOURCE,
          sourceMatchId: String(row.fixture),
          matchDate: match.kickoffTime,
          opponentTeamId,
          wasHome: row.wasHome,
          minutes: row.minutes,
          goals: row.goals,
          assists: row.assists,
          xG: row.expectedGoals,
          xA: row.expectedAssists,
          rawData: row as unknown as Prisma.InputJsonValue,
        };
        const key = `${record.playerId}:${record.sourceMatchId}`;
        const existing = recordsByKey.get(key);
        if (existing) {
          validation.duplicateRows += 1;
          if (
            existing.minutes !== record.minutes ||
            existing.goals !== record.goals ||
            existing.assists !== record.assists ||
            existing.xG !== record.xG ||
            existing.xA !== record.xA ||
            existing.opponentTeamId !== record.opponentTeamId ||
            existing.wasHome !== record.wasHome
          ) {
            throw new Error(
              `Conflicting duplicate historical FPL row for ${key}`,
            );
          }
          continue;
        }
        recordsByKey.set(key, record);
      }
    }
    if (validation.unresolved > 0 || validation.minuteMismatch > 0) {
      throw new Error(
        `Historical FPL validation failed: ${validation.unresolved} unresolved rows, ${validation.minuteMismatch} minute mismatches`,
      );
    }
    const records = [...recordsByKey.values()];
    if (records.length === 0) {
      throw new Error(
        "Historical FPL validation produced no played player rows",
      );
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.externalPlayerMatchStats.deleteMany({
        where: {
          seasonId: season.id,
          source: FPL_HISTORICAL_H2H_SOURCE,
        },
      });
      return transaction.externalPlayerMatchStats.createMany({ data: records });
    });
    const payload = {
      schemaVersion: 1,
      sourceSeason: season.code,
      sourceUrls: gameweeks.map(({ gameweek, url, checksum }) => ({
        gameweek,
        url,
        checksum,
      })),
      validation,
      validatedRows: records.length,
      insertedRows: result.count,
    };
    const snapshot = await this.prisma.sourceSnapshot.create({
      data: {
        seasonId: season.id,
        source: FPL_HISTORICAL_H2H_SOURCE,
        dataset: FPL_HISTORICAL_H2H_DATASET,
        season: season.code,
        sourceSeasonId: season.code,
        batchId: randomUUID(),
        schemaVersion: 1,
        fetchedAt: new Date(),
        checksum: createHash("sha256")
          .update(JSON.stringify(payload))
          .digest("hex"),
        valid: true,
        recordCount: records.length,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return { snapshotId: snapshot.id, ...payload };
  }
}
