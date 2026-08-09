import type { PrismaClient } from "@prisma/client";

export const OPPONENT_PRIOR_VERSION = "goals-conceded-prior-v1";

const DEFAULT_SHRINKAGE_MATCHES = 8;
const DEFAULT_MIN_HISTORY_FIXTURES = 5;
const FACTOR_EXPONENT = 0.45;
const MIN_OPPONENT_FACTOR = 0.82;
const MAX_OPPONENT_FACTOR = 1.18;

export interface CompletedTeamFixture {
  gameweek: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
}

export interface TeamStrengthPrior {
  teamId: number;
  matches: number;
  goalsForPerMatch: number;
  goalsConcededPerMatch: number;
  attackMultiplier: number;
  defensiveVulnerabilityMultiplier: number;
  source: "HISTORICAL" | "NEUTRAL";
}

export interface TeamStrengthPriors {
  leagueGoalsPerTeamMatch: number;
  byTeamId: Map<number, TeamStrengthPrior>;
}

export interface HistoricalPlayerFixtureRow {
  gameweek: number;
  playerId: number;
  teamId: number;
  opponentTeamId: number;
  minutes: number;
  totalPoints: number;
}

export interface WalkForwardMetrics {
  rows: number;
  meanPredictedPoints: number;
  meanActualPoints: number;
  bias: number;
  mae: number;
}

export interface HistoricalWalkForwardReport {
  version: "historical-walk-forward-v1";
  sourceSeason: string;
  firstGameweek: number;
  lastGameweek: number;
  minimumHistoryFixtures: number;
  excludedRows: number;
  historicalOpponentRows: number;
  neutralOpponentRows: number;
  baseline: WalkForwardMetrics;
  opponentAdjusted: WalkForwardMetrics;
  maeDelta: number;
  recommendedForPreseasonPreview: boolean;
}

