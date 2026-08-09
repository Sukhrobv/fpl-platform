import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildTeamStrengthPriors,
  resolveOpponentStrengthPrior,
  type TeamStrengthPrior,
} from "@/lib/services/historicalWalkForwardService";
import {
  indicativePreseasonRange,
  projectGw1PreseasonProfile,
  readinessPayloadSchema,
  type Gw1PreseasonFixtureProjection,
  type Gw1PreseasonProfile,
} from "@/lib/services/seasonPredictionPublicationService";
import {
  isActiveForGameweek,
  toAppliedPreseasonOverride,
} from "@/lib/services/preseasonOverrideService";
import {
  PRESEASON_MINUTES_TRACKER_DATASET,
  PRESEASON_MINUTES_TRACKER_SOURCE,
  trackerEvidenceFromSnapshot,
  type PreseasonMinutesTrackerEvidence,
} from "@/lib/services/preseasonMinutesTrackerService";
import { FPL_HISTORICAL_H2H_SOURCE } from "@/lib/services/fplHistoricalH2hService";

export const ROLLING_PREDICTION_DATASET = "rolling-next-5-prediction-preview";
export const ROLLING_PREDICTION_VERSION = "rolling-next-5-v3";

export interface H2hRateAdjustment {
  sourceSeason: string | null;
  matches: number;
  minutes: number;
  xG: number;
  xA: number;
  goals: number;
  assists: number;
  xG90: number;
  xA90: number;
  weight: number;
  xG90Adjusted: number | null;
  xA90Adjusted: number | null;
}

export interface RollingFixtureProjection
  extends Gw1PreseasonFixtureProjection {
  gameweek: number;
  h2h: H2hRateAdjustment | null;
  attackRate: {
    playerBaselineXG90: number | null;
    playerBaselineXA90: number | null;
    h2hAdjustedXG90: number | null;
    h2hAdjustedXA90: number | null;
    fixtureMultiplier: number;
    fixtureXG90: number | null;
    fixtureXA90: number | null;
  };
}

export interface RollingPlayerProjection {
  seasonPlayerId: number;
  fplId: number;
  playerName: string;
  team: string;
  position: Gw1PreseasonProfile["position"];
  price: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  confidenceScore: number;
  estimateStatus: "PREVIEW_ONLY" | "PARTIAL" | "UNAVAILABLE";
  limitations: string[];
  evidence: Gw1PreseasonProfile["priorMetrics"];
  fixtures: RollingFixtureProjection[];
  totalXPts: number;
  totalRange: { lower: number; upper: number; label: "INDICATIVE" };
}

export interface RollingPredictionPayload {
  schemaVersion: 1;
  projectionVersion: typeof ROLLING_PREDICTION_VERSION;
  targetSeason: string;
  horizonGameweeks: number[];
  statsThroughGameweek: number;
  publicationReady: false;
  publicationEnabled: false;
  activationRequested: false;
  methodology: string;
  inputs: {
    readinessSnapshotId: number;
    bootstrapSnapshotId: number | null;
    trackerSnapshotId: number | null;
  };
  projections: RollingPlayerProjection[];
}

function clamp(value: number, lower: number, upper: number) {
  return Math.max(lower, Math.min(upper, value));
}

