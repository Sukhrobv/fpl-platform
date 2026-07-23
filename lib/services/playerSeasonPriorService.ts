import { createHash } from "node:crypto";
import {
  Position,
  PriorConfidence,
  Prisma,
  type PrismaClient,
  type SourceSnapshot,
} from "@prisma/client";
import { z } from "zod";
import { PULSELIVE_METRICS } from "@/lib/collectors/pulseLiveCollector";

export const DEFAULT_PRIOR_VERSION = "gw1-prior-v5";

export const DEFAULT_PRIOR_CONFIG = {
  schemaVersion: 5,
  shrinkageMinutes: 900,
  highConfidenceMinutes: 1800,
  positionBaselineWeight: 0.75,
  teamPositionBaselineWeight: 0.25,
  eventRatePriorStrength: 900,
  rolePriorStrength: 270,
  confidenceThresholds: { medium: 0.4, high: 0.75 },
  uncertaintyMultipliers: {
    transfer: 0.85,
    positionChange: 0.75,
    promotedTeam: 0.8,
    newManager: 0.9,
    noPlHistory: 0.35,
  },
  enrichmentFallbackOrder: [
    "pulselive-ranked",
    "pulselive-individual-confirmed-total",
    "understat-season-total-key-passes-only",
  ],
} as const;

const BACKTEST_DISCLOSURE = {
  status: "NOT_RUN",
  reason:
    "The stored 2025/26 evidence has final cumulative FPL/PulseLive snapshots but no complete time-sliced feature snapshots suitable for a leakage-free retrospective GW backtest.",
  requiredEvidence:
    "Per-gameweek pre-deadline feature snapshots and realized outcomes must be archived before calibration can be reported as passed.",
} as const;

const bootstrapPayloadSchema = z.object({
  elements: z.array(
    z
      .object({
        id: z.number(),
        code: z.number(),
        minutes: z.number().nonnegative(),
        starts: z.number().nonnegative().nullable().optional(),
        expected_goals: z.string().nullable().optional(),
        expected_assists: z.string().nullable().optional(),
      })
      .passthrough(),
  ),
});

const pulsePayloadSchema = z.object({
  content: z.array(
    z
      .object({
        owner: z
          .object({
            altIds: z.object({ opta: z.string().optional() }).optional(),
          })
          .passthrough(),
        value: z.number().nonnegative(),
      })
      .passthrough(),
  ),
});

const pulseSupplementSchema = z.object({
  content: z.array(
    z.object({
      optaId: z.string(),
      minutes: z.number().positive(),
      values: z.object({
        touches: z.number().nonnegative(),
        total_att_assist: z.number().nonnegative(),
        carries: z.number().nonnegative(),
      }),
      absentAsZero: z.array(z.string()),
    }),
  ),
});

type MetricName =
  | "xG90"
  | "xA90"
  | "touches90"
  | "keyPasses90"
  | "carries90"
  | "defconActions90";

interface MetricObservation {
  raw: number | null;
  minutes: number;
}

interface CandidatePrior {
  sourceSeasonPlayerId: number;
  playerId: number;
  fplId: number;
  code: number;
  position: Position;
  seasonTeamId: number;
  minutes: number;
  appearances: number;
  starts: number | null;
  metrics: Record<MetricName, MetricObservation>;
  evidence: Prisma.InputJsonValue;
}

export interface PriorBuildResult {
  sourceSeason: string;
  targetSeason: string;
  version: string;
  configVersionId: number;
  freezeId: number;
  priors: number;
  quality: PriorQualityReport;
  reused: boolean;
}

export interface PriorQualityReport {
  totalPlayers: number;
  playersWithMinutes: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  coverage: Record<MetricName, number>;
  eligible: Record<MetricName, number>;
  coverageRate: Record<MetricName, number>;
}

export interface EarlySeasonObservation {
  value: number | null;
  minutes: number;
}

export type PriorBlendKind = "eventRate" | "role";

export interface UncertaintyFlags {
  transfer?: boolean;
  positionChange?: boolean;
  promotedTeam?: boolean;
  newManager?: boolean;
  noPlHistory?: boolean;
}

export interface ResolvedSeasonPrior {
  playerId: number;
  targetSeasonCode: string;
  version: string;
  provenance: "PLAYER_PRIOR" | "POSITION_BASELINE";
  metrics: Record<MetricName, number | null>;
  confidenceScore: number;
  confidence: PriorConfidence;
  uncertaintyReasons: string[];
}

