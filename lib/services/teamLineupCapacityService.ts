export type TeamLineupPosition =
  | "GOALKEEPER"
  | "DEFENDER"
  | "MIDFIELDER"
  | "FORWARD";

/**
 * Conservative expected-starter budget for a single team in one fixture.
 * The allocator only reduces raw probabilities, leaving formation-specific
 * modelling for a later data-backed iteration.
 */
export const TEAM_LINEUP_START_CAPACITY: Record<TeamLineupPosition, number> = {
  GOALKEEPER: 1,
  DEFENDER: 5,
  MIDFIELDER: 5,
  FORWARD: 3,
};

export const TEAM_OUTFIELD_START_CAPACITY = 10;

export const TEAM_SUBSTITUTE_APPEARANCE_CAPACITY = 5;

export interface TeamStartCandidate {
  seasonPlayerId: number;
  team: string;
  position: TeamLineupPosition;
  startProbability: number;
}

export interface TeamLineupCandidate extends TeamStartCandidate {
  substituteAppearanceProbability: number;
}

export interface ConstrainedTeamLineupProbability {
  startProbability: number;
  substituteAppearanceProbability: number;
}

function clampProbability(value: number) {
  return Math.max(0, Math.min(1, value));
}

function applyPriorityCapacity(
  candidates: readonly TeamStartCandidate[],
  capacity: number,
  source: ReadonlyMap<number, number>,
) {
  const constrained = new Map(
    candidates.map((candidate) => [
      candidate.seasonPlayerId,
      source.get(candidate.seasonPlayerId) ?? 0,
    ]),
  );
  let excess =
    [...constrained.values()].reduce((sum, value) => sum + value, 0) - capacity;

  // Lower-probability candidates absorb most of the reduction. This avoids
  // treating a likely starter and a marginal squad option as equal rivals.
  while (excess > 1e-9) {
    const active = candidates.filter(
      (candidate) => (constrained.get(candidate.seasonPlayerId) ?? 0) > 1e-9,
    );
    if (active.length === 0) break;
    const weights = active.map((candidate) => {
      const priority = clampProbability(candidate.startProbability);
      return 0.01 + (1 - priority) ** 2;
    });
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let removed = 0;
    for (const [index, candidate] of active.entries()) {
      const current = constrained.get(candidate.seasonPlayerId) ?? 0;
      const reduction = Math.min(
        current,
        (excess * weights[index]) / totalWeight,
      );
      constrained.set(candidate.seasonPlayerId, current - reduction);
      removed += reduction;
    }
    if (removed <= 1e-9) break;
    excess -= removed;
  }

  return constrained;
}

/**
 * Applies FPL positional ceilings first, then scales only an over-subscribed
 * outfield group down to ten expected starters. A player can never receive a
 * higher start probability, but any legal FPL formation remains possible.
 */
export function constrainTeamStartProbabilities(
  candidates: readonly TeamStartCandidate[],
) {
  const positionConstrained = new Map<number, number>();
  const groups = new Map<string, TeamStartCandidate[]>();

  for (const candidate of candidates) {
    const key = `${candidate.team}:${candidate.position}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const capacity = TEAM_LINEUP_START_CAPACITY[group[0].position];
    const total = group.reduce(
      (sum, candidate) => sum + clampProbability(candidate.startProbability),
      0,
    );
    const raw = new Map(
      group.map((candidate) => [
        candidate.seasonPlayerId,
        clampProbability(candidate.startProbability),
      ]),
    );
    const capacityAdjusted =
      total > capacity ? applyPriorityCapacity(group, capacity, raw) : raw;
    for (const candidate of group) {
      positionConstrained.set(
        candidate.seasonPlayerId,
        capacityAdjusted.get(candidate.seasonPlayerId) ?? 0,
      );
    }
  }

  const constrained = new Map(positionConstrained);
  const teams = new Map<string, TeamStartCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.position === "GOALKEEPER") continue;
    const group = teams.get(candidate.team) ?? [];
    group.push(candidate);
    teams.set(candidate.team, group);
  }

  for (const group of teams.values()) {
    const total = group.reduce(
      (sum, candidate) =>
        sum + (positionConstrained.get(candidate.seasonPlayerId) ?? 0),
      0,
    );
    const capacityAdjusted =
      total > TEAM_OUTFIELD_START_CAPACITY
        ? applyPriorityCapacity(
            group,
            TEAM_OUTFIELD_START_CAPACITY,
            positionConstrained,
          )
        : positionConstrained;
    for (const candidate of group) {
      constrained.set(
        candidate.seasonPlayerId,
        capacityAdjusted.get(candidate.seasonPlayerId) ?? 0,
      );
    }
  }

  return constrained;
}

/**
 * Applies the start budget and the five-substitute match limit together.
 * Goalkeepers enter with zero substitute probability because goalkeeper
 * substitutions are exceptional rather than an expected weekly event.
 */
export function constrainTeamLineupProbabilities(
  candidates: readonly TeamLineupCandidate[],
) {
  const startProbabilities = constrainTeamStartProbabilities(candidates);
  const constrained = new Map<number, ConstrainedTeamLineupProbability>();
  const byTeam = new Map<string, TeamLineupCandidate[]>();

  for (const candidate of candidates) {
    const group = byTeam.get(candidate.team) ?? [];
    group.push(candidate);
    byTeam.set(candidate.team, group);
  }

  for (const group of byTeam.values()) {
    const totalSubstituteProbability = group.reduce(
      (sum, candidate) =>
        sum + clampProbability(candidate.substituteAppearanceProbability),
      0,
    );
    const substituteScale =
      totalSubstituteProbability > TEAM_SUBSTITUTE_APPEARANCE_CAPACITY
        ? TEAM_SUBSTITUTE_APPEARANCE_CAPACITY / totalSubstituteProbability
        : 1;
    for (const candidate of group) {
      constrained.set(candidate.seasonPlayerId, {
        startProbability: startProbabilities.get(candidate.seasonPlayerId) ?? 0,
        substituteAppearanceProbability:
          clampProbability(candidate.substituteAppearanceProbability) *
          substituteScale,
      });
    }
  }

  return constrained;
}
