import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, PriorConfidence } from "@prisma/client";
import { z } from "zod";
import {
  assessPreseasonPlayer,
  type PlayerReliability,
} from "@/lib/services/preseasonDecisionModel";
import {
  buildTeamStrengthPriors,
  resolveOpponentStrengthPrior,
  type TeamStrengthPrior,
} from "@/lib/services/historicalWalkForwardService";
import {
  isActiveForGameweek,
  toAppliedPreseasonOverride,
  type AppliedPreseasonOverride,
} from "@/lib/services/preseasonOverrideService";
import {
  PRESEASON_MINUTES_TRACKER_DATASET,
  PRESEASON_MINUTES_TRACKER_SOURCE,
  trackerEvidenceFromSnapshot,
  type PreseasonMinutesTrackerEvidence,
} from "@/lib/services/preseasonMinutesTrackerService";
import { constrainTeamLineupProbabilities } from "@/lib/services/teamLineupCapacityService";

export const SEASON_PREDICTION_PUBLICATION_FLAG =
  "season_prediction_publication_enabled";
export const GW1_PRESEASON_PROJECTION_VERSION = "gw1-preseason-v5";

const readinessProfileSchema = z.object({
  seasonPlayerId: z.number().int().positive(),
  fplId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  playerName: z.string().min(1),
  team: z.string().min(1),
  position: z.enum(["GOALKEEPER", "DEFENDER", "MIDFIELDER", "FORWARD"]),
  price: z.number().nonnegative(),
  availability: z.object({
    status: z.string().min(1),
    chanceOfPlaying: z.number().int().min(0).max(100).nullable(),
  }),
  gw1Fixtures: z.array(
    z.object({
      fixtureId: z.number().int().positive(),
      opponent: z.string().min(1),
      isHome: z.boolean(),
    }),
  ),
  provenance: z.enum(["PLAYER_PRIOR", "POSITION_BASELINE"]),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  confidenceScore: z.number().min(0).max(1),
  uncertaintyReasons: z.array(z.string()),
  priorMetrics: z.object({
    xG90: z.number().nonnegative().nullable(),
    xA90: z.number().nonnegative().nullable(),
    touches90: z.number().nonnegative().nullable(),
    keyPasses90: z.number().nonnegative().nullable(),
    carries90: z.number().nonnegative().nullable(),
    defconActions90: z.number().nonnegative().nullable(),
    clearances90: z.number().nonnegative().nullable(),
  }),
  priorUsage: z.object({
    minutes: z.number().int().nonnegative(),
    appearances: z.number().int().nonnegative(),
    starts: z.number().int().nonnegative().nullable(),
  }),
});

export const readinessPayloadSchema = z.object({
  schemaVersion: z.literal(4),
  targetSeason: z.string().min(1),
  priorVersion: z.string().min(1),
  publicationReady: z.literal(false),
  activationRequested: z.literal(false),
  ready: z.literal(true),
  checks: z.record(z.string(), z.boolean()),
  profiles: z.array(readinessProfileSchema).min(1),
});

export type Gw1PreseasonProfile = z.infer<typeof readinessProfileSchema>;

export interface Gw1PreseasonFixtureProjection {
  fixtureId: number;
  opponent: string;
  isHome: boolean;
  expectedMinutes: number;
  startProbability: number;
  xPts: number;
  range: {
    lower: number;
    upper: number;
    label: "INDICATIVE";
  };
  breakdown: {
    appearance: number;
    attacking: number;
    cleanSheet: number;
    goalsConcededPenalty: number;
    defense: number;
    defcon: number;
    saves: number;
    bonus: number;
  };
  opponentStrength: {
    source: TeamStrengthPrior["source"];
    sourceSeason: string | null;
    sourceMatches: number;
    defensiveVulnerabilityMultiplier: number;
  };
  teamStrength: {
    source: TeamStrengthPrior["source"];
    sourceSeason: string | null;
    sourceMatches: number;
    attackMultiplier: number;
    defensiveVulnerabilityMultiplier: number;
  };
  manualOverride: AppliedPreseasonOverride | null;
  preseasonMinutesEvidence: PreseasonMinutesTrackerEvidence | null;
}

export interface Gw1PreseasonProjection {
  seasonPlayerId: number;
  fplId: number;
  playerName: string;
  team: string;
  position: Gw1PreseasonProfile["position"];
  price: number;
  confidence: PriorConfidence;
  confidenceScore: number;
  provenance: Gw1PreseasonProfile["provenance"];
  estimateStatus: "PREVIEW_ONLY" | "PARTIAL" | "UNAVAILABLE";
  limitations: string[];
  evidence: Gw1PreseasonProfile["priorMetrics"];
  reliability: PlayerReliability;
  fixtures: Gw1PreseasonFixtureProjection[];
  totalXPts: number;
  totalRange: {
    lower: number;
    upper: number;
    label: "INDICATIVE";
  };
}