interface PredictionRow {
  actualPoints: number;
  baselinePoints: number;
  opponentAdjustedPoints: number;
  opponentSource: TeamStrengthPrior["source"];
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function neutralTeamPrior(teamId: number): TeamStrengthPrior {
  return {
    teamId,
    matches: 0,
    goalsForPerMatch: 0,
    goalsConcededPerMatch: 0,
    attackMultiplier: 1,
    defensiveVulnerabilityMultiplier: 1,
    source: "NEUTRAL",
  };
}

/**
 * Builds a deliberately small, explainable team prior from completed scores.
 * Rates are shrunk toward the league mean so short runs cannot create an
 * extreme fixture factor. It is suitable for a pre-season opponent adjustment,
 * not a replacement for current-season team data.
 */
export function buildTeamStrengthPriors(
  fixtures: CompletedTeamFixture[],
  options: { shrinkageMatches?: number } = {},
): TeamStrengthPriors {
  const completed = fixtures.filter(
    (fixture) =>
      fixture.finished &&
      fixture.homeScore != null &&
      fixture.awayScore != null,
  );
  const leagueGoalsPerTeamMatch = completed.length
    ? completed.reduce(
        (sum, fixture) => sum + fixture.homeScore! + fixture.awayScore!,
        0,
      ) /
      (completed.length * 2)
    : 1.35;
  const totals = new Map<
    number,
    { matches: number; goalsFor: number; goalsConceded: number }
  >();
  const add = (teamId: number, goalsFor: number, goalsConceded: number) => {
    const current = totals.get(teamId) ?? {
      matches: 0,
      goalsFor: 0,
      goalsConceded: 0,
    };
    current.matches += 1;
    current.goalsFor += goalsFor;
    current.goalsConceded += goalsConceded;
    totals.set(teamId, current);
  };
  for (const fixture of completed) {
    add(fixture.homeTeamId, fixture.homeScore!, fixture.awayScore!);
    add(fixture.awayTeamId, fixture.awayScore!, fixture.homeScore!);
  }
  const shrinkageMatches =
    options.shrinkageMatches ?? DEFAULT_SHRINKAGE_MATCHES;
  const byTeamId = new Map<number, TeamStrengthPrior>();
  for (const [teamId, total] of totals) {
    const goalsForPerMatch =
      (total.goalsFor + leagueGoalsPerTeamMatch * shrinkageMatches) /
      (total.matches + shrinkageMatches);
    const goalsConcededPerMatch =
      (total.goalsConceded + leagueGoalsPerTeamMatch * shrinkageMatches) /
      (total.matches + shrinkageMatches);
    byTeamId.set(teamId, {
      teamId,
      matches: total.matches,
      goalsForPerMatch: rounded(goalsForPerMatch),
      goalsConcededPerMatch: rounded(goalsConcededPerMatch),
      attackMultiplier: rounded(
        clamp(
          (goalsForPerMatch / leagueGoalsPerTeamMatch) ** FACTOR_EXPONENT,
          MIN_OPPONENT_FACTOR,
          MAX_OPPONENT_FACTOR,
        ),
      ),
      defensiveVulnerabilityMultiplier: rounded(
        clamp(
          (goalsConcededPerMatch / leagueGoalsPerTeamMatch) ** FACTOR_EXPONENT,
          MIN_OPPONENT_FACTOR,
          MAX_OPPONENT_FACTOR,
        ),
      ),
      source: "HISTORICAL",
    });
  }
  return {
    leagueGoalsPerTeamMatch: rounded(leagueGoalsPerTeamMatch),
    byTeamId,
  };
}

export function resolveOpponentStrengthPrior(
  priors: TeamStrengthPriors,
  opponentTeamId: number | null | undefined,
): TeamStrengthPrior {
  return opponentTeamId == null
    ? neutralTeamPrior(-1)
    : (priors.byTeamId.get(opponentTeamId) ?? neutralTeamPrior(opponentTeamId));
}

function calculateMetrics(
  rows: PredictionRow[],
  prediction: (row: PredictionRow) => number,
): WalkForwardMetrics {
  const predictions = rows.map(prediction);
  const actuals = rows.map((row) => row.actualPoints);
  return {
    rows: rows.length,
    meanPredictedPoints: rounded(average(predictions)),
    meanActualPoints: rounded(average(actuals)),
    bias: rounded(
      average(predictions.map((value, index) => value - actuals[index])),
    ),
    mae: rounded(
      average(
        predictions.map((value, index) => Math.abs(value - actuals[index])),
      ),
    ),
  };
}

/**
 * A leakage-free evaluation of the opponent prior. For GW N, player point
 * rates and team score priors may only use fixtures from GW < N. This is a
 * deliberately simple benchmark: it tells us whether the fixture adjustment
 * improves a stable baseline before it reaches the live pre-season preview.
 */
export function evaluateHistoricalWalkForward(input: {
  sourceSeason: string;
  fixtures: CompletedTeamFixture[];
  playerRows: HistoricalPlayerFixtureRow[];
  firstGameweek?: number;
  minimumHistoryFixtures?: number;
}): HistoricalWalkForwardReport {
  const firstGameweek = input.firstGameweek ?? 6;
  const minimumHistoryFixtures =
    input.minimumHistoryFixtures ?? DEFAULT_MIN_HISTORY_FIXTURES;
  const targetRows = [...input.playerRows].sort(
    (left, right) => left.gameweek - right.gameweek,
  );
  const gameweeks = [...new Set(targetRows.map((row) => row.gameweek))].sort(
    (left, right) => left - right,
  );
  const predictions: PredictionRow[] = [];
  let excludedRows = 0;
  for (const gameweek of gameweeks.filter((value) => value >= firstGameweek)) {
    const priorRows = targetRows.filter((row) => row.gameweek < gameweek);
    const priorByPlayer = new Map<number, HistoricalPlayerFixtureRow[]>();
    for (const row of priorRows) {
      const rows = priorByPlayer.get(row.playerId) ?? [];
      rows.push(row);
      priorByPlayer.set(row.playerId, rows);
    }
    const teamPriors = buildTeamStrengthPriors(
      input.fixtures.filter((fixture) => fixture.gameweek < gameweek),
    );
    for (const row of targetRows.filter(
      (value) => value.gameweek === gameweek,
    )) {
      const history = priorByPlayer.get(row.playerId) ?? [];
      if (history.length < minimumHistoryFixtures) {
        excludedRows += 1;
        continue;
      }
      const baselinePoints = average(history.map((value) => value.totalPoints));
      const opponent = resolveOpponentStrengthPrior(
        teamPriors,
        row.opponentTeamId,
      );
      predictions.push({
        actualPoints: row.totalPoints,
        baselinePoints,
        opponentAdjustedPoints:
          baselinePoints * opponent.defensiveVulnerabilityMultiplier,
        opponentSource: opponent.source,
      });
    }
  }
  const baseline = calculateMetrics(predictions, (row) => row.baselinePoints);
  const opponentAdjusted = calculateMetrics(
    predictions,
    (row) => row.opponentAdjustedPoints,
  );
  const maeDelta = rounded(opponentAdjusted.mae - baseline.mae);
  return {
    version: "historical-walk-forward-v1",
    sourceSeason: input.sourceSeason,
    firstGameweek,
    lastGameweek: gameweeks.at(-1) ?? 0,
    minimumHistoryFixtures,
    excludedRows,
    historicalOpponentRows: predictions.filter(
      (row) => row.opponentSource === "HISTORICAL",
    ).length,
    neutralOpponentRows: predictions.filter(
      (row) => row.opponentSource === "NEUTRAL",
    ).length,
    baseline,
    opponentAdjusted,
    maeDelta,
    recommendedForPreseasonPreview:
      predictions.length >= 500 && opponentAdjusted.mae < baseline.mae,
  };
}

export class HistoricalWalkForwardService {
  constructor(private readonly prisma: PrismaClient) {}

