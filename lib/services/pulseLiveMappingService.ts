import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { PULSELIVE_METRICS } from "@/lib/collectors/pulseLiveCollector";

const SOURCE = "pulselive";
const ROLLOUT_THRESHOLD = 0.99;

const snapshotPayloadSchema = z.object({
  content: z.array(
    z.object({
      owner: z
        .object({
          id: z.number(),
          name: z.object({ display: z.string() }).passthrough(),
          altIds: z
            .object({ opta: z.string().optional() })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    }),
  ),
});

export interface PulseLiveIdentity {
  sourcePlayerId: number;
  optaId?: string;
  name: string;
}

export interface FplIdentity {
  playerId: number;
  fplId: number;
  code: number;
  name: string;
  played: boolean;
}

export interface ExactOptaMatch {
  sourcePlayerId: number;
  optaId: string;
  sourceName: string;
  playerId: number;
  fplId: number;
  fplName: string;
  fplPlayed: boolean;
}

export interface PulseLiveMappingReport {
  sourcePlayers: number;
  fplRosterPlayers: number;
  fplPlayedPlayers: number;
  exactMatches: ExactOptaMatch[];
  unmatchedSource: PulseLiveIdentity[];
  unmatchedFpl: FplIdentity[];
  conflicts: string[];
  sourceCoverage: number;
  fplPlayedMappingCoverage: number;
  rosterCoverage: number;
  mappedSourceWithoutFplHistory: ExactOptaMatch[];
  eligibleForRollout: boolean;
}

export interface PulseLiveMappingRun extends PulseLiveMappingReport {
  batchId: string;
  season: string;
  gameweek: number;
  mappingsWritten: number;
}

interface Dependencies {
  prisma: PrismaClient;
  now?: () => Date;
}

function canonicalOptaId(value?: string): string | null {
  const match = value?.trim().match(/^p?(\d+)$/i);
  return match ? `p${Number(match[1])}` : null;
}

export function buildExactOptaMappingReport(
  sourceRows: PulseLiveIdentity[],
  fplPlayers: FplIdentity[],
): PulseLiveMappingReport {
  const conflicts: string[] = [];
  const sourceByPlayerId = new Map<number, PulseLiveIdentity>();
  for (const source of sourceRows) {
    const previous = sourceByPlayerId.get(source.sourcePlayerId);
    const previousOpta = canonicalOptaId(previous?.optaId);
    const currentOpta = canonicalOptaId(source.optaId);
    if (previous && previousOpta !== currentOpta) {
      conflicts.push(
        `PulseLive player ${source.sourcePlayerId} has conflicting Opta IDs '${previous.optaId ?? "missing"}' and '${source.optaId ?? "missing"}'`,
      );
      continue;
    }
    if (!previous) sourceByPlayerId.set(source.sourcePlayerId, source);
  }

  const sourceByOpta = new Map<string, PulseLiveIdentity[]>();
  const invalidSource: PulseLiveIdentity[] = [];
  for (const source of sourceByPlayerId.values()) {
    const optaId = canonicalOptaId(source.optaId);
    if (!optaId) {
      invalidSource.push(source);
      continue;
    }
    const entries = sourceByOpta.get(optaId) ?? [];
    entries.push({ ...source, optaId });
    sourceByOpta.set(optaId, entries);
  }

  const conflictedOptaIds = new Set<string>();
  for (const [optaId, sources] of sourceByOpta) {
    if (sources.length > 1) {
      conflictedOptaIds.add(optaId);
      conflicts.push(
        `Opta ID '${optaId}' belongs to multiple PulseLive players: ${sources.map((source) => source.sourcePlayerId).join(", ")}`,
      );
    }
  }

  const fplByCode = new Map(fplPlayers.map((player) => [player.code, player]));
  const exactMatches: ExactOptaMatch[] = [];
  const unmatchedSource = [...invalidSource];
  for (const [optaId, sources] of sourceByOpta) {
    if (conflictedOptaIds.has(optaId)) continue;
    const source = sources[0];
    const fpl = fplByCode.get(Number(optaId.slice(1)));
    if (!fpl) {
      unmatchedSource.push(source);
      continue;
    }
    exactMatches.push({
      sourcePlayerId: source.sourcePlayerId,
      optaId,
      sourceName: source.name,
      playerId: fpl.playerId,
      fplId: fpl.fplId,
      fplName: fpl.name,
      fplPlayed: fpl.played,
    });
  }

  const matchedPlayerIds = new Set(exactMatches.map((match) => match.playerId));
  const unmatchedFpl = fplPlayers.filter(
    (player) => !matchedPlayerIds.has(player.playerId),
  );
  const playedPlayers = fplPlayers.filter((player) => player.played);
  const mappedPlayed = playedPlayers.filter((player) =>
    matchedPlayerIds.has(player.playerId),
  ).length;
  const fplPlayedMappingCoverage =
    playedPlayers.length === 0 ? 0 : mappedPlayed / playedPlayers.length;
  const sourceCoverage =
    sourceByPlayerId.size === 0
      ? 0
      : exactMatches.length / sourceByPlayerId.size;
  const rosterCoverage =
    fplPlayers.length === 0 ? 0 : exactMatches.length / fplPlayers.length;
  const mappedSourceWithoutFplHistory = exactMatches.filter(
    (match) => !match.fplPlayed,
  );

  return {
    sourcePlayers: sourceByPlayerId.size,
    fplRosterPlayers: fplPlayers.length,
    fplPlayedPlayers: playedPlayers.length,
    exactMatches,
    unmatchedSource,
    unmatchedFpl,
    conflicts,
    sourceCoverage,
    fplPlayedMappingCoverage,
    rosterCoverage,
    mappedSourceWithoutFplHistory,
    eligibleForRollout:
      conflicts.length === 0 && sourceCoverage >= ROLLOUT_THRESHOLD,
  };
}

export class PulseLiveMappingService {
  private readonly prisma: PrismaClient;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies) {
    this.prisma = dependencies.prisma;
    this.now = dependencies.now ?? (() => new Date());
  }

  async mapLatestSeason(season: string): Promise<PulseLiveMappingRun> {
    const snapshots = await this.prisma.sourceSnapshot.findMany({
      where: {
        source: SOURCE,
        season,
        valid: true,
        dataset: { in: PULSELIVE_METRICS.map((metric) => `stat:${metric}`) },
      },
      orderBy: [{ fetchedAt: "desc" }],
    });
    const latestBatch = this.findLatestCompleteBatch(snapshots);
    if (!latestBatch)
      throw new Error(`No complete valid PulseLive batch found for ${season}`);
    const gameweek = latestBatch[0].gameweek;
    if (gameweek == null)
      throw new Error(
        `PulseLive batch '${latestBatch[0].batchId}' has no gameweek`,
      );

    const sourceRows = latestBatch.flatMap((snapshot) =>
      snapshotPayloadSchema
        .parse(snapshot.payload)
        .content.map(({ owner }) => ({
          sourcePlayerId: owner.id,
          optaId: owner.altIds?.opta,
          name: owner.name.display,
        })),
    );
    const players = await this.prisma.player.findMany({
      select: {
        id: true,
        fplId: true,
        code: true,
        webName: true,
        fplStats: {
          where: { minutes: { gt: 0 } },
          select: { id: true },
          take: 1,
        },
      },
    });
    const report = buildExactOptaMappingReport(
      sourceRows,
      players.map((player) => ({
        playerId: player.id,
        fplId: player.fplId,
        code: player.code,
        name: player.webName,
        played: player.fplStats.length > 0,
      })),
    );
    if (report.conflicts.length > 0) {
      throw new Error(
        `PulseLive identity conflicts: ${report.conflicts.join("; ")}`,
      );
    }

    const existing = await this.prisma.playerMapping.findMany({
      where: {
        source: SOURCE,
        playerId: { in: report.exactMatches.map((match) => match.playerId) },
      },
    });
    const existingByPlayer = new Map(
      existing.map((mapping) => [mapping.playerId, mapping]),
    );
    for (const match of report.exactMatches) {
      const mapping = existingByPlayer.get(match.playerId);
      if (mapping?.method === "MANUAL" && mapping.externalId !== match.optaId) {
        throw new Error(
          `Manual PulseLive mapping for FPL player ${match.fplId} conflicts with exact Opta ID '${match.optaId}'`,
        );
      }
    }

    const mappedAt = this.now();
    const writableMatches = report.exactMatches.filter(
      (match) => existingByPlayer.get(match.playerId)?.method !== "MANUAL",
    );
    await this.prisma.$transaction(
      writableMatches.map((match) =>
        this.prisma.playerMapping.upsert({
          where: {
            playerId_source: { playerId: match.playerId, source: SOURCE },
          },
          create: {
            playerId: match.playerId,
            source: SOURCE,
            externalId: match.optaId,
            method: "EXACT_MATCH",
            status: "CONFIRMED",
            confidence: 1,
            mappedBy: "pulselive-opta",
            mappedAt,
            verifiedAt: mappedAt,
            notes: `Exact Opta code from batch ${latestBatch[0].batchId}, GW${gameweek}`,
          },
          update: {
            externalId: match.optaId,
            method: "EXACT_MATCH",
            status: "CONFIRMED",
            confidence: 1,
            mappedBy: "pulselive-opta",
            mappedAt,
            verifiedAt: mappedAt,
            notes: `Exact Opta code from batch ${latestBatch[0].batchId}, GW${gameweek}`,
          },
        }),
      ),
    );

    return {
      ...report,
      batchId: latestBatch[0].batchId,
      season,
      gameweek,
      mappingsWritten: writableMatches.length,
    };
  }

  private findLatestCompleteBatch<
    T extends { batchId: string; dataset: string },
  >(snapshots: T[]): T[] | null {
    const batches = new Map<string, T[]>();
    for (const snapshot of snapshots) {
      const batch = batches.get(snapshot.batchId) ?? [];
      batch.push(snapshot);
      batches.set(snapshot.batchId, batch);
    }
    const required = new Set(
      PULSELIVE_METRICS.map((metric) => `stat:${metric}`),
    );
    for (const batch of batches.values()) {
      if (
        required.size ===
        new Set(batch.map((snapshot) => snapshot.dataset)).size
      )
        return batch;
    }
    return null;
  }
}
