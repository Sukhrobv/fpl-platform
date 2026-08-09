export type PlayerPosition =
  | "GOALKEEPER"
  | "DEFENDER"
  | "MIDFIELDER"
  | "FORWARD";

export type ForecastConfidence = "high" | "medium" | "low" | "unavailable";
export type PreseasonOverrideKind =
  | "LATE_RETURN"
  | "MANAGED_MINUTES"
  | "UNAVAILABLE"
  | "SELECTION_RISK"
  | "CONFIRMED_STARTER";

export interface PreseasonOverride {
  id: number;
  kind: PreseasonOverrideKind;
  availabilityCap: number | null;
  startProbabilityCap: number | null;
  expectedMinutesCap: number | null;
  appliesThroughGameweek: number;
  note: string;
  sourceUrl: string | null;
  updatedAt?: string;
}

export interface PreseasonMinutesEvidence {
  playerName: string;
  totalMinutes: number;
  possibleMinutes: number;
  matchMinutes: number[];
  participationRate: number;
  expectedMinutesCap: number;
  sourceUrl: string;
  fetchedAt: string;
}

export interface ForecastBreakdown {
  appearance: number;
  attack: number;
  defense: number;
  cleanSheet?: number;
  goalsConcededPenalty?: number;
  defcon?: number;
  saves?: number;
  bonus: number;
}

export interface ForecastRange {
  lower: number;
  upper: number;
  label: "INDICATIVE";
}

export interface FixturePlan {
  fixture: string;
  opponent: string;
  isHome: boolean;
}

export interface GameweekForecast {
  xPts: number;
  fixture: string;
  opponent: string;
  isHome: boolean;
  breakdown: ForecastBreakdown;
  raw?: {
    pStart?: number;
    p60?: number;
    eMin?: number;
  };
  range?: ForecastRange;
  context?: {
    player?: {
      xG90_recent?: number | null;
      xA90_recent?: number | null;
      touches90?: number | null;
      keyPasses90?: number | null;
      carries90?: number | null;
      h2h?: {
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
      } | null;
      attackRate?: {
        playerBaselineXG90: number | null;
        playerBaselineXA90: number | null;
        h2hAdjustedXG90: number | null;
        h2hAdjustedXA90: number | null;
        fixtureMultiplier: number;
        fixtureXG90: number | null;
        fixtureXA90: number | null;
      };
    };
    opponent?: {
      strengthSource?: "HISTORICAL" | "NEUTRAL";
      historicalDefenseMultiplier?: number;
      historicalSourceSeason?: string | null;
      historicalMatches?: number;
      teamAttackMultiplier?: number;
    };
    reliability?: {
      roleContinuity?: number;
      evidenceQuality?: number;
      score?: number;
    };
    manualOverride?: PreseasonOverride | null;
    preseasonMinutesEvidence?: PreseasonMinutesEvidence | null;
    limitations?: string[];
    methodology?: string;
  };
}

export interface PredictionPayload {
  playerId: number;
  totalXPts: number;
  totalRange?: ForecastRange;
  history: Record<number, GameweekForecast>;
  fixtures?: Record<number, FixturePlan>;
}

export interface PlayerApiItem {
  id: number;
  fplId: number;
  webName: string;
  firstName: string;
  secondName: string;
  position: PlayerPosition;
  nowCost: number;
  selectedBy: number;
  totalPoints: number;
  pointsPerGame: number;
  form: number;
  status: string | null;
  news: string | null;
  chanceOfPlaying: number | null;
  team: {
    shortName: string;
    name: string;
  };
}

export interface ExplorerPlayer extends PlayerApiItem {
  forecastTotal: number | null;
  forecastRange: ForecastRange | null;
  costPerSeasonPoint: number | null;
  costPerForecastPoint: number | null;
  forecasts: Record<number, GameweekForecast>;
  fixtures: Record<number, FixturePlan>;
}

export interface ExplorerFilters {
  query: string;
  position: PlayerPosition | "ALL";
  team: string;
  availability: "ALL" | "AVAILABLE" | "DOUBT";
}

export function confidenceForForecast(
  forecast?: GameweekForecast,
): ForecastConfidence {
  if (!forecast) return "unavailable";
  const startProbability = forecast.raw?.pStart;
  const hasRecentEvidence =
    forecast.context?.player?.xG90_recent != null ||
    forecast.context?.player?.xA90_recent != null;

  if (
    startProbability != null &&
    startProbability >= 0.75 &&
    hasRecentEvidence
  ) {
    return "high";
  }
  if (startProbability != null && startProbability >= 0.5) return "medium";
  return "low";
}

