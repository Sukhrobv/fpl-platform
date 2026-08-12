export type SquadLineupPosition =
  | "GOALKEEPER"
  | "DEFENDER"
  | "MIDFIELDER"
  | "FORWARD";

export interface SquadLineupPlayer {
  id: number;
  position: SquadLineupPosition;
  projectedPoints: number;
}

export interface SquadRosterPlayer {
  id: number;
  position: SquadLineupPosition;
}

export interface OptimalSquadLineup {
  starterIds: number[];
  benchIds: number[];
  captainId: number | null;
  viceCaptainId: number | null;
}

const FORMATIONS = [
  { DEFENDER: 3, MIDFIELDER: 5, FORWARD: 2 },
  { DEFENDER: 4, MIDFIELDER: 4, FORWARD: 2 },
  { DEFENDER: 4, MIDFIELDER: 5, FORWARD: 1 },
  { DEFENDER: 4, MIDFIELDER: 3, FORWARD: 3 },
  { DEFENDER: 5, MIDFIELDER: 3, FORWARD: 2 },
  { DEFENDER: 5, MIDFIELDER: 4, FORWARD: 1 },
] as const;

const SQUAD_LIMITS: Record<SquadLineupPosition, number> = {
  GOALKEEPER: 2,
  DEFENDER: 5,
  MIDFIELDER: 5,
  FORWARD: 3,
};

/** Keeps a saved or edited squad within the FPL 2/5/5/3 and 15-player limits. */
export function normalizeFplSquadIds(
  ids: readonly number[],
  players: readonly SquadRosterPlayer[],
): number[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const seen = new Set<number>();
  const counts: Record<SquadLineupPosition, number> = {
    GOALKEEPER: 0,
    DEFENDER: 0,
    MIDFIELDER: 0,
    FORWARD: 0,
  };

  return ids.reduce<number[]>((legalIds, id) => {
    const player = playerById.get(id);
    if (
      !player ||
      seen.has(id) ||
      legalIds.length >= 15 ||
      counts[player.position] >= SQUAD_LIMITS[player.position]
    ) {
      return legalIds;
    }
    seen.add(id);
    counts[player.position] += 1;
    legalIds.push(id);
    return legalIds;
  }, []);
}

function byProjectedPoints(left: SquadLineupPlayer, right: SquadLineupPlayer) {
  return right.projectedPoints - left.projectedPoints || left.id - right.id;
}

/** Selects the legal FPL XI with the highest expected points, then captaincy. */
export function getOptimalSquadLineup(
  players: readonly SquadLineupPlayer[],
): OptimalSquadLineup {
  const goalkeepers = players
    .filter((player) => player.position === "GOALKEEPER")
    .sort(byProjectedPoints);
  const defenders = players
    .filter((player) => player.position === "DEFENDER")
    .sort(byProjectedPoints);
  const midfielders = players
    .filter((player) => player.position === "MIDFIELDER")
    .sort(byProjectedPoints);
  const forwards = players
    .filter((player) => player.position === "FORWARD")
    .sort(byProjectedPoints);

  let bestStarters: SquadLineupPlayer[] | null = null;
  let bestPoints = Number.NEGATIVE_INFINITY;

  for (const formation of FORMATIONS) {
    const starters = [
      goalkeepers[0],
      ...defenders.slice(0, formation.DEFENDER),
      ...midfielders.slice(0, formation.MIDFIELDER),
      ...forwards.slice(0, formation.FORWARD),
    ].filter((player): player is SquadLineupPlayer => player != null);
    if (starters.length !== 11) continue;

    const totalPoints = starters.reduce(
      (sum, player) => sum + player.projectedPoints,
      0,
    );
    if (totalPoints > bestPoints) {
      bestStarters = starters;
      bestPoints = totalPoints;
    }
  }

  if (!bestStarters) {
    return {
      starterIds: [],
      benchIds: players.map((player) => player.id),
      captainId: null,
      viceCaptainId: null,
    };
  }

  const captaincy = [...bestStarters].sort(byProjectedPoints);
  const starterIds = bestStarters.map((player) => player.id);
  return {
    starterIds,
    benchIds: players
      .filter((player) => !starterIds.includes(player.id))
      .map((player) => player.id),
    captainId: captaincy[0]?.id ?? null,
    viceCaptainId: captaincy[1]?.id ?? null,
  };
}