function clamp(value: number, lower: number, upper: number) {
  return Math.max(lower, Math.min(upper, value));
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

export function preseasonAvailabilityProbability(
  profile: Gw1PreseasonProfile,
): number {
  if (profile.availability.chanceOfPlaying != null) {
    return profile.availability.chanceOfPlaying / 100;
  }
  return profile.availability.status.toLowerCase() === "a" ? 1 : 0.65;
}

export function preseasonStartGivenAvailableProbability(
  profile: Gw1PreseasonProfile,
): number {
  return assessPreseasonPlayer({
    id: profile.seasonPlayerId,
    team: profile.team,
    position: profile.position,
    price: profile.price,
    projectedPoints: 0,
    availability: profile.availability,
    confidence: profile.confidence,
    confidenceScore: profile.confidenceScore,
    uncertaintyReasons: profile.uncertaintyReasons,
    priorUsage: profile.priorUsage,
    priorMetrics: profile.priorMetrics,
  }).reliability.startGivenAvailableProbability;
}

function goalPoints(position: Gw1PreseasonProfile["position"]): number {
  if (position === "GOALKEEPER" || position === "DEFENDER") return 6;
  if (position === "MIDFIELDER") return 5;
  return 4;
}

function poissonCdf(lambda: number, k: number): number {
  if (lambda <= 0) return k >= 0 ? 1 : 0;
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let index = 0; index <= k; index += 1) {
    if (index > 0) term *= lambda / index;
    sum += term;
  }
  return Math.min(1, sum);
}

/**
 * DEFCON is earned by reaching its action threshold. Expected minutes scale
 * the action rate directly; it has no separate 60-minute eligibility gate.
 */
export function expectedPreseasonDefconPoints(input: {
  position: Gw1PreseasonProfile["position"];
  defconActions90: number | null;
  expectedMinutes: number;
  opponentAttackMultiplier: number;
  teamDefensiveVulnerabilityMultiplier: number;
  isHome: boolean;
}): number {
  if (
    input.position === "GOALKEEPER" ||
    input.defconActions90 == null ||
    input.expectedMinutes <= 0
  ) {
    return 0;
  }
  const threshold = input.position === "DEFENDER" ? 10 : 12;
  const venueExposure = input.isHome ? 0.96 : 1.04;
  const opponentExposure = clamp(
    Math.pow(
      input.opponentAttackMultiplier *
        input.teamDefensiveVulnerabilityMultiplier,
      0.25,
    ) * venueExposure,
    0.85,
    1.15,
  );
  const lambda =
    input.defconActions90 * (input.expectedMinutes / 90) * opponentExposure;
  return 2 * (1 - poissonCdf(lambda, threshold - 1));
}

export function probabilityOfSixtyMinutes(input: {
  expectedMinutes: number;
  startProbability: number;
}) {
  if (input.expectedMinutes <= 0 || input.startProbability <= 0) return 0;
  return clamp(
    Math.min(input.startProbability * 0.92, input.expectedMinutes / 60),
    0,
    1,
  );
}

export function expectedFplAppearancePoints(input: {
  expectedMinutes: number;
  startProbability: number;
}) {
  if (input.expectedMinutes <= 0 || input.startProbability <= 0) return 0;
  const expectedStarterMinutes = input.startProbability * 76;
  const substituteAppearanceProbability = clamp(
    (input.expectedMinutes - expectedStarterMinutes) / 14,
    0,
    1 - input.startProbability,
  );
  const probabilityOfAppearance = clamp(
    input.startProbability + substituteAppearanceProbability,
    0,
    1,
  );
  return probabilityOfAppearance + probabilityOfSixtyMinutes(input);
}

function expectedGoalsConcededPenalty(expectedGoalsConceded: number): number {
  let expectedPenalty = 0;
  let probability = Math.exp(-expectedGoalsConceded);
  for (let goals = 0; goals <= 12; goals += 1) {
    if (goals > 0) probability *= expectedGoalsConceded / goals;
    expectedPenalty += Math.floor(goals / 2) * probability;
  }
  return expectedPenalty;
}

function cleanSheetPoints(position: Gw1PreseasonProfile["position"]): number {
  if (position === "GOALKEEPER" || position === "DEFENDER") return 4;
  if (position === "MIDFIELDER") return 1;
  return 0;
}

