import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type SourceSnapshot } from "@prisma/client";
import {
  PULSELIVE_METRICS,
  PulseLiveCollector,
  type PulseLiveMetric,
  type PulseLivePlayerStats,
} from "@/lib/collectors/pulseLiveCollector";

const SUPPLEMENT_METRICS = [
  "touches",
  "total_att_assist",
  "carries",
] as const satisfies readonly PulseLiveMetric[];

type SupplementMetric = (typeof SUPPLEMENT_METRICS)[number];

interface Dependencies {
  prisma: PrismaClient;
  collector?: PulseLiveCollector;
  now?: () => Date;
}

export interface ConfirmedPlayerTotals {
  optaId: string;
  pulsePlayerId: number;
  minutes: number;
  values: Record<SupplementMetric, number>;
  absentAsZero: SupplementMetric[];
}

export function extractConfirmedPlayerTotals(
  response: PulseLivePlayerStats,
): ConfirmedPlayerTotals | null {
  const optaId = response.entity.altIds?.opta?.toLowerCase();
  if (!optaId) return null;
  const byName = new Map(response.stats.map((stat) => [stat.name, stat.value]));
  const minutes = byName.get("mins_played") ?? 0;
  if (minutes <= 0) return null;
  const absentAsZero: SupplementMetric[] = [];
  const values = Object.fromEntries(
    SUPPLEMENT_METRICS.map((metric) => {
      const value = byName.get(metric);
      if (value == null) absentAsZero.push(metric);
      return [metric, value ?? 0];
    }),
  ) as Record<SupplementMetric, number>;
  return {
    optaId,
    pulsePlayerId: response.entity.id,
    minutes,
    values,
    absentAsZero,
  };
}

function snapshotRows(snapshot: SourceSnapshot): Array<{
  owner?: { id?: number; altIds?: { opta?: string } };
}> {
  const payload = snapshot.payload as { content?: unknown };
  return Array.isArray(payload.content)
    ? (payload.content as Array<{
        owner?: { id?: number; altIds?: { opta?: string } };
      }>)
    : [];
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class PulseLivePlayerSupplementService {
  private readonly collector: PulseLiveCollector;
  private readonly now: () => Date;

  constructor(private readonly dependencies: Dependencies) {
    this.collector =
      dependencies.collector ??
      new PulseLiveCollector({ pageSize: 100, minRequestIntervalMs: 750 });
    this.now = dependencies.now ?? (() => new Date());
  }

  async collect(seasonCode: string, gameweek: number) {
    const season = await this.dependencies.prisma.season.findUnique({
      where: { code: seasonCode },
    });
    if (!season) throw new Error(`Season ${seasonCode} not found`);
    const rankedSnapshots =
      await this.dependencies.prisma.sourceSnapshot.findMany({
        where: {
          seasonId: season.id,
          source: "pulselive",
          valid: true,
          gameweek,
          dataset: { in: PULSELIVE_METRICS.map((metric) => `stat:${metric}`) },
        },
        orderBy: { fetchedAt: "desc" },
      });
    const batchId = rankedSnapshots[0]?.batchId;
    if (!batchId) throw new Error("No valid PulseLive ranked batch found");
    const batch = rankedSnapshots.filter(
      (snapshot) => snapshot.batchId === batchId,
    );
    if (batch.length !== PULSELIVE_METRICS.length) {
      throw new Error(`PulseLive ranked batch ${batchId} is incomplete`);
    }
    const sourceSeasonId = Number(batch[0].sourceSeasonId);
    if (!Number.isInteger(sourceSeasonId)) {
      throw new Error(
        `Invalid PulseLive source season '${batch[0].sourceSeasonId}'`,
      );
    }
    const rankedCoverage = new Map<SupplementMetric, Set<string>>();
    for (const metric of SUPPLEMENT_METRICS) {
      const snapshot = batch.find(
        (candidate) => candidate.dataset === `stat:${metric}`,
      )!;
      rankedCoverage.set(
        metric,
        new Set(
          snapshotRows(snapshot)
            .map((row) => row.owner?.altIds?.opta?.toLowerCase())
            .filter((value): value is string => Boolean(value)),
        ),
      );
    }
    const registrations = await this.dependencies.prisma.seasonPlayer.findMany({
      where: {
        seasonId: season.id,
        position: { not: "GOALKEEPER" },
        fplStats: { some: { minutes: { gt: 0 } } },
      },
      include: { player: { select: { code: true, webName: true } } },
    });
    const missing = registrations.filter((registration) => {
      const optaId = `p${registration.player.code}`.toLowerCase();
      return SUPPLEMENT_METRICS.some(
        (metric) => !rankedCoverage.get(metric)!.has(optaId),
      );
    });
    const playerByOpta = new Map<string, { id: number }>();
    for (const snapshot of batch) {
      for (const row of snapshotRows(snapshot)) {
        const optaId = row.owner?.altIds?.opta?.toLowerCase();
        const id = row.owner?.id;
        if (optaId && id != null) playerByOpta.set(optaId, { id });
      }
    }
    const content: ConfirmedPlayerTotals[] = [];
    const unresolved: Array<{ fplId: number; optaId: string; reason: string }> =
      [];
    for (const registration of missing) {
      const optaId = `p${registration.player.code}`.toLowerCase();
      const pulsePlayer = playerByOpta.get(optaId);
      if (!pulsePlayer) {
        unresolved.push({
          fplId: registration.fplId,
          optaId,
          reason: "missing_pulselive_player",
        });
        continue;
      }
      const response = await this.collector.getPlayerStats(
        sourceSeasonId,
        pulsePlayer.id,
      );
      const totals = extractConfirmedPlayerTotals(response);
      if (!totals || totals.optaId !== optaId) {
        unresolved.push({
          fplId: registration.fplId,
          optaId,
          reason: "invalid_or_zero_minute_individual_totals",
        });
        continue;
      }
      content.push(totals);
    }
    const payload = {
      rankedBatchId: batchId,
      method: "individual-player-totals",
      absentMetricSemantics: "confirmed_zero_when_mins_played_is_positive",
      content,
      unresolved,
    };
    const supplementBatchId = randomUUID();
    const valid = unresolved.length === 0;
    const snapshot = await this.dependencies.prisma.sourceSnapshot.create({
      data: {
        seasonId: season.id,
        source: "pulselive",
        dataset: "supplement:player-totals",
        season: season.code,
        sourceSeasonId: String(sourceSeasonId),
        gameweek,
        batchId: supplementBatchId,
        schemaVersion: 1,
        fetchedAt: this.now(),
        checksum: checksum(payload),
        valid,
        error: valid
          ? null
          : unresolved.map((row) => `${row.optaId}:${row.reason}`).join(";"),
        recordCount: content.length,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      snapshotId: snapshot.id,
      batchId: supplementBatchId,
      rankedBatchId: batchId,
      requested: missing.length,
      resolved: content.length,
      unresolved,
      valid,
    };
  }
}
