import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PULSELIVE_METRICS,
  PulseLiveCollector,
  type PulseLiveMetric,
  type PulseLivePage,
  type PulseLiveRankedStat,
  type PulseLiveSeason,
} from "@/lib/collectors/pulseLiveCollector";

const SOURCE = "pulselive";
const METRIC_MIN_RECORDS = 300;
const MIN_OPTA_COVERAGE = 0.9;

export interface PulseLiveSnapshotRun {
  batchId: string;
  seasonId: number;
  season: string;
  sourceSeasonId: number;
  gameweek: number;
  snapshots: Array<{
    dataset: string;
    recordCount: number;
    checksum: string;
    valid: boolean;
  }>;
}

export interface PulseLiveSeasonBinding {
  bindingId: number;
  seasonId: number;
  season: string;
  sourceSeasonId: number;
  sourceLabel: string;
}

interface Dependencies {
  prisma: PrismaClient;
  collector?: PulseLiveCollector;
  now?: () => Date;
}

export function canonicalPulseLiveSeason(label: string): string | null {
  const match = label.match(/(20\d{2})\/(?:20)?(\d{2})/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function seasonYears(code: string): { startYear: number; endYear: number } {
  const match = code.match(/^(20\d{2})\/(\d{2})$/);
  if (!match) throw new Error(`Unsupported canonical season '${code}'`);
  const startYear = Number(match[1]);
  const endYear = Math.floor(startYear / 100) * 100 + Number(match[2]);
  if (endYear !== startYear + 1) {
    throw new Error(`Season '${code}' is not a consecutive-year season`);
  }
  return { startYear, endYear };
}

function checksum(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function optaCoverage(players: Array<{ altIds?: { opta?: string } }>): number {
  if (players.length === 0) return 0;
  const mapped = players.filter((player) =>
    Boolean(player.altIds?.opta),
  ).length;
  return mapped / players.length;
}

function validateMetric(
  metric: PulseLiveMetric,
  page: PulseLivePage<PulseLiveRankedStat>,
): string | null {
  if (page.content.length < METRIC_MIN_RECORDS) {
    return `${metric} coverage ${page.content.length} is below ${METRIC_MIN_RECORDS}`;
  }
  if (page.content.some((row) => row.name !== metric)) {
    return `${metric} payload contains a different stat name`;
  }
  const coverage = optaCoverage(page.content.map((row) => row.owner));
  if (coverage < MIN_OPTA_COVERAGE) {
    return `${metric} Opta coverage ${coverage.toFixed(4)} is below ${MIN_OPTA_COVERAGE}`;
  }
  return null;
}

export class PulseLiveSnapshotService {
  private readonly prisma: PrismaClient;
  private readonly collector: PulseLiveCollector;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies) {
    this.prisma = dependencies.prisma;
    this.collector = dependencies.collector ?? new PulseLiveCollector();
    this.now = dependencies.now ?? (() => new Date());
  }

  async collectSeason(
    targetSeason: string,
    gameweek: number,
  ): Promise<PulseLiveSnapshotRun> {
    const binding = await this.resolveAndStoreSeason(targetSeason);

    const batchId = randomUUID();
    const run: PulseLiveSnapshotRun = {
      batchId,
      seasonId: binding.seasonId,
      season: binding.season,
      sourceSeasonId: binding.sourceSeasonId,
      gameweek,
      snapshots: [],
    };

    for (const metric of PULSELIVE_METRICS) {
      const page = await this.fetchOrPersistFailure({
        batchId,
        seasonId: binding.seasonId,
        season: binding.season,
        sourceSeasonId: binding.sourceSeasonId,
        gameweek,
        dataset: `stat:${metric}`,
        fetchPage: () =>
          this.collector.getAllRankedStats(binding.sourceSeasonId, metric),
      });
      run.snapshots.push(
        await this.persistPage({
          batchId,
          seasonId: binding.seasonId,
          season: binding.season,
          sourceSeasonId: binding.sourceSeasonId,
          gameweek,
          dataset: `stat:${metric}`,
          page,
          validationError: validateMetric(metric, page),
        }),
      );
    }

    const invalid = run.snapshots.filter((snapshot) => !snapshot.valid);
    if (invalid.length > 0) {
      throw new Error(
        `PulseLive batch ${batchId} failed validation: ${invalid.map((item) => item.dataset).join(", ")}`,
      );
    }
    return run;
  }

  async resolveAndStoreSeason(
    targetSeason: string,
  ): Promise<PulseLiveSeasonBinding> {
    const seasons = await this.collector.getCompetitionSeasons();
    const sourceSeason = this.resolveSeason(seasons.content, targetSeason);
    const canonical = canonicalPulseLiveSeason(sourceSeason.label);
    if (!canonical) {
      throw new Error(
        `Unsupported PulseLive season label '${sourceSeason.label}'`,
      );
    }
    const { startYear, endYear } = seasonYears(canonical);
    const verifiedAt = this.now();

    return this.prisma.$transaction(async (tx) => {
      let season = await tx.season.findUnique({ where: { code: canonical } });
      if (!season) {
        season = await tx.season.create({
          data: {
            code: canonical,
            startYear,
            endYear,
            status: "UPCOMING",
            isCurrent: false,
          },
        });
      } else if (season.startYear !== startYear || season.endYear !== endYear) {
        throw new Error(
          `Canonical season '${canonical}' has conflicting year metadata`,
        );
      }

      const externalSeasonId = String(sourceSeason.id);
      const [boundToSeason, boundToExternalId] = await Promise.all([
        tx.seasonSourceBinding.findUnique({
          where: {
            seasonId_source: { seasonId: season.id, source: SOURCE },
          },
        }),
        tx.seasonSourceBinding.findUnique({
          where: {
            source_externalSeasonId: {
              source: SOURCE,
              externalSeasonId,
            },
          },
        }),
      ]);
      if (
        boundToSeason &&
        boundToSeason.externalSeasonId !== externalSeasonId
      ) {
        throw new Error(
          `Season '${canonical}' is already bound to PulseLive season '${boundToSeason.externalSeasonId}'`,
        );
      }
      if (boundToExternalId && boundToExternalId.seasonId !== season.id) {
        throw new Error(
          `PulseLive season '${externalSeasonId}' is already bound to canonical season ID ${boundToExternalId.seasonId}`,
        );
      }

      const binding = await tx.seasonSourceBinding.upsert({
        where: {
          seasonId_source: { seasonId: season.id, source: SOURCE },
        },
        create: {
          seasonId: season.id,
          source: SOURCE,
          externalSeasonId,
          label: sourceSeason.label,
          metadata: { source: "footballapi.pulselive.com" },
          verifiedAt,
        },
        update: {
          label: sourceSeason.label,
          metadata: { source: "footballapi.pulselive.com" },
          verifiedAt,
        },
      });
      return {
        bindingId: binding.id,
        seasonId: season.id,
        season: canonical,
        sourceSeasonId: sourceSeason.id,
        sourceLabel: sourceSeason.label,
      };
    });
  }

  async getLatestValidSnapshot(dataset: string, season: string) {
    return this.prisma.sourceSnapshot.findFirst({
      where: { source: SOURCE, dataset, season, valid: true },
      orderBy: { fetchedAt: "desc" },
    });
  }

  private resolveSeason(
    seasons: PulseLiveSeason[],
    target: string,
  ): PulseLiveSeason {
    const numericId = Number(target);
    const found = Number.isFinite(numericId)
      ? seasons.find((season) => season.id === numericId)
      : seasons.find(
          (season) => canonicalPulseLiveSeason(season.label) === target,
        );
    if (!found) throw new Error(`PulseLive season '${target}' was not found`);
    return found;
  }

  private async persistPage<T>(input: {
    batchId: string;
    seasonId: number;
    season: string;
    sourceSeasonId: number;
    gameweek: number;
    dataset: string;
    page: PulseLivePage<T>;
    validationError: string | null;
  }) {
    const payload = {
      pageInfo: input.page.pageInfo,
      content: input.page.content,
    };
    const digest = checksum(payload);
    const valid = input.validationError == null;
    await this.prisma.sourceSnapshot.create({
      data: {
        seasonId: input.seasonId,
        source: SOURCE,
        dataset: input.dataset,
        season: input.season,
        sourceSeasonId: String(input.sourceSeasonId),
        gameweek: input.gameweek,
        batchId: input.batchId,
        schemaVersion: 1,
        fetchedAt: this.now(),
        checksum: digest,
        valid,
        error: input.validationError,
        recordCount: input.page.content.length,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return {
      dataset: input.dataset,
      recordCount: input.page.content.length,
      checksum: digest,
      valid,
    };
  }

  private async fetchOrPersistFailure<T>(input: {
    batchId: string;
    seasonId: number;
    season: string;
    sourceSeasonId: number;
    gameweek: number;
    dataset: string;
    fetchPage: () => Promise<PulseLivePage<T>>;
  }): Promise<PulseLivePage<T>> {
    try {
      return await input.fetchPage();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown PulseLive error";
      const payload = { error: message };
      await this.prisma.sourceSnapshot.create({
        data: {
          seasonId: input.seasonId,
          source: SOURCE,
          dataset: input.dataset,
          season: input.season,
          sourceSeasonId: String(input.sourceSeasonId),
          gameweek: input.gameweek,
          batchId: input.batchId,
          schemaVersion: 1,
          fetchedAt: this.now(),
          checksum: checksum(payload),
          valid: false,
          error: message,
          recordCount: 0,
          payload,
        },
      });
      throw error;
    }
  }
}