export function expectedPreseasonDefensePoints(input: {
  position: Gw1PreseasonProfile["position"];
  expectedMinutes: number;
  startProbability: number;
  opponentAttackMultiplier: number;
  teamDefensiveVulnerabilityMultiplier: number;
  isHome: boolean;
  leagueGoalsPerTeamMatch: number;
}) {
  if (input.position === "FORWARD" || input.expectedMinutes <= 0) {
    return { cleanSheet: 0, goalsConcededPenalty: 0, total: 0 };
  }
  const opponentVenueFactor = input.isHome ? 0.94 : 1.06;
  const expectedGoalsConceded = clamp(
    input.leagueGoalsPerTeamMatch *
      input.opponentAttackMultiplier *
      input.teamDefensiveVulnerabilityMultiplier *
      opponentVenueFactor,
    0.55,
    2.2,
  );
  const probabilityOfCleanSheet = Math.exp(-expectedGoalsConceded);
  const sixtyMinuteProbability = probabilityOfSixtyMinutes(input);
  const cleanSheet =
    cleanSheetPoints(input.position) *
    probabilityOfCleanSheet *
    sixtyMinuteProbability;
  const goalsConcededPenalty =
    input.position === "GOALKEEPER" || input.position === "DEFENDER"
      ? expectedGoalsConcededPenalty(expectedGoalsConceded) *
        (input.expectedMinutes / 90)
      : 0;
  return {
    cleanSheet,
    goalsConcededPenalty,
    total: cleanSheet - goalsConcededPenalty,
  };
}

/**
 * A deliberately bounded uncertainty band for an uncalibrated pre-season
 * estimate. It is not presented as a statistical confidence interval until
 * post-GW1 calibration exists; it communicates the effect of limited evidence
 * and role uncertainty without implying false precision.
 */
export function indicativePreseasonRange(input: {
  xPts: number;
  confidenceScore: number;
  reliabilityScore: number;
}) {
  if (input.xPts <= 0) {
    return { lower: 0, upper: 0, label: "INDICATIVE" as const };
  }
  const uncertainty =
    0.16 +
    (1 - input.confidenceScore) * 0.22 +
    (1 - input.reliabilityScore / 100) * 0.16;
  const margin = Math.min(
    Math.max(0.65, input.xPts * uncertainty),
    Math.max(1.8, input.xPts * 0.55),
  );
  return {
    lower: Number(Math.max(0, input.xPts - margin).toFixed(2)),
    upper: Number((input.xPts + margin).toFixed(2)),
    label: "INDICATIVE" as const,
  };
}

/**
 * Conservative GW1-only estimate. Team strength is a bounded historical prior;
 * it is not current-season form. Bonus, saves and live role changes remain out.
 */