export function availabilityLabel(player: PlayerApiItem) {
  if (player.status === "a") return "Available";
  if (player.chanceOfPlaying != null)
    return `${player.chanceOfPlaying}% chance`;
  return player.news ? "Flagged" : "Unavailable";
}

export function updateComparisonSelection(
  current: ExplorerPlayer[],
  player: ExplorerPlayer,
  limit = 3,
) {
  if (current.some((candidate) => candidate.id === player.id)) {
    return current.filter((candidate) => candidate.id !== player.id);
  }
  if (current.length >= limit) return current;
  return [...current, player];
}

export interface TransferEvaluation {
  compatible: boolean;
  evidenceAvailable: boolean;
  forecastDelta: number | null;
  costDelta: number;
  verdict: "upgrade" | "downgrade" | "neutral" | "awaiting-data" | "invalid";
}

export function evaluateTransfer(
  playerOut: ExplorerPlayer,
  playerIn: ExplorerPlayer,
): TransferEvaluation {
  const compatible =
    playerOut.id !== playerIn.id && playerOut.position === playerIn.position;
  const evidenceAvailable =
    playerOut.forecastTotal != null && playerIn.forecastTotal != null;
  const forecastDelta = evidenceAvailable
    ? (playerIn.forecastTotal ?? 0) - (playerOut.forecastTotal ?? 0)
    : null;

  let verdict: TransferEvaluation["verdict"] = "awaiting-data";
  if (!compatible) verdict = "invalid";
  else if (forecastDelta != null && forecastDelta > 0.5) verdict = "upgrade";
  else if (forecastDelta != null && forecastDelta < -0.5) verdict = "downgrade";
  else if (forecastDelta != null) verdict = "neutral";

  return {
    compatible,
    evidenceAvailable,
    forecastDelta,
    costDelta: playerIn.nowCost - playerOut.nowCost,
    verdict,
  };
}

export function mergePlayersWithPredictions(
  players: PlayerApiItem[],
  predictions: PredictionPayload[],
): ExplorerPlayer[] {
  const byPlayer = new Map(
    predictions.map((prediction) => [prediction.playerId, prediction]),
  );

  return players.map((player) => {
    const prediction = byPlayer.get(player.id);
    return {
      ...player,
      forecastTotal: prediction?.totalXPts ?? null,
      forecastRange: prediction?.totalRange ?? null,
      costPerSeasonPoint:
        player.totalPoints > 0 && player.nowCost > 0
          ? Number((player.nowCost / 10 / player.totalPoints).toFixed(3))
          : null,
      costPerForecastPoint:
        prediction?.totalXPts != null && player.nowCost > 0
          ? Number((player.nowCost / 10 / prediction.totalXPts).toFixed(3))
          : null,
      forecasts: prediction?.history ?? {},
      fixtures: prediction?.fixtures ?? {},
    };
  });
}

export function filterExplorerPlayers(
  players: ExplorerPlayer[],
  filters: ExplorerFilters,
): ExplorerPlayer[] {
  const query = filters.query.trim().toLocaleLowerCase();

  return players.filter((player) => {
    const matchesQuery =
      !query ||
      player.webName.toLocaleLowerCase().includes(query) ||
      `${player.firstName} ${player.secondName}`
        .toLocaleLowerCase()
        .includes(query) ||
      player.team.name.toLocaleLowerCase().includes(query) ||
      player.team.shortName.toLocaleLowerCase().includes(query);
    const matchesPosition =
      filters.position === "ALL" || player.position === filters.position;
    const matchesTeam =
      filters.team === "ALL" || player.team.shortName === filters.team;
    const matchesAvailability =
      filters.availability === "ALL" ||
      (filters.availability === "AVAILABLE"
        ? player.status === "a"
        : player.status !== "a");

    return (
      matchesQuery && matchesPosition && matchesTeam && matchesAvailability
    );
  });
}

export const positionLabel: Record<PlayerPosition, string> = {
  GOALKEEPER: "GK",
  DEFENDER: "DEF",
  MIDFIELDER: "MID",
  FORWARD: "FWD",
};