  async evaluate(input: {
    sourceSeasonCode: string;
    firstGameweek?: number;
    minimumHistoryFixtures?: number;
  }): Promise<HistoricalWalkForwardReport> {
    const season = await this.prisma.season.findUnique({
      where: { code: input.sourceSeasonCode },
      select: { id: true, code: true },
    });
    if (!season) throw new Error(`Season ${input.sourceSeasonCode} not found`);
    const [fixtures, stats] = await Promise.all([
      this.prisma.match.findMany({
        where: { seasonId: season.id },
        select: {
          gameweek: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          finished: true,
        },
      }),
      this.prisma.fPLPlayerStats.findMany({
        where: { seasonId: season.id },
        select: {
          gameweek: true,
          seasonPlayerId: true,
          minutes: true,
          totalPoints: true,
          match: {
            select: {
              homeTeamId: true,
              awayTeamId: true,
              finished: true,
            },
          },
          seasonPlayer: {
            select: { seasonTeam: { select: { teamId: true } } },
          },
        },
      }),
    ]);
    const playerRows: HistoricalPlayerFixtureRow[] = [];
    for (const stat of stats) {
      if (!stat.match.finished) continue;
      const teamId = stat.seasonPlayer.seasonTeam.teamId;
      const opponentTeamId =
        stat.match.homeTeamId === teamId
          ? stat.match.awayTeamId
          : stat.match.awayTeamId === teamId
            ? stat.match.homeTeamId
            : null;
      if (opponentTeamId == null) continue;
      playerRows.push({
        gameweek: stat.gameweek,
        playerId: stat.seasonPlayerId,
        teamId,
        opponentTeamId,
        minutes: stat.minutes,
        totalPoints: stat.totalPoints,
      });
    }
    if (!playerRows.length) {
      throw new Error(
        `No team-resolved FPL player-fixture rows found for ${season.code}`,
      );
    }
    return evaluateHistoricalWalkForward({
      sourceSeason: season.code,
      fixtures,
      playerRows,
      firstGameweek: input.firstGameweek,
      minimumHistoryFixtures: input.minimumHistoryFixtures,
    });
  }
}