export function projectGw1PreseasonProfile(
  profile: Gw1PreseasonProfile,
  context: {
    opponentStrengthByFixtureId?: Map<number, TeamStrengthPrior>;
    teamStrengthByTeamName?: Map<string, TeamStrengthPrior>;
    leagueGoalsPerTeamMatch?: number;
    sourceSeason?: string;
    manualOverride?: AppliedPreseasonOverride | null;
    preseasonMinutesEvidence?: PreseasonMinutesTrackerEvidence | null;
    startProbabilityOverride?: number | null;
    substituteAppearanceProbabilityOverride?: number | null;
    currentSeasonEvidence?: boolean;
  } = {},
): Gw1PreseasonProjection {
  const reliability = assessPreseasonPlayer({
    id: profile.seasonPlayerId,
    team: profile.team,
    position: profile.position,
    price: profile.price,
    projectedPoints: 0,
    availability: profile.availability,
    confidence: profile.confidence,
    confidenceScore: profile.confidenceScore,
    uncertaintyReasons: profile.uncertaintyReasons,
    priorUsage: profile.priorUsage,
    priorMetrics: profile.priorMetrics,
  }).reliability;
  const limitations = new Set(profile.uncertaintyReasons);
  if (!context.currentSeasonEvidence) {
    limitations.add("NO_CURRENT_SEASON_FORM");
    limitations.add("NO_CURRENT_SEASON_TEAM_STRENGTH");
  }
  limitations.add("NO_BONUS_OR_SAVE_MODEL");

  const manualOverride = context.manualOverride ?? null;
  const preseasonMinutesEvidence = context.preseasonMinutesEvidence ?? null;
  const baseAvailability = preseasonAvailabilityProbability(profile);
  const availability =
    manualOverride?.availabilityCap == null
      ? baseAvailability
      : Math.min(baseAvailability, manualOverride.availabilityCap / 100);
  if (
    profile.availability.chanceOfPlaying == null &&
    profile.availability.status.toLowerCase() !== "a"
  ) {
    limitations.add("AVAILABILITY_NOT_NUMERIC");
  }
  const availabilityAdjustedStartProbability =
    (context.startProbabilityOverride == null
      ? reliability.startGivenAvailableProbability
      : clamp(context.startProbabilityOverride, 0, 0.98)) * availability;
  const startProbabilityBeforeMinutesCap =
    manualOverride?.startProbabilityCap == null
      ? availabilityAdjustedStartProbability
      : Math.min(
          availabilityAdjustedStartProbability,
          manualOverride.startProbabilityCap,
        );
  const substituteAppearanceProbability = clamp(
    context.substituteAppearanceProbabilityOverride ??
      (profile.position === "GOALKEEPER"
        ? 0
        : 1 - startProbabilityBeforeMinutesCap),
    0,
    1 - startProbabilityBeforeMinutesCap,
  );
  const uncappedExpectedMinutes =
    availability === 0
      ? 0
      : clamp(
          startProbabilityBeforeMinutesCap * 76 +
            substituteAppearanceProbability * 14,
          0,
          90,
        );
  const expectedMinutes = Math.min(
    uncappedExpectedMinutes,
    manualOverride?.expectedMinutesCap ?? 90,
    preseasonMinutesEvidence?.expectedMinutesCap ?? 90,
  );
  // A minutes cap also limits the chance to start; otherwise a player could
  // receive two appearance points while their expected minutes are zero.
  const startProbability =
    expectedMinutes <= 0
      ? 0
      : Math.min(startProbabilityBeforeMinutesCap, expectedMinutes / 76);
  if (manualOverride) limitations.add(`MANUAL_${manualOverride.kind}`);
  if (preseasonMinutesEvidence)
    limitations.add("PRESEASON_MINUTES_TRACKER_EVIDENCE");
  const minutesFactor = expectedMinutes / 90;
  const hasXg = profile.priorMetrics.xG90 != null;
  const hasXa = profile.priorMetrics.xA90 != null;
  if (!hasXg) limitations.add("MISSING_XG90_NO_GOAL_ESTIMATE");
  if (!hasXa) limitations.add("MISSING_XA90_NO_ASSIST_ESTIMATE");

  const fixtures = profile.gw1Fixtures.map((fixture) => {
    const venueFactor = fixture.isHome ? 1.04 : 0.96;
    const opponentStrength =
      context.opponentStrengthByFixtureId?.get(fixture.fixtureId) ??
      resolveOpponentStrengthPrior(
        { leagueGoalsPerTeamMatch: 1.35, byTeamId: new Map() },
        null,
      );
    const opponentMultiplier =
      opponentStrength.defensiveVulnerabilityMultiplier;
    const teamStrength =
      context.teamStrengthByTeamName?.get(profile.team) ??
      resolveOpponentStrengthPrior(
        { leagueGoalsPerTeamMatch: 1.35, byTeamId: new Map() },
        null,
      );
    if (opponentStrength.source === "NEUTRAL") {
      limitations.add("NEUTRAL_OPPONENT_STRENGTH");
    }
    if (teamStrength.source === "NEUTRAL") {
      limitations.add("NEUTRAL_TEAM_STRENGTH");
    }
    const appearance = expectedFplAppearancePoints({
      expectedMinutes,
      startProbability,
    });
    const teamAttackMultiplier = Math.pow(teamStrength.attackMultiplier, 0.35);
    const attacking =
      (profile.priorMetrics.xG90 ?? 0) *
        minutesFactor *
        venueFactor *
        teamAttackMultiplier *
        opponentMultiplier *
        goalPoints(profile.position) +
      (profile.priorMetrics.xA90 ?? 0) *
        minutesFactor *
        venueFactor *
        teamAttackMultiplier *
        opponentMultiplier *
        3;
    const defense = expectedPreseasonDefensePoints({
      position: profile.position,
      expectedMinutes,
      startProbability,
      opponentAttackMultiplier: opponentStrength.attackMultiplier,
      teamDefensiveVulnerabilityMultiplier:
        teamStrength.defensiveVulnerabilityMultiplier,
      isHome: fixture.isHome,
      leagueGoalsPerTeamMatch: context.leagueGoalsPerTeamMatch ?? 1.35,
    });
    const defcon = expectedPreseasonDefconPoints({
      position: profile.position,
      defconActions90: profile.priorMetrics.defconActions90,
      expectedMinutes,
      opponentAttackMultiplier: opponentStrength.attackMultiplier,
      teamDefensiveVulnerabilityMultiplier:
        teamStrength.defensiveVulnerabilityMultiplier,
      isHome: fixture.isHome,
    });
    if (
      profile.position !== "GOALKEEPER" &&
      profile.priorMetrics.defconActions90 == null
    ) {
      limitations.add("MISSING_DEFCON_ACTION_RATE");
    }
    const xPts =
      availability === 0 ? 0 : appearance + attacking + defense.total + defcon;
    const range = indicativePreseasonRange({
      xPts,
      confidenceScore: profile.confidenceScore,
      reliabilityScore: reliability.score,
    });
    return {
      fixtureId: fixture.fixtureId,
      opponent: fixture.opponent,
      isHome: fixture.isHome,
      expectedMinutes: Number(expectedMinutes.toFixed(1)),
      startProbability: Number(startProbability.toFixed(3)),
      xPts: Number(xPts.toFixed(2)),
      range,
      breakdown: {
        appearance: Number((availability === 0 ? 0 : appearance).toFixed(2)),
        attacking: Number((availability === 0 ? 0 : attacking).toFixed(2)),
        cleanSheet: Number(
          (availability === 0 ? 0 : defense.cleanSheet).toFixed(2),
        ),
        goalsConcededPenalty: Number(
          (availability === 0 ? 0 : defense.goalsConcededPenalty).toFixed(2),
        ),
        defense: Number((availability === 0 ? 0 : defense.total).toFixed(2)),
        defcon: Number((availability === 0 ? 0 : defcon).toFixed(2)),
        saves: 0,
        bonus: 0,
      },
      opponentStrength: {
        source: opponentStrength.source,
        sourceSeason:
          opponentStrength.source === "HISTORICAL"
            ? (context.sourceSeason ?? null)
            : null,
        sourceMatches: opponentStrength.matches,
        defensiveVulnerabilityMultiplier: opponentMultiplier,
      },
      teamStrength: {
        source: teamStrength.source,
        sourceSeason:
          teamStrength.source === "HISTORICAL"
            ? (context.sourceSeason ?? null)
            : null,
        sourceMatches: teamStrength.matches,
        attackMultiplier: teamStrength.attackMultiplier,
        defensiveVulnerabilityMultiplier:
          teamStrength.defensiveVulnerabilityMultiplier,
      },
      manualOverride,
      preseasonMinutesEvidence,
    };
  });
  const estimateStatus =
    availability === 0
      ? "UNAVAILABLE"
      : hasXg && hasXa
        ? "PREVIEW_ONLY"
        : "PARTIAL";
  const totalXPts = Number(
    fixtures.reduce((sum, fixture) => sum + fixture.xPts, 0).toFixed(2),
  );
  const totalRange = {
    lower: Number(
      fixtures
        .reduce((sum, fixture) => sum + fixture.range.lower, 0)
        .toFixed(2),
    ),
    upper: Number(
      fixtures
        .reduce((sum, fixture) => sum + fixture.range.upper, 0)
        .toFixed(2),
    ),
    label: "INDICATIVE" as const,
  };
  return {
    seasonPlayerId: profile.seasonPlayerId,
    fplId: profile.fplId,
    playerName: profile.playerName,
    team: profile.team,
    position: profile.position,
    price: profile.price,
    confidence: profile.confidence,
    confidenceScore: profile.confidenceScore,
    provenance: profile.provenance,
    estimateStatus,
    limitations: [...limitations].sort(),
    evidence: profile.priorMetrics,
    reliability,
    fixtures,
    totalXPts,
    totalRange,
  };
}

