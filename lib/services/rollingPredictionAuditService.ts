import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  ROLLING_PREDICTION_DATASET,
  type RollingPlayerProjection,
  type RollingPredictionPayload,
} from "@/lib/services/rollingPredictionService";

export const ROLLING_PREDICTION_AUDIT_DATASET = "rolling-prediction-audit";
export const ROLLING_PREDICTION_AUDIT_VERSION = "rolling-prediction-audit-v1";

type Confidence = RollingPlayerProjection["confidence"];
type Position = RollingPlayerProjection["position"];
type MinutesBand = "ZERO" | "UNDER_60" | "SIXTY_PLUS";

export interface RollingPredictionAuditRow {
  seasonPlayerId: number;
  fplId: number;
  playerName: string;
  position: Position;
  confidence: Confidence;
  expectedMinutes: number;
  predictedXPts: number;
  actualPoints: number;
  error: number;
  absoluteError: number;
}

interface AuditGroup {
  players: number;
  bias: number;
  mae: number;
}

export interface RollingPredictionAuditReport {
  players: number;
  meanPredictedXPts: number;
  meanActualPoints: number;
  bias: number;
  mae: number;
  byConfidence: Record<Confidence, AuditGroup>;
  byPosition: Record<Position, AuditGroup>;
  byExpectedMinutes: Record<MinutesBand, AuditGroup>;
  rows: RollingPredictionAuditRow[];
}

