import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, SourceSnapshot } from "@prisma/client";
import { z } from "zod";
import {
  PULSELIVE_METRICS,
  type PulseLiveMetric,
} from "@/lib/collectors/pulseLiveCollector";

const SOURCE = "pulselive";

const cumulativeStatRowSchema = z.object({
  owner: z
    .object({
      name: z
        .object({ display: z.string().optional() })
        .passthrough()
        .optional(),
      altIds: z
        .object({ opta: z.string().optional() })
        .passthrough()
        .optional(),
    })
    .passthrough(),
  value: z.number(),
});

const snapshotPayloadSchema = z.object({
  content: z.array(cumulativeStatRowSchema),
});

export type CumulativeStatRow = z.infer<typeof cumulativeStatRowSchema>;

export interface PulseLiveDeltaRow {
  optaId: string;
  playerName: string | null;
  value: number;
  previousValue: number;
  currentValue: number;
}

export interface PulseLiveDeltaRun {
  derived: boolean;
  currentBatchId: string;
  previousBatchId?: string;
  baselineType?: "logical-zero" | "snapshot";
  gameweek?: number;
  datasets: Array<{ dataset: string; recordCount: number; checksum: string }>;
  reason?: "no_previous_snapshot";
}

interface Dependencies {
  prisma: PrismaClient;
  now?: () => Date;
}

type SnapshotBoundaryMetadata = Pick<
  SourceSnapshot,
  "seasonId" | "season" | "sourceSeasonId" | "gameweek"
>;

export interface PulseLiveBatchBoundary {
  seasonId: number;
  season: string;
  sourceSeasonId: string;
  gameweek: number;
}

export function assertPulseLiveBatchBoundary(
  snapshots: SnapshotBoundaryMetadata[],
  batchId = "unknown",
): PulseLiveBatchBoundary {
  const first = snapshots[0];
  if (!first) throw new Error(`PulseLive batch '${batchId}' is empty`);
  if (first.seasonId == null) {
    throw new Error(
      `PulseLive batch '${batchId}' has no canonical season binding`,
    );
  }
  if (first.gameweek == null) {
    throw new Error(`PulseLive batch '${batchId}' has no gameweek metadata`);
  }
  if (!first.sourceSeasonId) {
    throw new Error(
      `PulseLive batch '${batchId}' has no source-season metadata`,
    );
  }
  if (
    snapshots.some(
      (snapshot) =>
        snapshot.seasonId !== first.seasonId ||
        snapshot.season !== first.season ||
        snapshot.sourceSeasonId !== first.sourceSeasonId ||
        snapshot.gameweek !== first.gameweek,
    )
  ) {
    throw new Error(
      `PulseLive batch '${batchId}' has inconsistent season, source-season or gameweek metadata`,
    );
  }
  return {
    seasonId: first.seasonId,
    season: first.season,
    sourceSeasonId: first.sourceSeasonId,
    gameweek: first.gameweek,
  };
}