export function parseSeasonPredictionPublicationFlag(
  value: string | null | undefined,
): boolean {
  return value?.trim().toLowerCase() === "true";
}

export interface Gw1PreseasonPreviewResult {
  targetSeason: string;
  readinessSnapshotId: number;
  previewSnapshotId: number;
  checksum: string;
  reused: boolean;
  publicationEnabled: boolean;
  activationRequested: false;
  projections: number;
  partialProjections: number;
  unavailableProjections: number;
}

const previewProjectionSchema = z.object({
  seasonPlayerId: z.number().int().positive(),
  fplId: z.number().int().positive(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  totalXPts: z.number().nonnegative(),
});

const previewPayloadSchema = z.object({
  projectionVersion: z.literal(GW1_PRESEASON_PROJECTION_VERSION),
  targetSeason: z.string().min(1),
  gameweek: z.literal(1),
  publicationReady: z.literal(false),
  publicationEnabled: z.literal(false),
  activationRequested: z.literal(false),
  projections: z.array(previewProjectionSchema).min(1),
});

export interface Gw1AuditRow {
  seasonPlayerId: number;
  fplId: number;
  confidence: PriorConfidence;
  predictedXPts: number;
  actualPoints: number;
  error: number;
  absoluteError: number;
}

export interface Gw1AuditReport {
  players: number;
  meanPredictedXPts: number;
  meanActualPoints: number;
  bias: number;
  mae: number;
  byConfidence: Record<
    PriorConfidence,
    { players: number; bias: number; mae: number }
  >;
  rows: Gw1AuditRow[];
}

function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Produces an auditable comparison; it never calibrates or changes the model. */
export function buildGw1AuditReport(
  projections: Array<z.infer<typeof previewProjectionSchema>>,
  actualPointsBySeasonPlayerId: Map<number, number>,
): Gw1AuditReport {
  const rows = projections.map((projection) => {
    const actualPoints =
      actualPointsBySeasonPlayerId.get(projection.seasonPlayerId) ?? 0;
    const error = actualPoints - projection.totalXPts;
    return {
      seasonPlayerId: projection.seasonPlayerId,
      fplId: projection.fplId,
      confidence: projection.confidence,
      predictedXPts: projection.totalXPts,
      actualPoints,
      error: Number(error.toFixed(2)),
      absoluteError: Number(Math.abs(error).toFixed(2)),
    };
  });
  const byConfidence = Object.fromEntries(
    (["HIGH", "MEDIUM", "LOW"] as PriorConfidence[]).map((confidence) => {
      const group = rows.filter((row) => row.confidence === confidence);
      return [
        confidence,
        {
          players: group.length,
          bias: Number(average(group.map((row) => row.error)).toFixed(3)),
          mae: Number(
            average(group.map((row) => row.absoluteError)).toFixed(3),
          ),
        },
      ];
    }),
  ) as Gw1AuditReport["byConfidence"];
  return {
    players: rows.length,
    meanPredictedXPts: Number(
      average(rows.map((row) => row.predictedXPts)).toFixed(3),
    ),
    meanActualPoints: Number(
      average(rows.map((row) => row.actualPoints)).toFixed(3),
    ),
    bias: Number(average(rows.map((row) => row.error)).toFixed(3)),
    mae: Number(average(rows.map((row) => row.absoluteError)).toFixed(3)),
    byConfidence,
    rows,
  };
}

export interface Gw1PreseasonAuditResult {
  targetSeason: string;
  previewSnapshotId: number;
  auditSnapshotId: number;
  checksum: string;
  reused: boolean;
  report: Omit<Gw1AuditReport, "rows">;
}

export class SeasonPredictionPublicationService {
  constructor(private readonly prisma: PrismaClient) {}

  async buildGw1Preview(input: {
    targetSeasonCode: string;
  }): Promise<Gw1PreseasonPreviewResult> {
    const targetSeason = await this.prisma.season.findUnique({
      where: { code: input.targetSeasonCode },
      select: { id: true, code: true, status: true, isCurrent: true },
    });
    if (!targetSeason)
      throw new Error(`Season ${input.targetSeasonCode} not found`);
    if (targetSeason.status !== "UPCOMING" || targetSeason.isCurrent) {
      throw new Error(
        "Pre-season preview requires an UPCOMING, non-current season",
      );
    }
    const readinessSnapshot = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: "gw1-readiness",
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true, checksum: true, payload: true },
    });
    if (!readinessSnapshot)
      throw new Error("Valid GW1 readiness snapshot is required");
    const readiness = readinessPayloadSchema.parse(readinessSnapshot.payload);
    if (readiness.targetSeason !== targetSeason.code) {
      throw new Error("Readiness snapshot belongs to another season");
    }
    if (!Object.values(readiness.checks).every(Boolean)) {
      throw new Error("Readiness snapshot has failed coverage checks");
    }
    const [
      publicationFlag,
      priorConfig,
      targetTeams,
      overrides,
      trackerSnapshot,
    ] = await Promise.all([
      this.prisma.appConfig.findUnique({
        where: { key: SEASON_PREDICTION_PUBLICATION_FLAG },
        select: { value: true },
      }),
      this.prisma.predictionConfigVersion.findUnique({
        where: { version: readiness.priorVersion },
        select: {
          sourceSeasonId: true,
          sourceSeason: { select: { code: true } },
        },
      }),
      this.prisma.seasonTeam.findMany({
        where: { seasonId: targetSeason.id },
        select: { teamId: true, shortName: true },
      }),
      this.prisma.preseasonOverride.findMany({
        where: {
          seasonId: targetSeason.id,
          active: true,
          appliesThroughGameweek: { gte: 1 },
        },
      }),
      this.prisma.sourceSnapshot.findFirst({
        where: {
          seasonId: targetSeason.id,
          source: PRESEASON_MINUTES_TRACKER_SOURCE,
          dataset: PRESEASON_MINUTES_TRACKER_DATASET,
          valid: true,
        },
        orderBy: { fetchedAt: "desc" },
        select: { id: true, checksum: true, fetchedAt: true, payload: true },
      }),
    ]);
    if (!priorConfig) {
      throw new Error(
        `Prior configuration ${readiness.priorVersion} not found`,
      );
    }
    const sourceFixtures = await this.prisma.match.findMany({
      where: { seasonId: priorConfig.sourceSeasonId, finished: true },
      select: {
        gameweek: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        finished: true,
      },
    });
    const targetTeamIdByShortName = new Map(
      targetTeams.map((team) => [team.shortName, team.teamId]),
    );
    const sourceTeamPriors = buildTeamStrengthPriors(sourceFixtures);
    const opponentStrengthByFixtureId = new Map<number, TeamStrengthPrior>();
    for (const profile of readiness.profiles) {
      for (const fixture of profile.gw1Fixtures) {
        const opponentTeamId = targetTeamIdByShortName.get(fixture.opponent);
        opponentStrengthByFixtureId.set(
          fixture.fixtureId,
          resolveOpponentStrengthPrior(sourceTeamPriors, opponentTeamId),
        );
      }
    }
    const teamStrengthByTeamName = new Map(
      targetTeams.map((team) => [
        team.shortName,
        resolveOpponentStrengthPrior(sourceTeamPriors, team.teamId),
      ]),
    );
    const publicationEnabled = parseSeasonPredictionPublicationFlag(
      publicationFlag?.value,
    );
    const overridesBySeasonPlayerId = new Map(
      overrides
        .filter((override) => isActiveForGameweek(override, 1))
        .map((override) => [
          override.seasonPlayerId,
          toAppliedPreseasonOverride(override),
        ]),
    );
    const trackerEvidenceBySeasonPlayerId = trackerSnapshot
      ? trackerEvidenceFromSnapshot({
          payload: trackerSnapshot.payload,
          fetchedAt: trackerSnapshot.fetchedAt,
          sourceUrl:
            "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxLUOCYma3wQTzz7r8rliQgktSmMzgeeWS2eG3KYnEdFPQwbArhGaN3I2vz2Nr8lD_omwqrCjPsAmb/pubhtml?widget=true&headers=false",
          targetSeasonCode: targetSeason.code,
        })
      : new Map<number, PreseasonMinutesTrackerEvidence>();
    const constrainedLineupsBySeasonPlayerId = constrainTeamLineupProbabilities(
      readiness.profiles.map((profile) => {
        const manualOverride = overridesBySeasonPlayerId.get(
          profile.seasonPlayerId,
        );
        const availability =
          manualOverride?.availabilityCap == null
            ? preseasonAvailabilityProbability(profile)
            : Math.min(
                preseasonAvailabilityProbability(profile),
                manualOverride.availabilityCap / 100,
              );
        const startGivenAvailable =
          preseasonStartGivenAvailableProbability(profile);
        const rawStartProbability = Math.min(
          availability * startGivenAvailable,
          manualOverride?.startProbabilityCap ?? 1,
        );
        return {
          seasonPlayerId: profile.seasonPlayerId,
          team: profile.team,
          position: profile.position,
          startProbability: rawStartProbability,
          substituteAppearanceProbability:
            profile.position === "GOALKEEPER"
              ? 0
              : availability * (1 - startGivenAvailable) * 0.55,
        };
      }),
    );
    const predictions = readiness.profiles
      .map((profile) => {
        const manualOverride = overridesBySeasonPlayerId.get(
          profile.seasonPlayerId,
        );
        const availability =
          manualOverride?.availabilityCap == null
            ? preseasonAvailabilityProbability(profile)
            : Math.min(
                preseasonAvailabilityProbability(profile),
                manualOverride.availabilityCap / 100,
              );
        const constrainedLineup = constrainedLineupsBySeasonPlayerId.get(
          profile.seasonPlayerId,
        );
        return projectGw1PreseasonProfile(profile, {
          opponentStrengthByFixtureId,
          teamStrengthByTeamName,
          leagueGoalsPerTeamMatch: sourceTeamPriors.leagueGoalsPerTeamMatch,
          sourceSeason: priorConfig.sourceSeason.code,
          manualOverride,
          preseasonMinutesEvidence: trackerEvidenceBySeasonPlayerId.get(
            profile.seasonPlayerId,
          ),
          startProbabilityOverride:
            availability > 0
              ? (constrainedLineup?.startProbability ?? 0) / availability
              : 0,
          substituteAppearanceProbabilityOverride:
            constrainedLineup?.substituteAppearanceProbability ?? 0,
        });
      })
      .sort(
        (left, right) =>
          right.totalXPts - left.totalXPts || left.fplId - right.fplId,
      );
    const payload = {
      schemaVersion: 1,
      projectionVersion: GW1_PRESEASON_PROJECTION_VERSION,
      targetSeason: targetSeason.code,
      gameweek: 1,
      readinessSnapshot: {
        id: readinessSnapshot.id,
        checksum: readinessSnapshot.checksum,
      },
      publicationReady: false,
      publicationEnabled: false,
      activationRequested: false,
      preseasonOverrides: [...overridesBySeasonPlayerId.entries()]
        .map(([seasonPlayerId, override]) => ({ seasonPlayerId, override }))
        .sort((left, right) => left.seasonPlayerId - right.seasonPlayerId),
      preseasonMinutesTracker: trackerSnapshot
        ? {
            id: trackerSnapshot.id,
            checksum: trackerSnapshot.checksum,
            fetchedAt: trackerSnapshot.fetchedAt,
            appliedPlayers: trackerEvidenceBySeasonPlayerId.size,
          }
        : null,
      methodology:
        "Pre-season prior preview: availability, historical player and bounded prior-season team priors, venue, clean-sheet, conceded-goal and DEFCON components. Google Sheets pre-season minutes use a weighted two-match recent-minutes cap and may only lower expected minutes; they never manufacture a positive xPts increase. Confirmed manual preseason evidence may also only cap availability, starts or minutes. Bonus and save components remain excluded. Promoted or otherwise unmatched teams receive neutral priors.",
      projections: predictions,
    };
    const payloadChecksum = checksum(payload);
    const existing = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: "gw1-preseason-projection-preview",
        checksum: payloadChecksum,
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true },
    });
    const preview = existing
      ? { id: existing.id, reused: true }
      : {
          id: (
            await this.prisma.sourceSnapshot.create({
              data: {
                seasonId: targetSeason.id,
                source: "internal",
                dataset: "gw1-preseason-projection-preview",
                season: targetSeason.code,
                sourceSeasonId: readiness.priorVersion,
                gameweek: 1,
                batchId: randomUUID(),
                schemaVersion: 1,
                fetchedAt: new Date(),
                checksum: payloadChecksum,
                valid: true,
                recordCount: predictions.length,
                payload: payload as unknown as Prisma.InputJsonValue,
              },
            })
          ).id,
          reused: false,
        };
    return {
      targetSeason: targetSeason.code,
      readinessSnapshotId: readinessSnapshot.id,
      previewSnapshotId: preview.id,
      checksum: payloadChecksum,
      reused: preview.reused,
      publicationEnabled,
      activationRequested: false,
      projections: predictions.length,
      partialProjections: predictions.filter(
        (projection) => projection.estimateStatus === "PARTIAL",
      ).length,
      unavailableProjections: predictions.filter(
        (projection) => projection.estimateStatus === "UNAVAILABLE",
      ).length,
    };
  }

  async auditGw1Preview(input: {
    targetSeasonCode: string;
  }): Promise<Gw1PreseasonAuditResult> {
    const targetSeason = await this.prisma.season.findUnique({
      where: { code: input.targetSeasonCode },
      select: { id: true, code: true },
    });
    if (!targetSeason)
      throw new Error(`Season ${input.targetSeasonCode} not found`);
    const previewSnapshot = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: "gw1-preseason-projection-preview",
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true, checksum: true, payload: true },
    });
    if (!previewSnapshot)
      throw new Error("GW1 pre-season preview is required before audit");
    const preview = previewPayloadSchema.parse(previewSnapshot.payload);
    if (preview.targetSeason !== targetSeason.code) {
      throw new Error("Preview snapshot belongs to another season");
    }
    const [finishedFixtures, totalFixtures, eventStats, registrations] =
      await Promise.all([
        this.prisma.match.count({
          where: { seasonId: targetSeason.id, gameweek: 1, finished: true },
        }),
        this.prisma.match.count({
          where: { seasonId: targetSeason.id, gameweek: 1 },
        }),
        this.prisma.fPLPlayerStats.groupBy({
          by: ["seasonPlayerId"],
          where: { seasonId: targetSeason.id, gameweek: 1 },
          _sum: { totalPoints: true },
        }),
        this.prisma.seasonPlayer.findMany({
          where: { seasonId: targetSeason.id, active: true },
          select: { id: true },
        }),
      ]);
    if (totalFixtures !== 10 || finishedFixtures !== totalFixtures) {
      throw new Error(
        `GW1 audit waits for all 10 finished fixtures (${finishedFixtures}/${totalFixtures})`,
      );
    }
    if (eventStats.length < totalFixtures * 20) {
      throw new Error(
        `GW1 audit requires complete official player-fixture stats (${eventStats.length}/${totalFixtures * 20} minimum)`,
      );
    }
    if (
      preview.projections.length !== registrations.length ||
      new Set(
        preview.projections.map((projection) => projection.seasonPlayerId),
      ).size !== registrations.length
    ) {
      throw new Error(
        "Preview roster no longer matches the target season roster",
      );
    }
    const actualPoints = new Map(
      eventStats.map((stat) => [
        stat.seasonPlayerId,
        stat._sum.totalPoints ?? 0,
      ]),
    );
    const report = buildGw1AuditReport(preview.projections, actualPoints);
    const payload = {
      schemaVersion: 1,
      auditVersion: "gw1-preseason-audit-v1",
      targetSeason: targetSeason.code,
      gameweek: 1,
      previewSnapshot: {
        id: previewSnapshot.id,
        checksum: previewSnapshot.checksum,
      },
      publicationReady: false,
      activationRequested: false,
      completedFixtures: finishedFixtures,
      officialPlayerFixtureRows: eventStats.length,
      report,
    };
    const payloadChecksum = checksum(payload);
    const existing = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: "gw1-preseason-projection-audit",
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
                dataset: "gw1-preseason-projection-audit",
                season: targetSeason.code,
                sourceSeasonId: GW1_PRESEASON_PROJECTION_VERSION,
                gameweek: 1,
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
    return {
      targetSeason: targetSeason.code,
      previewSnapshotId: previewSnapshot.id,
      auditSnapshotId: audit.id,
      checksum: payloadChecksum,
      reused: audit.reused,
      report: {
        players: report.players,
        meanPredictedXPts: report.meanPredictedXPts,
        meanActualPoints: report.meanActualPoints,
        bias: report.bias,
        mae: report.mae,
        byConfidence: report.byConfidence,
      },
    };
  }
}