export interface RollingPredictionAuditResult {
  targetSeason: string;
  gameweek: number;
  deadline: string;
  predictionSnapshotId: number;
  auditSnapshotId: number;
  checksum: string;
  reused: boolean;
  report: Omit<RollingPredictionAuditReport, "rows">;
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rounded(value: number, precision = 3) {
  return Number(value.toFixed(precision));
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

function checksum(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function summary(rows: RollingPredictionAuditRow[]): AuditGroup {
  return {
    players: rows.length,
    bias: rounded(average(rows.map((row) => row.error))),
    mae: rounded(average(rows.map((row) => row.absoluteError))),
  };
}

function minutesBand(expectedMinutes: number): MinutesBand {
  if (expectedMinutes <= 0) return "ZERO";
  return expectedMinutes < 60 ? "UNDER_60" : "SIXTY_PLUS";
}

export function buildRollingPredictionAuditReport(
  projections: readonly RollingPlayerProjection[],
  gameweek: number,
  actualPointsBySeasonPlayerId: ReadonlyMap<number, number>,
): RollingPredictionAuditReport {
  const rows = projections.map((projection) => {
    const fixtures = projection.fixtures.filter(
      (fixture) => fixture.gameweek === gameweek,
    );
    const predictedXPts = rounded(
      fixtures.reduce((total, fixture) => total + fixture.xPts, 0),
      2,
    );
    const expectedMinutes = rounded(
      fixtures.reduce((total, fixture) => total + fixture.expectedMinutes, 0),
      1,
    );
    const actualPoints = actualPointsBySeasonPlayerId.get(
      projection.seasonPlayerId,
    ) ?? 0;
    const error = actualPoints - predictedXPts;
    return {
      seasonPlayerId: projection.seasonPlayerId,
      fplId: projection.fplId,
      playerName: projection.playerName,
      position: projection.position,
      confidence: projection.confidence,
      expectedMinutes,
      predictedXPts,
      actualPoints,
      error: rounded(error, 2),
      absoluteError: rounded(Math.abs(error), 2),
    };
  });
  const confidenceValues = ["HIGH", "MEDIUM", "LOW"] as const;
  const positionValues = [
    "GOALKEEPER",
    "DEFENDER",
    "MIDFIELDER",
    "FORWARD",
  ] as const;
  const minutesValues = ["ZERO", "UNDER_60", "SIXTY_PLUS"] as const;

  return {
    players: rows.length,
    meanPredictedXPts: rounded(average(rows.map((row) => row.predictedXPts))),
    meanActualPoints: rounded(average(rows.map((row) => row.actualPoints))),
    bias: rounded(average(rows.map((row) => row.error))),
    mae: rounded(average(rows.map((row) => row.absoluteError))),
    byConfidence: Object.fromEntries(
      confidenceValues.map((confidence) => [
        confidence,
        summary(rows.filter((row) => row.confidence === confidence)),
      ]),
    ) as RollingPredictionAuditReport["byConfidence"],
    byPosition: Object.fromEntries(
      positionValues.map((position) => [
        position,
        summary(rows.filter((row) => row.position === position)),
      ]),
    ) as RollingPredictionAuditReport["byPosition"],
    byExpectedMinutes: Object.fromEntries(
      minutesValues.map((band) => [
        band,
        summary(rows.filter((row) => minutesBand(row.expectedMinutes) === band)),
      ]),
    ) as RollingPredictionAuditReport["byExpectedMinutes"],
    rows,
  };
}

function parseDeadline(payload: unknown, gameweek: number): Date | null {
  if (!payload || typeof payload !== "object") return null;
  const events = (payload as Record<string, unknown>).events;
  if (!Array.isArray(events)) return null;
  const event = events.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      (candidate as Record<string, unknown>).id === gameweek,
  ) as Record<string, unknown> | undefined;
  const rawDeadline = event?.deadline_time;
  if (typeof rawDeadline !== "string") return null;
  const deadline = new Date(rawDeadline);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function isRollingPredictionPayload(
  value: unknown,
): value is RollingPredictionPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.targetSeason === "string" &&
    typeof payload.statsThroughGameweek === "number" &&
    Array.isArray(payload.horizonGameweeks) &&
    Array.isArray(payload.projections)
  );
}

export class RollingPredictionAuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async auditGameweek(input: {
    targetSeasonCode: string;
    gameweek: number;
  }): Promise<RollingPredictionAuditResult> {
    if (!Number.isInteger(input.gameweek) || input.gameweek < 1) {
      throw new Error("A positive integer gameweek is required");
    }
    const targetSeason = await this.prisma.season.findUnique({
      where: { code: input.targetSeasonCode },
      select: { id: true, code: true },
    });
    if (!targetSeason) {
      throw new Error(`Season ${input.targetSeasonCode} not found`);
    }

    const bootstrapSnapshots = await this.prisma.sourceSnapshot.findMany({
      where: {
        seasonId: targetSeason.id,
        source: "fpl",
        dataset: "bootstrap-static",
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { payload: true },
    });
    const deadline = bootstrapSnapshots
      .map((snapshot) => parseDeadline(snapshot.payload, input.gameweek))
      .find((value): value is Date => value != null);
    if (!deadline) {
      throw new Error(`GW${input.gameweek} deadline is unavailable from FPL`);
    }

    const snapshots = await this.prisma.sourceSnapshot.findMany({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: ROLLING_PREDICTION_DATASET,
        valid: true,
        fetchedAt: { lte: deadline },
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true, checksum: true, fetchedAt: true, payload: true },
    });
    const predictionSnapshot = snapshots.find((snapshot) => {
      if (!isRollingPredictionPayload(snapshot.payload)) return false;
      const payload = snapshot.payload;
      return (
        payload.targetSeason === targetSeason.code &&
        payload.statsThroughGameweek < input.gameweek &&
        payload.horizonGameweeks.includes(input.gameweek)
      );
    });
    if (!predictionSnapshot || !isRollingPredictionPayload(predictionSnapshot.payload)) {
      throw new Error(
        `No valid rolling prediction snapshot exists before the GW${input.gameweek} deadline`,
      );
    }
    const prediction = predictionSnapshot.payload;
    const seasonPlayerIds = prediction.projections.map(
      (projection) => projection.seasonPlayerId,
    );
    if (new Set(seasonPlayerIds).size !== seasonPlayerIds.length) {
      throw new Error("Prediction snapshot contains duplicate season players");
    }

    const [fixtures, eventStats, registrationCount] = await Promise.all([
      this.prisma.match.findMany({
        where: { seasonId: targetSeason.id, gameweek: input.gameweek },
        select: { id: true, finished: true },
      }),
      this.prisma.fPLPlayerStats.groupBy({
        by: ["seasonPlayerId"],
        where: { seasonId: targetSeason.id, gameweek: input.gameweek },
        _sum: { totalPoints: true },
      }),
      this.prisma.seasonPlayer.count({
        where: { seasonId: targetSeason.id, id: { in: seasonPlayerIds } },
      }),
    ]);
    if (fixtures.length !== 10 || fixtures.some((fixture) => !fixture.finished)) {
      throw new Error(
        `GW${input.gameweek} audit waits for all 10 finished fixtures (${fixtures.filter((fixture) => fixture.finished).length}/${fixtures.length})`,
      );
    }
    if (eventStats.length < fixtures.length * 20) {
      throw new Error(
        `GW${input.gameweek} audit requires complete official player-fixture stats (${eventStats.length}/${fixtures.length * 20} minimum)`,
      );
    }
    if (registrationCount !== seasonPlayerIds.length) {
      throw new Error("Prediction snapshot contains unknown season players");
    }

    const actualPoints = new Map(
      eventStats.map((stat) => [
        stat.seasonPlayerId,
        stat._sum.totalPoints ?? 0,
      ]),
    );
    const report = buildRollingPredictionAuditReport(
      prediction.projections,
      input.gameweek,
      actualPoints,
    );
    const payload = {
      schemaVersion: 1,
      auditVersion: ROLLING_PREDICTION_AUDIT_VERSION,
      targetSeason: targetSeason.code,
      gameweek: input.gameweek,
      deadline: deadline.toISOString(),
      predictionSnapshot: {
        id: predictionSnapshot.id,
        checksum: predictionSnapshot.checksum,
        fetchedAt: predictionSnapshot.fetchedAt.toISOString(),
        statsThroughGameweek: prediction.statsThroughGameweek,
      },
      publicationReady: false,
      activationRequested: false,
      completedFixtures: fixtures.length,
      officialPlayerFixtureRows: eventStats.length,
      report,
    };
    const payloadChecksum = checksum(payload);
    const existing = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: ROLLING_PREDICTION_AUDIT_DATASET,
        checksum: payloadChecksum,
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true },
    });
    const audit = existing
      ? { id: existing.id, reused: true }
      : {
          id: (
            await this.prisma.sourceSnapshot.create({
              data: {
                seasonId: targetSeason.id,
                source: "internal",
                dataset: ROLLING_PREDICTION_AUDIT_DATASET,
                season: targetSeason.code,
                sourceSeasonId: ROLLING_PREDICTION_AUDIT_VERSION,
                gameweek: input.gameweek,
                batchId: randomUUID(),
                schemaVersion: 1,
                fetchedAt: new Date(),
                checksum: payloadChecksum,
                valid: true,
                recordCount: report.players,
                payload: payload as unknown as Prisma.InputJsonValue,
              },
            })
          ).id,
          reused: false,
        };
    const { rows: _rows, ...reportSummary } = report;
    return {
      targetSeason: targetSeason.code,
      gameweek: input.gameweek,
      deadline: deadline.toISOString(),
      predictionSnapshotId: predictionSnapshot.id,
      auditSnapshotId: audit.id,
      checksum: payloadChecksum,
      reused: audit.reused,
      report: reportSummary,
    };
  }
}