function rounded(value: number, precision = 2) {
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

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

interface BootstrapRate {
  minutes: number;
  xG90: number | null;
  xA90: number | null;
  defconActions90: number | null;
}

function bootstrapRates(payload: unknown): Map<number, BootstrapRate> {
  if (!payload || typeof payload !== "object") return new Map();
  const elements = (payload as Record<string, unknown>).elements;
  if (!Array.isArray(elements)) return new Map();
  const rates = new Map<number, BootstrapRate>();
  for (const element of elements) {
    if (!element || typeof element !== "object") continue;
    const row = element as Record<string, unknown>;
    const fplId = numberOrNull(row.id);
    const minutes = numberOrNull(row.minutes) ?? 0;
    if (fplId == null || !Number.isInteger(fplId)) continue;
    const per90 = (value: unknown) => {
      const total = numberOrNull(value);
      return total == null || minutes <= 0 ? null : (total / minutes) * 90;
    };
    rates.set(fplId, {
      minutes,
      xG90: per90(row.expected_goals),
      xA90: per90(row.expected_assists),
      defconActions90: per90(row.defensive_contribution),
    });
  }
  return rates;
}

export function blendCurrentRate(input: {
  prior: number | null;
  current: number | null;
  currentMinutes: number;
  shrinkageMinutes?: number;
}) {
  if (input.current == null) return input.prior;
  if (input.prior == null) return input.current;
  const weight =
    input.currentMinutes /
    (input.currentMinutes + (input.shrinkageMinutes ?? 540));
  return input.current * weight + input.prior * (1 - weight);
}

export function rollingStartProbability(input: {
  priorMinutes: number;
  priorAppearances: number;
  currentMinutes: number;
  currentAppearances: number;
}) {
  if (input.currentAppearances === 0) return null;
  const priorAverage =
    input.priorAppearances > 0
      ? input.priorMinutes / input.priorAppearances
      : 62;
  const currentAverage = input.currentMinutes / input.currentAppearances;
  const currentWeight = Math.min(
    0.75,
    input.currentAppearances / (input.currentAppearances + 3),
  );
  const expectedMinutes =
    currentAverage * currentWeight + priorAverage * (1 - currentWeight);
  return clamp((expectedMinutes - 14) / 62, 0.05, 0.98);
}

export function expectedSavePoints(expectedSaves: number): number {
  let points = 0;
  let probability = Math.exp(-expectedSaves);
  for (let saves = 0; saves <= 18; saves += 1) {
    if (saves > 0) probability *= expectedSaves / saves;
    points += Math.floor(saves / 3) * probability;
  }
  return points;
}

export function canUseCurrentSeasonBootstrap(statsThroughGameweek: number) {
  return statsThroughGameweek > 0;
}

export function calculateH2hRateAdjustment(input: {
  baseXG90: number | null;
  baseXA90: number | null;
  sourceSeason?: string | null;
  matches: Array<{
    minutes: number;
    xG: number;
    xA: number;
    goals?: number;
    assists?: number;
  }>;
}): H2hRateAdjustment | null {
  const matches = input.matches.slice(0, 2);
  const minutes = matches.reduce((sum, match) => sum + match.minutes, 0);
  if (matches.length === 0 || minutes < 60) return null;
  const xG90 =
    (matches.reduce((sum, match) => sum + match.xG, 0) / minutes) * 90;
  const xA90 =
    (matches.reduce((sum, match) => sum + match.xA, 0) / minutes) * 90;
  // Two fixtures are an intentionally tiny sample. Even two full matches can
  // move the player baseline by no more than a 15% shrinkage weight.
  const weight = Math.min(0.15, minutes / (minutes + 1080));
  const adjustedRate = (base: number | null, observed: number) => {
    if (base == null || base <= 0) return base;
    const observedMultiplier = clamp(observed / base, 0.5, 1.5);
    return rounded(base * (1 + (observedMultiplier - 1) * weight), 4);
  };
  return {
    sourceSeason: input.sourceSeason ?? null,
    matches: matches.length,
    minutes,
    xG: rounded(
      matches.reduce((sum, match) => sum + match.xG, 0),
      4,
    ),
    xA: rounded(
      matches.reduce((sum, match) => sum + match.xA, 0),
      4,
    ),
    goals: matches.reduce((sum, match) => sum + (match.goals ?? 0), 0),
    assists: matches.reduce((sum, match) => sum + (match.assists ?? 0), 0),
    xG90: rounded(xG90, 4),
    xA90: rounded(xA90, 4),
    weight: rounded(weight, 4),
    xG90Adjusted: adjustedRate(input.baseXG90, xG90),
    xA90Adjusted: adjustedRate(input.baseXA90, xA90),
  };
}

function blendTeamStrength(
  historical: ReturnType<typeof buildTeamStrengthPriors>,
  current: ReturnType<typeof buildTeamStrengthPriors>,
  teamId: number,
): TeamStrengthPrior {
  const historicalPrior = resolveOpponentStrengthPrior(historical, teamId);
  const currentPrior = current.byTeamId.get(teamId);
  if (!currentPrior) return historicalPrior;
  const weight = Math.min(
    0.7,
    currentPrior.matches / (currentPrior.matches + 6),
  );
  return {
    teamId,
    matches: historicalPrior.matches + currentPrior.matches,
    goalsForPerMatch: rounded(
      currentPrior.goalsForPerMatch * weight +
        historicalPrior.goalsForPerMatch * (1 - weight),
      4,
    ),
    goalsConcededPerMatch: rounded(
      currentPrior.goalsConcededPerMatch * weight +
        historicalPrior.goalsConcededPerMatch * (1 - weight),
      4,
    ),
    attackMultiplier: rounded(
      currentPrior.attackMultiplier * weight +
        historicalPrior.attackMultiplier * (1 - weight),
      4,
    ),
    defensiveVulnerabilityMultiplier: rounded(
      currentPrior.defensiveVulnerabilityMultiplier * weight +
        historicalPrior.defensiveVulnerabilityMultiplier * (1 - weight),
      4,
    ),
    source: "HISTORICAL",
  };
}

export class RollingPredictionService {
  constructor(private readonly prisma: PrismaClient) {}

  async build(input: { targetSeasonCode: string; horizon?: number }) {
    const horizon = clamp(input.horizon ?? 5, 1, 8);
    const targetSeason = await this.prisma.season.findUnique({
      where: { code: input.targetSeasonCode },
      select: { id: true, code: true, status: true },
    });
    if (!targetSeason)
      throw new Error(`Season ${input.targetSeasonCode} not found`);
    if (
      targetSeason.status !== "UPCOMING" &&
      targetSeason.status !== "ACTIVE"
    ) {
      throw new Error(
        "Rolling predictions require an UPCOMING or ACTIVE season",
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
      select: { id: true, payload: true },
    });
    if (!readinessSnapshot)
      throw new Error("Valid GW1 readiness snapshot is required");
    const readiness = readinessPayloadSchema.parse(readinessSnapshot.payload);
    if (readiness.targetSeason !== targetSeason.code || !readiness.ready) {
      throw new Error(
        "GW1 readiness snapshot is not usable for this rolling preview",
      );
    }
    const priorConfig = await this.prisma.predictionConfigVersion.findUnique({
      where: { version: readiness.priorVersion },
      select: {
        sourceSeasonId: true,
        sourceSeason: { select: { code: true } },
      },
    });
    if (!priorConfig)
      throw new Error(
        `Prior configuration ${readiness.priorVersion} not found`,
      );

    const latestFinished = await this.prisma.match.aggregate({
      where: { seasonId: targetSeason.id, finished: true },
      _max: { gameweek: true },
    });
    const statsThroughGameweek = latestFinished._max.gameweek ?? 0;
    const horizonGameweeks = (
      await this.prisma.match.findMany({
        where: {
          seasonId: targetSeason.id,
          finished: false,
          gameweek: { gt: statsThroughGameweek },
        },
        distinct: ["gameweek"],
        orderBy: { gameweek: "asc" },
        take: horizon,
        select: { gameweek: true },
      })
    ).map((row) => row.gameweek);
    if (horizonGameweeks.length === 0)
      throw new Error("No upcoming fixtures found");

    const [
      targetTeams,
      horizonFixtures,
      sourceFixtures,
      currentFixtures,
      overrides,
      trackerSnapshot,
      bootstrapSnapshot,
      currentStats,
      sourceStats,
      h2hStats,
    ] = await Promise.all([
      this.prisma.seasonTeam.findMany({
        where: { seasonId: targetSeason.id },
        select: { id: true, teamId: true, shortName: true },
      }),
      this.prisma.match.findMany({
        where: {
          seasonId: targetSeason.id,
          gameweek: { in: horizonGameweeks },
        },
        select: {
          id: true,
          gameweek: true,
          homeSeasonTeam: { select: { teamId: true, shortName: true } },
          awaySeasonTeam: { select: { teamId: true, shortName: true } },
        },
      }),
      this.prisma.match.findMany({
        where: { seasonId: priorConfig.sourceSeasonId, finished: true },
        select: {
          gameweek: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          finished: true,
        },
      }),
      this.prisma.match.findMany({
        where: { seasonId: targetSeason.id, finished: true },
        select: {
          gameweek: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          finished: true,
        },
      }),
      this.prisma.preseasonOverride.findMany({
        where: { seasonId: targetSeason.id, active: true },
      }),
      this.prisma.sourceSnapshot.findFirst({
        where: {
          seasonId: targetSeason.id,
          source: PRESEASON_MINUTES_TRACKER_SOURCE,
          dataset: PRESEASON_MINUTES_TRACKER_DATASET,
          valid: true,
        },
        orderBy: { fetchedAt: "desc" },
        select: { id: true, fetchedAt: true, payload: true },
      }),
      this.prisma.sourceSnapshot.findFirst({
        where: {
          seasonId: targetSeason.id,
          source: "fpl",
          dataset: "bootstrap-static",
          valid: true,
        },
        orderBy: { fetchedAt: "desc" },
        select: { id: true, payload: true },
      }),
      this.prisma.fPLPlayerStats.groupBy({
        by: ["seasonPlayerId"],
        where: { seasonId: targetSeason.id },
        _sum: { minutes: true, saves: true, bonus: true },
        _count: { _all: true },
      }),
      this.prisma.fPLPlayerStats.groupBy({
        by: ["playerId"],
        where: { seasonId: priorConfig.sourceSeasonId },
        _sum: { minutes: true, saves: true, bonus: true },
      }),
      this.prisma.externalPlayerMatchStats.findMany({
        where: {
          seasonId: priorConfig.sourceSeasonId,
          source: FPL_HISTORICAL_H2H_SOURCE,
          opponentTeamId: { not: null },
          minutes: { gt: 0 },
        },
        select: {
          playerId: true,
          opponentTeamId: true,
          minutes: true,
          goals: true,
          assists: true,
          xG: true,
          xA: true,
          matchDate: true,
        },
        orderBy: { matchDate: "desc" },
      }),
    ]);

    const currentStatsBySeasonPlayerId = new Map(
      currentStats.map((row) => [row.seasonPlayerId, row]),
    );
    const sourceStatsByPlayerId = new Map(
      sourceStats.map((row) => [row.playerId, row]),
    );
    const h2hByPlayerOpponent = new Map<
      string,
      Array<{
        minutes: number;
        goals: number;
        assists: number;
        xG: number;
        xA: number;
      }>
    >();
    for (const stat of h2hStats) {
      if (stat.opponentTeamId == null) continue;
      const key = `${stat.playerId}:${stat.opponentTeamId}`;
      const entries = h2hByPlayerOpponent.get(key) ?? [];
      if (entries.length < 2) {
        entries.push({
          minutes: stat.minutes,
          goals: stat.goals,
          assists: stat.assists,
          xG: stat.xG,
          xA: stat.xA,
        });
        h2hByPlayerOpponent.set(key, entries);
      }
    }
    const currentBootstrapRates = canUseCurrentSeasonBootstrap(
      statsThroughGameweek,
    )
      ? bootstrapRates(bootstrapSnapshot?.payload)
      : new Map<number, BootstrapRate>();
    const historicalTeamStrength = buildTeamStrengthPriors(sourceFixtures);
    const currentTeamStrength = buildTeamStrengthPriors(currentFixtures);
    const teamStrengthByTeamName = new Map(
      targetTeams.map((team) => [
        team.shortName,
        blendTeamStrength(
          historicalTeamStrength,
          currentTeamStrength,
          team.teamId,
        ),
      ]),
    );
    const opponentStrengthByFixtureId = new Map<number, TeamStrengthPrior>();
    for (const fixture of horizonFixtures) {
      opponentStrengthByFixtureId.set(
        fixture.id,
        blendTeamStrength(
          historicalTeamStrength,
          currentTeamStrength,
          fixture.awaySeasonTeam.teamId,
        ),
      );
    }
    const overridesBySeasonPlayerId = new Map(
      overrides.map((override) => [override.seasonPlayerId, override]),
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

    const projections = readiness.profiles.map((profile) => {
      const current = currentStatsBySeasonPlayerId.get(profile.seasonPlayerId);
      const bootstrap = currentBootstrapRates.get(profile.fplId);
      const source = sourceStatsByPlayerId.get(profile.playerId);
      const currentMinutes = current?._sum.minutes ?? bootstrap?.minutes ?? 0;
      const currentAppearances = current?._count._all ?? 0;
      const adjustedProfile: Gw1PreseasonProfile = {
        ...profile,
        priorMetrics: {
          ...profile.priorMetrics,
          xG90: blendCurrentRate({
            prior: profile.priorMetrics.xG90,
            current: bootstrap?.xG90 ?? null,
            currentMinutes,
          }),
          xA90: blendCurrentRate({
            prior: profile.priorMetrics.xA90,
            current: bootstrap?.xA90 ?? null,
            currentMinutes,
          }),
          defconActions90: blendCurrentRate({
            prior: profile.priorMetrics.defconActions90,
            current: bootstrap?.defconActions90 ?? null,
            currentMinutes,
          }),
        },
      };
      const startProbabilityOverride = rollingStartProbability({
        priorMinutes: profile.priorUsage.minutes,
        priorAppearances: profile.priorUsage.appearances,
        currentMinutes,
        currentAppearances,
      });
      const sourceMinutes = source?._sum.minutes ?? 0;
      const saveRate90 = blendCurrentRate({
        prior:
          sourceMinutes > 0
            ? ((source?._sum.saves ?? 0) / sourceMinutes) * 90
            : null,
        current:
          currentMinutes > 0
            ? ((current?._sum.saves ?? 0) / currentMinutes) * 90
            : null,
        currentMinutes,
      });
      const bonusRate90 = blendCurrentRate({
        prior:
          sourceMinutes > 0
            ? ((source?._sum.bonus ?? 0) / sourceMinutes) * 90
            : null,
        current:
          currentMinutes > 0
            ? ((current?._sum.bonus ?? 0) / currentMinutes) * 90
            : null,
        currentMinutes,
      });
      const fixturePredictions = horizonFixtures
        .filter(
          (fixture) =>
            fixture.homeSeasonTeam.shortName === profile.team ||
            fixture.awaySeasonTeam.shortName === profile.team,
        )
        .map((fixture) => {
          const isHome = fixture.homeSeasonTeam.shortName === profile.team;
          const opponent = isHome
            ? fixture.awaySeasonTeam
            : fixture.homeSeasonTeam;
          const override =
            overridesBySeasonPlayerId.get(profile.seasonPlayerId) ?? null;
          const opponentStrength = blendTeamStrength(
            historicalTeamStrength,
            currentTeamStrength,
            opponent.teamId,
          );
          const h2h = calculateH2hRateAdjustment({
            baseXG90: adjustedProfile.priorMetrics.xG90,
            baseXA90: adjustedProfile.priorMetrics.xA90,
            sourceSeason: priorConfig.sourceSeason.code,
            matches:
              h2hByPlayerOpponent.get(
                `${profile.playerId}:${opponent.teamId}`,
              ) ?? [],
          });
          const venueFactor = isHome ? 1.04 : 0.96;
          const teamAttackMultiplier = Math.pow(
            teamStrengthByTeamName.get(profile.team)?.attackMultiplier ?? 1,
            0.35,
          );
          const fixtureMultiplier = rounded(
            venueFactor *
              teamAttackMultiplier *
              opponentStrength.defensiveVulnerabilityMultiplier,
            4,
          );
          const h2hAdjustedXG90 =
            h2h?.xG90Adjusted ?? adjustedProfile.priorMetrics.xG90;
          const h2hAdjustedXA90 =
            h2h?.xA90Adjusted ?? adjustedProfile.priorMetrics.xA90;
          const base = projectGw1PreseasonProfile(
            {
              ...adjustedProfile,
              priorMetrics: {
                ...adjustedProfile.priorMetrics,
                xG90: h2hAdjustedXG90,
                xA90: h2hAdjustedXA90,
              },
              gw1Fixtures: [
                { fixtureId: fixture.id, opponent: opponent.shortName, isHome },
              ],
            },
            {
              opponentStrengthByFixtureId: new Map([
                [fixture.id, opponentStrength],
              ]),
              teamStrengthByTeamName,
              leagueGoalsPerTeamMatch: currentFixtures.length
                ? currentTeamStrength.leagueGoalsPerTeamMatch
                : historicalTeamStrength.leagueGoalsPerTeamMatch,
              sourceSeason: priorConfig.sourceSeason.code,
              manualOverride:
                override && isActiveForGameweek(override, fixture.gameweek)
                  ? toAppliedPreseasonOverride(override)
                  : null,
              preseasonMinutesEvidence:
                fixture.gameweek === horizonGameweeks[0]
                  ? (trackerEvidenceBySeasonPlayerId.get(
                      profile.seasonPlayerId,
                    ) ?? null)
                  : null,
              startProbabilityOverride,
              currentSeasonEvidence:
                canUseCurrentSeasonBootstrap(statsThroughGameweek),
            },
          ).fixtures[0];
          const expectedSaves =
            saveRate90 == null
              ? 0
              : saveRate90 *
                (base.expectedMinutes / 90) *
                opponentStrength.attackMultiplier;
          const saves = rounded(expectedSavePoints(expectedSaves));
          const bonus = rounded(
            clamp((bonusRate90 ?? 0) * (base.expectedMinutes / 90), 0, 1.2),
          );
          const xPts = rounded(base.xPts + saves + bonus);
          return {
            ...base,
            gameweek: fixture.gameweek,
            xPts,
            range: indicativePreseasonRange({
              xPts,
              confidenceScore: adjustedProfile.confidenceScore,
              reliabilityScore: 70,
            }),
            breakdown: { ...base.breakdown, saves, bonus },
            h2h,
            attackRate: {
              playerBaselineXG90: adjustedProfile.priorMetrics.xG90,
              playerBaselineXA90: adjustedProfile.priorMetrics.xA90,
              h2hAdjustedXG90,
              h2hAdjustedXA90,
              fixtureMultiplier,
              fixtureXG90:
                h2hAdjustedXG90 == null
                  ? null
                  : rounded(h2hAdjustedXG90 * fixtureMultiplier, 4),
              fixtureXA90:
                h2hAdjustedXA90 == null
                  ? null
                  : rounded(h2hAdjustedXA90 * fixtureMultiplier, 4),
            },
          } satisfies RollingFixtureProjection;
        });
      const totalXPts = rounded(
        fixturePredictions.reduce((sum, fixture) => sum + fixture.xPts, 0),
      );
      return {
        seasonPlayerId: profile.seasonPlayerId,
        fplId: profile.fplId,
        playerName: profile.playerName,
        team: profile.team,
        position: profile.position,
        price: profile.price,
        confidence: profile.confidence,
        confidenceScore: profile.confidenceScore,
        estimateStatus: fixturePredictions.some(
          (fixture) => fixture.expectedMinutes > 0,
        )
          ? profile.priorMetrics.xG90 != null &&
            profile.priorMetrics.xA90 != null
            ? "PREVIEW_ONLY"
            : "PARTIAL"
          : "UNAVAILABLE",
        limitations: [
          ...new Set(
            fixturePredictions.flatMap((fixture) =>
              fixture.manualOverride
                ? [`MANUAL_${fixture.manualOverride.kind}`]
                : [],
            ),
          ),
        ].sort(),
        evidence: adjustedProfile.priorMetrics,
        fixtures: fixturePredictions,
        totalXPts,
        totalRange: {
          lower: rounded(
            fixturePredictions.reduce(
              (sum, fixture) => sum + fixture.range.lower,
              0,
            ),
          ),
          upper: rounded(
            fixturePredictions.reduce(
              (sum, fixture) => sum + fixture.range.upper,
              0,
            ),
          ),
          label: "INDICATIVE" as const,
        },
      } satisfies RollingPlayerProjection;
    });
    const payload: RollingPredictionPayload = {
      schemaVersion: 1,
      projectionVersion: ROLLING_PREDICTION_VERSION,
      targetSeason: targetSeason.code,
      horizonGameweeks,
      statsThroughGameweek,
      publicationReady: false,
      publicationEnabled: false,
      activationRequested: false,
      methodology:
        "Rolling next-five-GW preview: historical player rates are progressively blended with official current-season FPL xG/xA, minutes, bonuses, saves and team scores after each settled gameweek. Fixtures are calculated individually, so double gameweeks sum their matches and blank gameweeks remain zero. Appearance points follow FPL's one point for playing and a second point at 60+ minutes. Pre-season tracker and manual evidence can only cap availability, starts or minutes; zero friendly minutes alone do not assert zero league minutes. Bonus and save components are conservative rate-based expectations, not claimed calibrated probabilities.",
      inputs: {
        readinessSnapshotId: readinessSnapshot.id,
        bootstrapSnapshotId: canUseCurrentSeasonBootstrap(statsThroughGameweek)
          ? (bootstrapSnapshot?.id ?? null)
          : null,
        trackerSnapshotId: trackerSnapshot?.id ?? null,
      },
      projections: projections.sort(
        (left, right) =>
          right.totalXPts - left.totalXPts || left.fplId - right.fplId,
      ),
    };
    const checksum = createHash("sha256")
      .update(stableStringify(payload))
      .digest("hex");
    const existing = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: ROLLING_PREDICTION_DATASET,
        checksum,
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true },
    });
    const snapshotId =
      existing?.id ??
      (
        await this.prisma.sourceSnapshot.create({
          data: {
            seasonId: targetSeason.id,
            source: "internal",
            dataset: ROLLING_PREDICTION_DATASET,
            season: targetSeason.code,
            sourceSeasonId: priorConfig.sourceSeason.code,
            gameweek: horizonGameweeks[0],
            batchId: randomUUID(),
            schemaVersion: 1,
            fetchedAt: new Date(),
            checksum,
            valid: true,
            error: null,
            recordCount: projections.length,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        })
      ).id;
    return {
      targetSeason: targetSeason.code,
      snapshotId,
      reused: existing != null,
      horizonGameweeks,
      statsThroughGameweek,
      projections: projections.length,
    };
  }
}
