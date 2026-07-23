export type SquadPosition =
  | "GOALKEEPER"
  | "DEFENDER"
  | "MIDFIELDER"
  | "FORWARD";

export interface SquadPlayer {
  id: number;
  fplId: number;
  webName: string;
  position: SquadPosition;
  nowCost: number;
  status: string | null;
  news: string | null;
  chanceOfPlaying: number | null;
  team: { shortName: string; name: string };
  fplStats: Array<{ totalPoints: number }>;
}

export interface SquadPick {
  id: number;
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  purchasePrice: number | null;
  sellingPrice: number | null;
  player: SquadPlayer;
}

export interface SquadData {
  id: number;
  gameweek: number;
  teamValue: number;
  bank: number;
  freeTransfers: number;
  pointsHit: number;
  gameweekPoints: number | null;
  totalPoints: number | null;
  overallRank: number | null;
  picks: SquadPick[];
}

export interface SquadProblem {
  type: "INJURY" | "BENCH_VALUE" | "FIXTURE_RISK" | "LOW_XPTS";
  severity: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  playerId?: number;
  playerName?: string;
}

export interface SquadHealth {
  score: number;
  verdict: string;
  breakdown: {
    availability: number;
    fixtures: number;
    form: number;
  };
}

export interface SquadAnalysis {
  health: SquadHealth;
  problems: SquadProblem[];
}

interface RecommendationPlayer {
  id: number;
  webName: string;
  team: { shortName: string };
  xPts?: number;
}

export interface TransferRecommendation {
  playerOut: RecommendationPlayer;
  playerIn: RecommendationPlayer & { nowCost: number };
  xPtsDelta: number;
  reason: string;
  ownershipContext?: {
    eliteEo: number;
    isDifferential: boolean;
    isTemplate: boolean;
  };
}

export interface ChipRecommendation {
  chip: "wildcard" | "bench_boost" | "triple_captain" | "free_hit";
  confidence: number;
  reasoning: string;
  expectedValue: number;
  trigger: string;
}

export interface EliteContext {
  gameweek: number;
  eliteEoMap: Record<string, number>;
}

export const positionOrder: SquadPosition[] = [
  "GOALKEEPER",
  "DEFENDER",
  "MIDFIELDER",
  "FORWARD",
];

export const positionLabels: Record<SquadPosition, string> = {
  GOALKEEPER: "Goalkeeper",
  DEFENDER: "Defenders",
  MIDFIELDER: "Midfielders",
  FORWARD: "Forwards",
};

export function splitSquad(picks: SquadPick[]) {
  return {
    starters: picks.filter((pick) => pick.position <= 11),
    bench: picks.filter((pick) => pick.position > 11),
  };
}

export function groupStartersByPosition(picks: SquadPick[]) {
  const starters = splitSquad(picks).starters;
  return positionOrder.map((position) => ({
    position,
    picks: starters.filter((pick) => pick.player.position === position),
  }));
}

export function captaincy(picks: SquadPick[]) {
  return {
    captain: picks.find((pick) => pick.isCaptain) ?? null,
    viceCaptain: picks.find((pick) => pick.isViceCaptain) ?? null,
  };
}

export function eliteSquadSummary(
  picks: SquadPick[],
  eliteEoMap: Record<string, number>,
) {
  const ownedIds = new Set(picks.map((pick) => pick.player.fplId));
  const missingTemplate = Object.entries(eliteEoMap).filter(
    ([id, eo]) => eo > 50 && !ownedIds.has(Number(id)),
  ).length;
  const differentials = picks.filter(
    (pick) => (eliteEoMap[String(pick.player.fplId)] ?? 0) < 10,
  ).length;
  return { missingTemplate, differentials };
}

export function playerPoints(pick: SquadPick) {
  return pick.player.fplStats[0]?.totalPoints ?? 0;
}