function checksum(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function rowsByOptaId(
  rows: CumulativeStatRow[],
  label: string,
): Map<string, CumulativeStatRow> {
  const result = new Map<string, CumulativeStatRow>();
  for (const row of rows) {
    const optaId = row.owner.altIds?.opta;
    if (!optaId) continue;
    if (result.has(optaId))
      throw new Error(`${label} contains duplicate Opta ID '${optaId}'`);
    result.set(optaId, row);
  }
  return result;
}

export function deriveCumulativeDelta(
  previousRows: CumulativeStatRow[],
  currentRows: CumulativeStatRow[],
): PulseLiveDeltaRow[] {
  const previous = rowsByOptaId(previousRows, "Previous PulseLive snapshot");
  const current = rowsByOptaId(currentRows, "Current PulseLive snapshot");

  return [...current.entries()].map(([optaId, row]) => {
    const previousValue = previous.get(optaId)?.value ?? 0;
    const value = row.value - previousValue;
    if (value < 0) {
      throw new Error(
        `PulseLive cumulative value decreased for Opta ID '${optaId}': ${previousValue} -> ${row.value}`,
      );
    }
    return {
      optaId,
      playerName: row.owner.name?.display ?? null,
      value,
      previousValue,
      currentValue: row.value,
    };
  });
}

function metricDataset(metric: PulseLiveMetric): string {
  return `stat:${metric}`;
}

function completeBatch(snapshots: SourceSnapshot[]): SourceSnapshot[] | null {
  const byDataset = new Map(
    snapshots.map((snapshot) => [snapshot.dataset, snapshot]),
  );
  const complete = PULSELIVE_METRICS.map((metric) =>
    byDataset.get(metricDataset(metric)),
  );
  return complete.every(
    (snapshot): snapshot is SourceSnapshot => snapshot != null,
  )
    ? complete
    : null;
}

export class PulseLiveDeltaService {
  private readonly prisma: PrismaClient;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies) {
    this.prisma = dependencies.prisma;
    this.now = dependencies.now ?? (() => new Date());
  }

  async deriveForBatch(batchId: string): Promise<PulseLiveDeltaRun> {
    const currentSnapshots = await this.prisma.sourceSnapshot.findMany({
      where: {
        source: SOURCE,
        batchId,
        valid: true,
        dataset: { in: PULSELIVE_METRICS.map(metricDataset) },
      },
    });
    const current = completeBatch(currentSnapshots);
    if (!current)
      throw new Error(
        `PulseLive batch '${batchId}' is not a complete valid metric batch`,
      );

    const { seasonId, season, sourceSeasonId, gameweek } =
      assertPulseLiveBatchBoundary(current, batchId);
    const binding = await this.prisma.seasonSourceBinding.findUnique({
      where: { seasonId_source: { seasonId, source: SOURCE } },
      include: { season: true },
    });
    if (
      !binding ||
      binding.externalSeasonId !== sourceSeasonId ||
      binding.season.code !== season
    ) {
      throw new Error(
        `PulseLive batch '${batchId}' does not match its canonical PulseLive season binding`,
      );
    }

    let previous: SourceSnapshot[] | null = null;
    if (gameweek > 1) {
      const olderSnapshots = await this.prisma.sourceSnapshot.findMany({
        where: {
          source: SOURCE,
          seasonId,
          season,
          sourceSeasonId,
          valid: true,
          gameweek: { lt: gameweek },
          dataset: { in: PULSELIVE_METRICS.map(metricDataset) },
        },
        orderBy: [{ gameweek: "desc" }, { fetchedAt: "desc" }],
      });
      previous = this.findLatestCompleteBatch(olderSnapshots);
      if (!previous) {
        return {
          derived: false,
          currentBatchId: batchId,
          gameweek,
          datasets: [],
          reason: "no_previous_snapshot",
        };
      }
    }

    const previousByDataset = new Map(
      (previous ?? []).map((snapshot) => [snapshot.dataset, snapshot]),
    );
    const baselineType = gameweek === 1 ? "logical-zero" : "snapshot";
    const baselineWrites =
      gameweek === 1
        ? PULSELIVE_METRICS.map((metric) => {
            const dataset = `baseline:${metric}`;
            const payload = {
              logicalZero: true,
              season,
              sourceSeasonId,
              gameweek,
              content: [],
            };
            return {
              source: SOURCE,
              dataset,
              seasonId,
              season,
              sourceSeasonId,
              gameweek,
              batchId,
              schemaVersion: 1,
              fetchedAt: this.now(),
              checksum: checksum(payload),
              valid: true,
              recordCount: 0,
              payload: payload as Prisma.InputJsonValue,
            };
          })
        : [];
    const writes = PULSELIVE_METRICS.map((metric) => {
      const dataset = metricDataset(metric);
      const currentSnapshot = current.find(
        (snapshot) => snapshot.dataset === dataset,
      )!;
      const previousSnapshot = previousByDataset.get(dataset);
      const content = deriveCumulativeDelta(
        previousSnapshot
          ? snapshotPayloadSchema.parse(previousSnapshot.payload).content
          : [],
        snapshotPayloadSchema.parse(currentSnapshot.payload).content,
      );
      const deltaDataset = `delta:${metric}`;
      const payload = {
        baselineType,
        previousBatchId: previousSnapshot?.batchId ?? null,
        previousDataset: previousSnapshot?.dataset ?? `baseline:${metric}`,
        currentBatchId: batchId,
        content,
      };
      const digest = checksum(payload);
      return {
        result: {
          dataset: deltaDataset,
          recordCount: content.length,
          checksum: digest,
        },
        data: {
          source: SOURCE,
          dataset: deltaDataset,
          seasonId,
          season,
          sourceSeasonId,
          gameweek,
          batchId,
          schemaVersion: 1,
          fetchedAt: this.now(),
          checksum: digest,
          valid: true,
          recordCount: content.length,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      };
    });

    await this.prisma.$transaction(
      [...baselineWrites, ...writes.map(({ data }) => data)].map((data) =>
        this.prisma.sourceSnapshot.upsert({
          where: { batchId_dataset: { batchId, dataset: data.dataset } },
          create: data,
          update: data,
        }),
      ),
    );

    return {
      derived: true,
      currentBatchId: batchId,
      previousBatchId: previous?.[0].batchId,
      baselineType,
      gameweek,
      datasets: writes.map(({ result }) => result),
    };
  }

  private findLatestCompleteBatch(
    snapshots: SourceSnapshot[],
  ): SourceSnapshot[] | null {
    const batches = new Map<string, SourceSnapshot[]>();
    for (const snapshot of snapshots) {
      const batch = batches.get(snapshot.batchId) ?? [];
      batch.push(snapshot);
      batches.set(snapshot.batchId, batch);
    }
    for (const batch of batches.values()) {
      const complete = completeBatch(batch);
      if (complete) return complete;
    }
    return null;
  }
}
