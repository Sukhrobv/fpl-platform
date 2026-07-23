export type PlayerPosition =
  | "GOALKEEPER"
  | "DEFENDER"
  | "MIDFIELDER"
  | "FORWARD";

export type ForecastConfidence = "high" | "medium" | "low" | "unavailable";

export interface ForecastBreakdown {
  appearance: number;
  attack: number;
  defense: number;
  defcon?: number;
  bonus: number;
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
  context?: {
    player?: {
      xG90_recent?: number | null;
      xA90_recent?: number | null;
    };
  };
}

export interface PredictionPayload {
  playerId: number;
  totalXPts: number;
  history: Record<number, GameweekForecast>;
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
  forecasts: Record<number, GameweekForecast>;
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
      forecasts: prediction?.history ?? {},
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
