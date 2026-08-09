import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  PRESEASON_MINUTES_TRACKER_DATASET,
  PRESEASON_MINUTES_TRACKER_SOURCE,
  PreseasonMinutesTrackerCollector,
  preseasonMinutesTrackerCollectionSchema,
  type PreseasonMinutesTrackerPlayer,
} from "@/lib/collectors/preseasonMinutesTrackerCollector";
import { normalizeName } from "@/lib/services/playerMapper";

export {
  PRESEASON_MINUTES_TRACKER_DATASET,
  PRESEASON_MINUTES_TRACKER_SOURCE,
} from "@/lib/collectors/preseasonMinutesTrackerCollector";

const TRACKER_TEAM_NAMES: Record<string, string[]> = {
  ARS: ["Arsenal"],
  AVL: ["Aston Villa"],
  BOU: ["Bournemouth"],
  BRE: ["Brentford"],
  BHA: ["Brighton", "Brighton and Hove Albion"],
  CHE: ["Chelsea"],
  COV: ["Coventry", "Coventry City"],
  CRY: ["Crystal Palace"],
  EVE: ["Everton"],
  FUL: ["Fulham"],
  HUL: ["Hull", "Hull City"],
  IPS: ["Ipswich", "Ipswich Town"],
  LEE: ["Leeds", "Leeds United"],
  LIV: ["Liverpool"],
  MCI: ["Man City", "Manchester City"],
  MUN: ["Man Utd", "Manchester United"],
  NEW: ["Newcastle", "Newcastle United"],
  NFO: ["Nott'm Forest", "Nottingham Forest"],
  SUN: ["Sunderland"],
  TOT: ["Spurs", "Tottenham", "Tottenham Hotspur"],
};

const trackerMappingSchema = z.object({
  seasonPlayerId: z.number().int().positive(),
  teamCode: z.string().regex(/^[A-Z]{3}$/),
  playerName: z.string().min(1),
  totalMinutes: z.number().int().nonnegative(),
  possibleMinutes: z.number().int().positive(),
  matchMinutes: z.array(z.number().int().min(0).max(90)).min(1),
  participationRate: z.number().min(0).max(1),
  expectedMinutesCap: z.number().int().min(0).max(90),
});

const trackerUnmatchedSchema = z.object({
  teamCode: z.string().regex(/^[A-Z]{3}$/),
  playerName: z.string().min(1),
  reason: z.enum(["TEAM_NOT_FOUND", "PLAYER_NOT_FOUND", "AMBIGUOUS_PLAYER"]),
});

export const preseasonMinutesTrackerSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  targetSeason: z.string().regex(/^\d{4}\/\d{2}$/),
  sourceUrl: z.string().url(),
  tracker: preseasonMinutesTrackerCollectionSchema,
  mappings: z.array(trackerMappingSchema),
  unmatched: z.array(trackerUnmatchedSchema),
  coverage: z.object({
    teams: z.number().int().nonnegative(),
    rows: z.number().int().nonnegative(),
    mappedPlayers: z.number().int().nonnegative(),
    unmatchedPlayers: z.number().int().nonnegative(),
  }),
});

export type PreseasonMinutesTrackerEvidence = z.infer<
  typeof trackerMappingSchema
