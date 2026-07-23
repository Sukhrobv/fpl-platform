export interface AssistantEvidenceItem {
  tool: string;
  result: unknown;
}

export interface AssistantPlayerFact {
  id: number;
  webName: string;
  team: string;
  position: string;
  price: number;
  form: number;
  ownership: number;
  isInjured: boolean;
}

export interface AssistantComparisonFact {
  player1: AssistantPlayerFact;
  player2: AssistantPlayerFact;
  comparison: {
    metric: string;
    player1Value: string | number;
    player2Value: string | number;
    winner: 0 | 1 | 2;
  }[];
  recommendation: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAssistantPlayer(
  value: unknown,
): value is AssistantPlayerFact {
  if (!record(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.webName === "string" &&
    typeof value.team === "string" &&
    typeof value.position === "string" &&
    typeof value.price === "number" &&
    typeof value.form === "number" &&
    typeof value.ownership === "number" &&
    typeof value.isInjured === "boolean"
  );
}

export function assistantPlayers(value: unknown): AssistantPlayerFact[] {
  if (isAssistantPlayer(value)) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter(isAssistantPlayer);
}

export function isAssistantComparison(
  value: unknown,
): value is AssistantComparisonFact {
  if (!record(value) || !Array.isArray(value.comparison)) return false;
  return isAssistantPlayer(value.player1) && isAssistantPlayer(value.player2);
}

export function visibleComparisonMetrics(comparison: AssistantComparisonFact) {
  return comparison.comparison.filter(
    ({ metric }) => !metric.toLowerCase().includes("xpts"),
  );
}

export function toolLabel(tool: string) {
  return (
    {
      get_player_by_name: "Player record",
      search_replacements: "Candidate search",
      compare_players: "Player comparison",
      get_fixtures: "Fixture lookup",
    }[tool] ?? "Data lookup"
  );
}