function finiteNumber(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function per90OrNull(
  total: number | null | undefined,
  minutes: number,
): number | null {
  if (total == null || !Number.isFinite(total) || minutes <= 0) return null;
  return (total / minutes) * 90;
}

export function shrinkRate(
  rawRate: number | null,
  baseline: number | null,
  minutes: number,
  priorMinutes = DEFAULT_PRIOR_CONFIG.shrinkageMinutes,
): number | null {
  if (rawRate == null) return null;
  if (baseline == null || minutes <= 0) return rawRate;
  const weight = minutes / (minutes + priorMinutes);
  return rawRate * weight + baseline * (1 - weight);
}

export function blendPriorWithCurrent(
  prior: number | null,
  current: EarlySeasonObservation,
  kind: PriorBlendKind = "eventRate",
): number | null {
  if (current.value == null || current.minutes <= 0) return prior;
  if (prior == null) return current.value;
  const strength =
    kind === "role"
      ? DEFAULT_PRIOR_CONFIG.rolePriorStrength
      : DEFAULT_PRIOR_CONFIG.eventRatePriorStrength;
  return (
    (prior * strength + current.value * current.minutes) /
    (strength + current.minutes)
  );
}

export function classifyPriorConfidence(score: number): PriorConfidence {
  if (score >= DEFAULT_PRIOR_CONFIG.confidenceThresholds.high) return "HIGH";
  if (score >= DEFAULT_PRIOR_CONFIG.confidenceThresholds.medium)
    return "MEDIUM";
  return "LOW";
}

export function applyUncertaintyFlags(
  confidenceScore: number,
  flags: UncertaintyFlags,
): { score: number; confidence: PriorConfidence; reasons: string[] } {
  const reasons: string[] = [];
  let multiplier = 1;
  const apply = (
    enabled: boolean | undefined,
    reason: string,
    factor: number,
  ) => {
    if (!enabled) return;
    reasons.push(reason);
    multiplier *= factor;
  };
  apply(
    flags.transfer,
    "TRANSFER",
    DEFAULT_PRIOR_CONFIG.uncertaintyMultipliers.transfer,
  );
  apply(
    flags.positionChange,
    "POSITION_CHANGE",
    DEFAULT_PRIOR_CONFIG.uncertaintyMultipliers.positionChange,
  );
  apply(
    flags.promotedTeam,
    "PROMOTED_TEAM",
    DEFAULT_PRIOR_CONFIG.uncertaintyMultipliers.promotedTeam,
  );
  apply(
    flags.newManager,
    "NEW_MANAGER",
    DEFAULT_PRIOR_CONFIG.uncertaintyMultipliers.newManager,
  );
  apply(
    flags.noPlHistory,
    "NO_PL_HISTORY",
    DEFAULT_PRIOR_CONFIG.uncertaintyMultipliers.noPlHistory,
  );
  const score = Math.max(0, Math.min(1, confidenceScore * multiplier));
  return { score, confidence: classifyPriorConfidence(score), reasons };
}

function checksum(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

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

function pulseRows(snapshot: SourceSnapshot): Map<string, number> {
  const parsed = pulsePayloadSchema.parse(snapshot.payload);
  const rows = new Map<string, number>();
  for (const row of parsed.content) {
    const optaId = row.owner.altIds?.opta?.toLowerCase();
    if (optaId) rows.set(optaId, row.value);
  }
  return rows;
}

function latestCompletePulseBatch(
  snapshots: SourceSnapshot[],
): SourceSnapshot[] | null {
  const batches = new Map<string, SourceSnapshot[]>();
  for (const snapshot of snapshots) {
    const batch = batches.get(snapshot.batchId) ?? [];
    batch.push(snapshot);
    batches.set(snapshot.batchId, batch);
  }
  for (const batch of batches.values()) {
    const datasets = new Set(batch.map((snapshot) => snapshot.dataset));
    if (PULSELIVE_METRICS.every((metric) => datasets.has(`stat:${metric}`))) {
      return batch;
    }
  }
  return null;
}

function weightedAverage(
  candidates: CandidatePrior[],
  metric: MetricName,
): number | null {
  let weighted = 0;
  let minutes = 0;
  for (const candidate of candidates) {
    const observation = candidate.metrics[metric];
    if (observation.raw == null || observation.minutes <= 0) continue;
    weighted += observation.raw * observation.minutes;
    minutes += observation.minutes;
  }
  return minutes > 0 ? weighted / minutes : null;
}

function hierarchicalBaseline(
  candidates: CandidatePrior[],
  candidate: CandidatePrior,
  metric: MetricName,
): number | null {
  const positional = weightedAverage(
    candidates.filter((item) => item.position === candidate.position),
    metric,
  );
  const teamPosition = weightedAverage(
    candidates.filter(
      (item) =>
        item.position === candidate.position &&
        item.seasonTeamId === candidate.seasonTeamId,
    ),
    metric,
  );
  if (positional == null) return teamPosition;
  if (teamPosition == null) return positional;
  return (
    positional * DEFAULT_PRIOR_CONFIG.positionBaselineWeight +
    teamPosition * DEFAULT_PRIOR_CONFIG.teamPositionBaselineWeight
  );
}

function candidateConfidence(candidate: CandidatePrior): {
  score: number;
  confidence: PriorConfidence;
  reasons: string[];
} {
  const requiredMetrics: MetricName[] =
    candidate.position === "GOALKEEPER"
      ? ["xG90", "xA90", "touches90", "keyPasses90", "carries90"]
      : [
          "xG90",
          "xA90",
          "touches90",
          "keyPasses90",
          "carries90",
          "defconActions90",
        ];
  const present = requiredMetrics.filter(
    (metric) => candidate.metrics[metric].raw != null,
  );
  const sampleScore = Math.min(
    1,
    candidate.minutes / DEFAULT_PRIOR_CONFIG.highConfidenceMinutes,
  );
  const coverageScore = present.length / requiredMetrics.length;
  const score = sampleScore * 0.7 + coverageScore * 0.3;
  const reasons: string[] = [];
  if (candidate.minutes === 0) reasons.push("NO_PL_MINUTES");
  else if (candidate.minutes < DEFAULT_PRIOR_CONFIG.shrinkageMinutes)
    reasons.push("SMALL_SAMPLE");
  for (const metric of requiredMetrics) {
    if (candidate.metrics[metric].raw == null)
      reasons.push(`MISSING_${metric.toUpperCase()}`);
  }
  return { score, confidence: classifyPriorConfidence(score), reasons };
}

function buildQuality(
  rows: Array<{
    minutes: number;
    position: Position;
    confidence: PriorConfidence;
    raw: Record<MetricName, number | null>;
  }>,
): PriorQualityReport {
  const metrics: MetricName[] = [
    "xG90",
    "xA90",
    "touches90",
    "keyPasses90",
    "carries90",
    "defconActions90",
  ];
  const eligible = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      rows.filter(
        (row) =>
          row.minutes > 0 &&
          (![
            "touches90",
            "keyPasses90",
            "carries90",
            "defconActions90",
          ].includes(metric) ||
            row.position !== "GOALKEEPER"),
      ).length,
    ]),
  ) as Record<MetricName, number>;
  const coverage = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      rows.filter(
        (row) =>
          row.minutes > 0 &&
          (row.position !== "GOALKEEPER" ||
            ![
              "touches90",
              "keyPasses90",
              "carries90",
              "defconActions90",
            ].includes(metric)) &&
          row.raw[metric] != null,
      ).length,
    ]),
  ) as Record<MetricName, number>;
  return {
    totalPlayers: rows.length,
    playersWithMinutes: rows.filter((row) => row.minutes > 0).length,
    highConfidence: rows.filter((row) => row.confidence === "HIGH").length,
    mediumConfidence: rows.filter((row) => row.confidence === "MEDIUM").length,
    lowConfidence: rows.filter((row) => row.confidence === "LOW").length,
    coverage,
    eligible,
    coverageRate: Object.fromEntries(
      metrics.map((metric) => [
        metric,
        eligible[metric] > 0 ? coverage[metric] / eligible[metric] : 0,
      ]),
    ) as Record<MetricName, number>,
  };
}