> & {
  sourceUrl: string;
  fetchedAt: Date;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function derivePreseasonMinutesCap(
  player: PreseasonMinutesTrackerPlayer,
): number | null {
  // A player absent from every friendly may be on international duty or simply
  // omitted from the tracker. That is not enough evidence to forecast zero
  // league minutes.
  if (
    player.totalMinutes === 0 ||
    !player.matchMinutes.some((minutes) => minutes > 0)
  ) {
    return null;
  }
  const recent = player.matchMinutes.slice(-2);
  if (recent.length === 0) return null;
  const latest = recent.at(-1) ?? 0;
  const previous = recent.at(-2);
  const recentMinutes =
    previous == null ? latest : latest * 0.7 + previous * 0.3;
  const averageMinutes =
    player.totalMinutes / Math.max(player.matchMinutes.length, 1);

  // Friendlies are noisy, so preserve the recent signal but leave a modest
  // buffer instead of treating a weighted friendly average as a hard maximum.
  return Math.min(
    90,
    Math.round(recentMinutes * 0.7 + averageMinutes * 0.3 + 20),
  );
}

function playerNames(player: {
  webName: string;
  firstName: string;
  secondName: string;
}): Set<string> {
  return new Set([
    normalizeName(player.webName),
    normalizeName(`${player.firstName} ${player.secondName}`),
  ]);
}

export function resolveTrackerTeam(
  teamCode: string,
  teams: Array<{ id: number; name: string; shortName: string }>,
) {
  const aliases = new Set(
    (TRACKER_TEAM_NAMES[teamCode] ?? []).map(normalizeName),
  );
  const matches = teams.filter(
    (team) =>
      aliases.has(normalizeName(team.name)) ||
      aliases.has(normalizeName(team.shortName)),
  );
  return matches.length === 1 ? matches[0] : null;
}

export class PreseasonMinutesTrackerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly collector = new PreseasonMinutesTrackerCollector(),
  ) {}

  async sync(input: { targetSeasonCode: string }) {
    const targetSeason = await this.prisma.season.findUnique({
      where: { code: input.targetSeasonCode },
      select: { id: true, code: true, status: true, isCurrent: true },
    });
    if (!targetSeason)
      throw new Error(`Season ${input.targetSeasonCode} not found`);
    if (targetSeason.status !== "UPCOMING" || targetSeason.isCurrent) {
      throw new Error(
        "Pre-season tracker sync requires an UPCOMING, non-current season",
      );
    }
    const [tracker, teams, registrations] = await Promise.all([
      this.collector.collect(),
      this.prisma.seasonTeam.findMany({
        where: { seasonId: targetSeason.id, active: true },
        select: { id: true, name: true, shortName: true },
      }),
      this.prisma.seasonPlayer.findMany({
        where: { seasonId: targetSeason.id, active: true },
        select: {
          id: true,
          seasonTeamId: true,
          player: {
            select: { webName: true, firstName: true, secondName: true },
          },
        },
      }),
    ]);
    const mappings: z.infer<typeof trackerMappingSchema>[] = [];
    const unmatched: z.infer<typeof trackerUnmatchedSchema>[] = [];
    for (const trackerTeam of tracker.teams) {
      const team = resolveTrackerTeam(trackerTeam.teamCode, teams);
      for (const row of trackerTeam.players) {
        if (!team) {
          unmatched.push({
            teamCode: trackerTeam.teamCode,
            playerName: row.playerName,
            reason: "TEAM_NOT_FOUND",
          });
          continue;
        }
        const normalizedRowName = normalizeName(row.playerName);
        const candidates = registrations.filter(
          (registration) =>
            registration.seasonTeamId === team.id &&
            playerNames(registration.player).has(normalizedRowName),
        );
        if (candidates.length !== 1) {
          unmatched.push({
            teamCode: trackerTeam.teamCode,
            playerName: row.playerName,
            reason:
              candidates.length === 0 ? "PLAYER_NOT_FOUND" : "AMBIGUOUS_PLAYER",
          });
          continue;
        }
        const expectedMinutesCap = derivePreseasonMinutesCap(row);
        if (expectedMinutesCap == null) continue;
        mappings.push({
          seasonPlayerId: candidates[0].id,
          teamCode: trackerTeam.teamCode,
          playerName: row.playerName,
          totalMinutes: row.totalMinutes,
          possibleMinutes: row.possibleMinutes,
          matchMinutes: row.matchMinutes,
          participationRate: row.participationRate,
          expectedMinutesCap,
        });
      }
    }
    const payload = preseasonMinutesTrackerSnapshotSchema.parse({
      schemaVersion: 1,
      targetSeason: targetSeason.code,
      sourceUrl: tracker.sourceUrl,
      tracker,
      mappings: mappings.sort(
        (left, right) => left.seasonPlayerId - right.seasonPlayerId,
      ),
      unmatched,
      coverage: {
        teams: tracker.teams.length,
        rows: tracker.teams.reduce((sum, team) => sum + team.players.length, 0),
        mappedPlayers: mappings.length,
        unmatchedPlayers: unmatched.length,
      },
    });
    const snapshot = await this.prisma.sourceSnapshot.create({
      data: {
        seasonId: targetSeason.id,
        source: PRESEASON_MINUTES_TRACKER_SOURCE,
        dataset: PRESEASON_MINUTES_TRACKER_DATASET,
        season: targetSeason.code,
        sourceSeasonId: targetSeason.code,
        gameweek: null,
        batchId: randomUUID(),
        schemaVersion: 1,
        fetchedAt: new Date(),
        checksum: createHash("sha256")
          .update(stableStringify(payload))
          .digest("hex"),
        valid: true,
        error: null,
        recordCount: payload.coverage.rows,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      snapshotId: snapshot.id,
      targetSeason: targetSeason.code,
      ...payload.coverage,
    };
  }
}

export function trackerEvidenceFromSnapshot(input: {
  payload: unknown;
  fetchedAt: Date;
  sourceUrl: string;
  targetSeasonCode: string;
  now?: Date;
}) {
  const snapshot = preseasonMinutesTrackerSnapshotSchema.parse(input.payload);
  const now = input.now ?? new Date();
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  if (
    snapshot.targetSeason !== input.targetSeasonCode ||
    now.getTime() - input.fetchedAt.getTime() > maxAgeMs
  ) {
    return new Map<number, PreseasonMinutesTrackerEvidence>();
  }
  return new Map(
    snapshot.mappings.map((mapping) => [
      mapping.seasonPlayerId,
      { ...mapping, sourceUrl: input.sourceUrl, fetchedAt: input.fetchedAt },
    ]),
  );
}