export class PlayerSeasonPriorService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveForTargetSeasonPlayer(input: {
    seasonPlayerId: number;
    version?: string;
    newManager?: boolean;
  }): Promise<ResolvedSeasonPrior> {
    const version = input.version ?? DEFAULT_PRIOR_VERSION;
    const target = await this.prisma.seasonPlayer.findUnique({
      where: { id: input.seasonPlayerId },
      include: { season: true, seasonTeam: true },
    });
    if (!target)
      throw new Error(`Season player ${input.seasonPlayerId} not found`);
    const config = await this.prisma.predictionConfigVersion.findUnique({
      where: { version },
    });
    if (!config) throw new Error(`Prediction config ${version} not found`);
    const prior = await this.prisma.playerSeasonPrior.findUnique({
      where: {
        sourceSeasonId_playerId_configVersionId_targetSeasonCode: {
          sourceSeasonId: config.sourceSeasonId,
          playerId: target.playerId,
          configVersionId: config.id,
          targetSeasonCode: target.season.code,
        },
      },
      include: { sourceSeasonPlayer: { include: { seasonTeam: true } } },
    });
    const sourceTeamExists = await this.prisma.seasonTeam.count({
      where: {
        seasonId: config.sourceSeasonId,
        teamId: target.seasonTeam.teamId,
      },
    });
    const flags: UncertaintyFlags = {
      transfer:
        prior != null &&
        prior.sourceSeasonPlayer.seasonTeam.teamId !== target.seasonTeam.teamId,
      positionChange: prior != null && prior.sourcePosition !== target.position,
      promotedTeam: sourceTeamExists === 0,
      newManager: input.newManager,
      noPlHistory: prior == null || prior.minutes === 0,
    };

    if (prior) {
      const adjusted = applyUncertaintyFlags(prior.confidenceScore, flags);
      const storedReasons = Array.isArray(prior.uncertaintyReasons)
        ? prior.uncertaintyReasons.filter(
            (reason): reason is string => typeof reason === "string",
          )
        : [];
      return {
        playerId: target.playerId,
        targetSeasonCode: target.season.code,
        version,
        provenance: "PLAYER_PRIOR",
        metrics: {
          xG90: prior.xG90,
          xA90: prior.xA90,
          touches90: prior.touches90,
          keyPasses90: prior.keyPasses90,
          carries90: prior.carries90,
          defconActions90: prior.defconActions90,
        },
        confidenceScore: adjusted.score,
        confidence: adjusted.confidence,
        uncertaintyReasons: [
          ...new Set([...storedReasons, ...adjusted.reasons]),
        ],
      };
    }

    const population = await this.prisma.playerSeasonPrior.aggregate({
      where: {
        sourceSeasonId: config.sourceSeasonId,
        configVersionId: config.id,
        targetSeasonCode: target.season.code,
        sourcePosition: target.position,
        minutes: { gt: 0 },
      },
      _avg: {
        xG90: true,
        xA90: true,
        touches90: true,
        keyPasses90: true,
        carries90: true,
        defconActions90: true,
      },
    });
    const adjusted = applyUncertaintyFlags(0.7, flags);
    return {
      playerId: target.playerId,
      targetSeasonCode: target.season.code,
      version,
      provenance: "POSITION_BASELINE",
      metrics: {
        xG90: population._avg.xG90,
        xA90: population._avg.xA90,
        touches90: population._avg.touches90,
        keyPasses90: population._avg.keyPasses90,
        carries90: population._avg.carries90,
        defconActions90: population._avg.defconActions90,
      },
      confidenceScore: adjusted.score,
      confidence: adjusted.confidence,
      uncertaintyReasons: adjusted.reasons,
    };
  }

  async build(input: {
    sourceSeasonCode: string;
    targetSeasonCode: string;
    version?: string;
  }): Promise<PriorBuildResult> {
    const version = input.version ?? DEFAULT_PRIOR_VERSION;
    const sourceSeason = await this.prisma.season.findUnique({
      where: { code: input.sourceSeasonCode },
    });
    if (!sourceSeason)
      throw new Error(`Season ${input.sourceSeasonCode} not found`);
    if (sourceSeason.status !== "COMPLETE") {
      throw new Error(
        `Season ${input.sourceSeasonCode} must be COMPLETE before priors are frozen`,
      );
    }

    const fplSnapshot = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: sourceSeason.id,
        source: "fpl",
        dataset: "bootstrap-static",
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
    });
    if (!fplSnapshot) throw new Error("No valid final FPL bootstrap snapshot");
    const bootstrap = bootstrapPayloadSchema.parse(fplSnapshot.payload);
    const bootstrapByFplId = new Map(
      bootstrap.elements.map((element) => [element.id, element]),
    );

    const pulseSnapshots = await this.prisma.sourceSnapshot.findMany({
      where: {
        seasonId: sourceSeason.id,
        source: "pulselive",
        valid: true,
        dataset: { in: PULSELIVE_METRICS.map((metric) => `stat:${metric}`) },
      },
      orderBy: [{ gameweek: "desc" }, { fetchedAt: "desc" }],
    });
    const pulseBatch = latestCompletePulseBatch(pulseSnapshots);
    if (!pulseBatch) throw new Error("No complete final PulseLive batch");
    const pulseByDataset = new Map(
      pulseBatch.map((snapshot) => [snapshot.dataset, pulseRows(snapshot)]),
    );
    const supplementSnapshot = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: sourceSeason.id,
        source: "pulselive",
        dataset: "supplement:player-totals",
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
    });
    const supplementByOpta = new Map(
      supplementSnapshot
        ? pulseSupplementSchema
            .parse(supplementSnapshot.payload)
            .content.map((row) => [row.optaId.toLowerCase(), row])
        : [],
    );

    const registrations = await this.prisma.seasonPlayer.findMany({
      where: { seasonId: sourceSeason.id },
      include: {
        player: { select: { code: true } },
        fplStats: {
          select: { minutes: true, defensiveContribution: true },
        },
        externalStats: {
          where: { source: "understat", gameweek: 0 },
          select: { minutes: true, keyPasses: true },
          take: 1,
        },
      },
    });

    const candidates: CandidatePrior[] = registrations.map((registration) => {
      const element = bootstrapByFplId.get(registration.fplId);
      if (!element || element.code !== registration.player.code) {
        throw new Error(
          `Final FPL snapshot identity mismatch for registration ${registration.id}`,
        );
      }
      const optaId = `p${registration.player.code}`.toLowerCase();
      const pulseMinutes =
        pulseByDataset.get("stat:mins_played")?.get(optaId) ?? 0;
      const fplMinutes = element.minutes;
      const appearances = registration.fplStats.filter(
        (stat) => stat.minutes > 0,
      ).length;
      const defconRows = registration.fplStats.filter(
        (stat) => stat.minutes > 0 && stat.defensiveContribution != null,
      );
      const defconMinutes = defconRows.reduce(
        (sum, stat) => sum + stat.minutes,
        0,
      );
      const defconTotal = defconRows.reduce(
        (sum, stat) => sum + (stat.defensiveContribution ?? 0),
        0,
      );
      const pulseMetric = (dataset: string) =>
        pulseByDataset.get(dataset)?.get(optaId) ?? null;
      const xG = finiteNumber(element.expected_goals);
      const xA = finiteNumber(element.expected_assists);
      const supplement = supplementByOpta.get(optaId);
      const rankedTouches = pulseMetric("stat:touches");
      const touches = rankedTouches ?? supplement?.values.touches ?? null;
      const touchesMinutes =
        rankedTouches != null ? pulseMinutes : (supplement?.minutes ?? 0);
      const pulseKeyPasses = pulseMetric("stat:total_att_assist");
      const understat = registration.externalStats[0];
      const keyPasses =
        pulseKeyPasses ??
        supplement?.values.total_att_assist ??
        understat?.keyPasses ??
        null;
      const keyPassesMinutes =
        pulseKeyPasses != null
          ? pulseMinutes
          : supplement != null
            ? supplement.minutes
            : (understat?.minutes ?? 0);
      const rankedCarries = pulseMetric("stat:carries");
      const carries = rankedCarries ?? supplement?.values.carries ?? null;
      const carriesMinutes =
        rankedCarries != null ? pulseMinutes : (supplement?.minutes ?? 0);
      const metrics: Record<MetricName, MetricObservation> = {
        xG90: { raw: per90OrNull(xG, fplMinutes), minutes: fplMinutes },
        xA90: { raw: per90OrNull(xA, fplMinutes), minutes: fplMinutes },
        touches90: {
          raw: per90OrNull(touches, touchesMinutes),
          minutes: touchesMinutes,
        },
        keyPasses90: {
          raw: per90OrNull(keyPasses, keyPassesMinutes),
          minutes: keyPassesMinutes,
        },
        carries90: {
          raw: per90OrNull(carries, carriesMinutes),
          minutes: carriesMinutes,
        },
        defconActions90: {
          raw:
            registration.position === "GOALKEEPER"
              ? null
              : per90OrNull(defconTotal, defconMinutes),
          minutes: defconMinutes,
        },
      };
      return {
        sourceSeasonPlayerId: registration.id,
        playerId: registration.playerId,
        fplId: registration.fplId,
        code: registration.player.code,
        position: registration.position,
        seasonTeamId: registration.seasonTeamId,
        minutes: fplMinutes,
        appearances,
        starts: element.starts ?? null,
        metrics,
        evidence: {
          fplSnapshotId: fplSnapshot.id,
          fplChecksum: fplSnapshot.checksum,
          pulseBatchId: pulseBatch[0].batchId,
          pulseSupplementSnapshotId: supplementSnapshot?.id ?? null,
          fplMinutes,
          pulseMinutes,
          touchesMinutes,
          keyPassesMinutes,
          carriesMinutes,
          touchesSource:
            rankedTouches != null
              ? "pulselive-ranked"
              : supplement != null
                ? "pulselive-individual"
                : null,
          keyPassesSource:
            pulseKeyPasses != null
              ? "pulselive-ranked"
              : supplement != null
                ? "pulselive-individual"
                : understat?.keyPasses != null
                  ? "understat"
                  : null,
          carriesSource:
            rankedCarries != null
              ? "pulselive-ranked"
              : supplement != null
                ? "pulselive-individual"
                : null,
          defconMinutes,
          totals: { xG, xA, touches, keyPasses, carries, defconTotal },
        } as Prisma.InputJsonValue,
      };
    });

    const configVersion = await this.prisma.predictionConfigVersion.upsert({
      where: { version },
      create: {
        version,
        sourceSeasonId: sourceSeason.id,
        config: DEFAULT_PRIOR_CONFIG as unknown as Prisma.InputJsonValue,
        calibrationStatus: "NOT_RUN",
        backtestResult: BACKTEST_DISCLOSURE as unknown as Prisma.InputJsonValue,
        notes:
          "GW1 prior configuration. Calibration/backtest is explicitly NOT_RUN until a reproducible evaluation artifact is attached.",
        frozenAt: new Date(),
      },
      update: {},
    });
    if (configVersion.sourceSeasonId !== sourceSeason.id) {
      throw new Error(`Version ${version} belongs to another source season`);
    }
    if (configVersion.backtestResult == null) {
      await this.prisma.predictionConfigVersion.update({
        where: { id: configVersion.id },
        data: {
          backtestResult:
            BACKTEST_DISCLOSURE as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const priorRows = candidates.map((candidate) => {
      const confidence = candidateConfidence(candidate);
      const shrunk = Object.fromEntries(
        (Object.keys(candidate.metrics) as MetricName[]).map((metric) => {
          const observation = candidate.metrics[metric];
          return [
            metric,
            shrinkRate(
              observation.raw,
              hierarchicalBaseline(candidates, candidate, metric),
              observation.minutes,
            ),
          ];
        }),
      ) as Record<MetricName, number | null>;
      return {
        sourceSeasonId: sourceSeason.id,
        sourceSeasonPlayerId: candidate.sourceSeasonPlayerId,
        playerId: candidate.playerId,
        configVersionId: configVersion.id,
        targetSeasonCode: input.targetSeasonCode,
        sourcePosition: candidate.position,
        minutes: candidate.minutes,
        appearances: candidate.appearances,
        starts: candidate.starts,
        position: candidate.position,
        raw: Object.fromEntries(
          (Object.keys(candidate.metrics) as MetricName[]).map((metric) => [
            metric,
            candidate.metrics[metric].raw,
          ]),
        ) as Record<MetricName, number | null>,
        shrunk,
        sampleWeight:
          candidate.minutes /
          (candidate.minutes + DEFAULT_PRIOR_CONFIG.shrinkageMinutes),
        confidenceScore: confidence.score,
        confidence: confidence.confidence,
        uncertaintyReasons: confidence.reasons,
        evidence: candidate.evidence,
      };
    });
    const quality = buildQuality(priorRows);
    const snapshotManifest = [
      fplSnapshot,
      ...pulseBatch,
      ...(supplementSnapshot ? [supplementSnapshot] : []),
    ]
      .map((snapshot) => ({
        id: snapshot.id,
        source: snapshot.source,
        dataset: snapshot.dataset,
        batchId: snapshot.batchId,
        gameweek: snapshot.gameweek,
        checksum: snapshot.checksum,
        recordCount: snapshot.recordCount,
      }))
      .sort((a, b) => a.id - b.id);
    const derivedManifest = {
      version,
      targetSeasonCode: input.targetSeasonCode,
      priorCount: priorRows.length,
      priorDigest: checksum(
        priorRows.map((row) => ({
          playerId: row.playerId,
          minutes: row.minutes,
          starts: row.starts,
          raw: row.raw,
          shrunk: row.shrunk,
          confidenceScore: row.confidenceScore,
          confidence: row.confidence,
          uncertaintyReasons: row.uncertaintyReasons,
          evidence: row.evidence,
        })),
      ),
      algorithm: DEFAULT_PRIOR_CONFIG,
    };
    const freezeChecksum = checksum({
      snapshotManifest,
      derivedManifest,
      quality,
    });
    const existingFreeze = await this.prisma.seasonEvidenceFreeze.findUnique({
      where: {
        seasonId_version: { seasonId: sourceSeason.id, version },
      },
    });
    if (existingFreeze && existingFreeze.checksum !== freezeChecksum) {
      throw new Error(
        `Frozen evidence ${version} changed; create a new version instead of mutating it`,
      );
    }
    const existingPriors = await this.prisma.playerSeasonPrior.count({
      where: {
        sourceSeasonId: sourceSeason.id,
        configVersionId: configVersion.id,
        targetSeasonCode: input.targetSeasonCode,
      },
    });
    if (existingPriors > 0 && existingPriors !== priorRows.length) {
      throw new Error(
        `Prior version ${version} is incomplete: ${existingPriors}/${priorRows.length}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (existingPriors === 0) {
        await tx.playerSeasonPrior.createMany({
          data: priorRows.map((row) => ({
            sourceSeasonId: row.sourceSeasonId,
            sourceSeasonPlayerId: row.sourceSeasonPlayerId,
            playerId: row.playerId,
            configVersionId: row.configVersionId,
            targetSeasonCode: row.targetSeasonCode,
            sourcePosition: row.sourcePosition,
            minutes: row.minutes,
            appearances: row.appearances,
            starts: row.starts,
            rawXG90: row.raw.xG90,
            rawXA90: row.raw.xA90,
            rawTouches90: row.raw.touches90,
            rawKeyPasses90: row.raw.keyPasses90,
            rawCarries90: row.raw.carries90,
            rawDefconActions90: row.raw.defconActions90,
            xG90: row.shrunk.xG90,
            xA90: row.shrunk.xA90,
            touches90: row.shrunk.touches90,
            keyPasses90: row.shrunk.keyPasses90,
            carries90: row.shrunk.carries90,
            defconActions90: row.shrunk.defconActions90,
            sampleWeight: row.sampleWeight,
            confidenceScore: row.confidenceScore,
            confidence: row.confidence,
            uncertaintyReasons: row.uncertaintyReasons as Prisma.InputJsonValue,
            evidence: row.evidence,
          })),
        });
      }
      const freeze = existingFreeze
        ? existingFreeze
        : await tx.seasonEvidenceFreeze.create({
            data: {
              seasonId: sourceSeason.id,
              configVersionId: configVersion.id,
              version,
              snapshotManifest:
                snapshotManifest as unknown as Prisma.InputJsonValue,
              derivedManifest:
                derivedManifest as unknown as Prisma.InputJsonValue,
              qualityReport: quality as unknown as Prisma.InputJsonValue,
              checksum: freezeChecksum,
            },
          });
      await tx.seasonEvidenceFreeze.updateMany({
        where: {
          seasonId: sourceSeason.id,
          version: { not: version },
          status: "FROZEN",
        },
        data: { status: "SUPERSEDED" },
      });
      return freeze;
    });

    return {
      sourceSeason: sourceSeason.code,
      targetSeason: input.targetSeasonCode,
      version,
      configVersionId: configVersion.id,
      freezeId: result.id,
      priors: priorRows.length,
      quality,
      reused: existingPriors > 0,
    };
  }
}
