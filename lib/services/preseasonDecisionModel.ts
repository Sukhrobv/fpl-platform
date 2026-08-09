import type { PriorConfidence } from "@prisma/client";

export type PreseasonPosition =
  | "GOALKEEPER"
  | "DEFENDER"
  | "MIDFIELDER"
  | "FORWARD";
export type PreseasonStrategy = "SAFE" | "BALANCED" | "AGGRESSIVE";

export interface PreseasonPlayerInput {
  id: number;
  team: string;
  position: PreseasonPosition;
  price: number;
  projectedPoints: number;
  availability: { status: string; chanceOfPlaying: number | null };
  confidence: PriorConfidence;
  confidenceScore: number;
  uncertaintyReasons: string[];
  priorUsage: { minutes: number; appearances: number; starts: number | null };
  priorMetrics: {
    xG90: number | null;
    xA90: number | null;
    touches90: number | null;
    keyPasses90: number | null;
    carries90: number | null;
    defconActions90: number | null;
    clearances90: number | null;
  };
}

export interface PlayerReliability {
  availabilityProbability: number;
  startGivenAvailableProbability: number;
  sixtyMinuteProbability: number;
  roleContinuity: number;
  evidenceQuality: number;
  score: number;
  reasons: string[];
}

export interface PreseasonPlayerAssessment extends PreseasonPlayerInput {
  reliability: PlayerReliability;
}

const START_RATE_BASELINE: Record<PreseasonPosition, number> = {
  GOALKEEPER: 0.72,
  DEFENDER: 0.67,
  MIDFIELDER: 0.64,
  FORWARD: 0.6,
};

const CONTINUITY_MULTIPLIERS: Record<string, number> = {
  TRANSFER: 0.85,
  POSITION_CHANGE: 0.75,
  PROMOTED_TEAM: 0.8,
  NEW_MANAGER: 0.9,
  NO_PL_HISTORY: 0.35,
};

const REQUIRED_METRICS: Record<
  PreseasonPosition,
  Array<keyof PreseasonPlayerInput["priorMetrics"]>
> = {
  GOALKEEPER: ["xG90", "xA90"],
  DEFENDER: [
    "xG90",
    "xA90",
    "touches90",
    "keyPasses90",
    "carries90",
    "defconActions90",
  ],
  MIDFIELDER: [
    "xG90",
    "xA90",
    "touches90",
    "keyPasses90",
    "carries90",
    "defconActions90",
  ],
  FORWARD: [
    "xG90",
    "xA90",
    "touches90",
    "keyPasses90",
    "carries90",
    "defconActions90",
  ],
};

function clamp(value: number, lower = 0, upper = 1) {
  return Math.max(lower, Math.min(upper, value));
}

function availabilityProbability(player: PreseasonPlayerInput) {
  if (player.availability.chanceOfPlaying != null) {
    return player.availability.chanceOfPlaying / 100;
  }
  return player.availability.status.toLowerCase() === "a" ? 1 : 0.65;
}

/**
 * Estimate only the conditional chance of a start. Availability stays separate
 * so that every component of the reliability score can be inspected.
 */
export function startGivenAvailableProbability(player: PreseasonPlayerInput) {
  const baseline = START_RATE_BASELINE[player.position];
  const appearances = player.priorUsage.appearances;
  const starts = player.priorUsage.starts;
  if (starts == null || appearances === 0) return baseline;
  const observed = clamp(starts / appearances);
  const shrinkageMatches = 8;
  return clamp(
    (observed * appearances + baseline * shrinkageMatches) /
      (appearances + shrinkageMatches),
  );
}

function roleContinuity(player: PreseasonPlayerInput) {
  return clamp(
    player.uncertaintyReasons.reduce(
      (score, reason) => score * (CONTINUITY_MULTIPLIERS[reason] ?? 1),
      1,
    ),
  );
}

function evidenceQuality(player: PreseasonPlayerInput) {
  const metrics = REQUIRED_METRICS[player.position];
  const metricCoverage =
    metrics.filter((metric) => player.priorMetrics[metric] != null).length /
    metrics.length;
  const minutesEvidence = clamp(player.priorUsage.minutes / 1800);
  return clamp(minutesEvidence * 0.7 + metricCoverage * 0.3);
}

export function assessPreseasonPlayer(
  player: PreseasonPlayerInput,
): PreseasonPlayerAssessment {
  const availability = availabilityProbability(player);
  const startGivenAvailable = startGivenAvailableProbability(player);
  const sixtyMinuteProbability = availability * startGivenAvailable * 0.92;
  const continuity = roleContinuity(player);
  const evidence = evidenceQuality(player);
  const reasons = [
    ...player.uncertaintyReasons,
    ...(availability < 1 ? ["AVAILABILITY_RISK"] : []),
    ...(startGivenAvailable < 0.65 ? ["START_RISK"] : []),
    ...(evidence < 0.6 ? ["LIMITED_EVIDENCE"] : []),
  ];
  const score =
    (sixtyMinuteProbability * 0.6 + continuity * 0.25 + evidence * 0.15) * 100;
  return {
    ...player,
    reliability: {
      availabilityProbability: Number(availability.toFixed(3)),
      startGivenAvailableProbability: Number(startGivenAvailable.toFixed(3)),
      sixtyMinuteProbability: Number(sixtyMinuteProbability.toFixed(3)),
      roleContinuity: Number(continuity.toFixed(3)),
      evidenceQuality: Number(evidence.toFixed(3)),
      score: Number(score.toFixed(1)),
      reasons: [...new Set(reasons)].sort(),
    },
  };
}

export interface SquadInput {
  players: PreseasonPlayerAssessment[];
  starterIds: number[];
  benchIds: number[];
  captainId: number;
  viceCaptainId: number;
  bank: number;
}

export interface SquadValidation {
  valid: boolean;
  errors: string[];
}

interface SquadMembers {
  starters: PreseasonPlayerAssessment[];
  bench: PreseasonPlayerAssessment[];
}

function validFormation(players: PreseasonPlayerAssessment[]) {
  const counts = Object.fromEntries(
    (Object.keys(START_RATE_BASELINE) as PreseasonPosition[]).map(
      (position) => [
        position,
        players.filter((player) => player.position === position).length,
      ],
    ),
  ) as Record<PreseasonPosition, number>;
  return (
    players.length === 11 &&
    counts.GOALKEEPER === 1 &&
    counts.DEFENDER >= 3 &&
    counts.MIDFIELDER >= 2 &&
    counts.FORWARD >= 1
  );
}

function squadMembers(input: SquadInput): SquadMembers {
  const playerById = new Map(
    input.players.map((player) => [player.id, player]),
  );
  return {
    starters: input.starterIds
      .map((id) => playerById.get(id))
      .filter((player): player is PreseasonPlayerAssessment => player != null),
    bench: input.benchIds
      .map((id) => playerById.get(id))
      .filter((player): player is PreseasonPlayerAssessment => player != null),
  };
}

export function validatePreseasonSquad(input: SquadInput): SquadValidation {
  const errors: string[] = [];
  const ids = input.players.map((player) => player.id);
  if (input.players.length !== 15 || new Set(ids).size !== 15) {
    errors.push("SQUAD_MUST_CONTAIN_15_UNIQUE_PLAYERS");
  }
  const expected: Record<PreseasonPosition, number> = {
    GOALKEEPER: 2,
    DEFENDER: 5,
    MIDFIELDER: 5,
    FORWARD: 3,
  };
  for (const position of Object.keys(expected) as PreseasonPosition[]) {
    if (
      input.players.filter((player) => player.position === position).length !==
      expected[position]
    ) {
      errors.push(`INVALID_${position}_COUNT`);
    }
  }
  if (
    input.players.reduce((sum, player) => sum + player.price, 0) + input.bank >
    1000
  ) {
    errors.push("BUDGET_EXCEEDED");
  }
  if (
    [...new Set(input.players.map((player) => player.team))].some(
      (team) =>
        input.players.filter((player) => player.team === team).length > 3,
    )
  ) {
    errors.push("TEAM_LIMIT_EXCEEDED");
  }
  if (
    new Set(input.starterIds).size !== 11 ||
    new Set(input.benchIds).size !== 4
  ) {
    errors.push("INVALID_STARTER_OR_BENCH_COUNT");
  }
  const selectedIds = [...input.starterIds, ...input.benchIds];
  if (
    new Set(selectedIds).size !== 15 ||
    selectedIds.some((id) => !ids.includes(id)) ||
    ids.some((id) => !selectedIds.includes(id))
  ) {
    errors.push("STARTERS_AND_BENCH_MUST_PARTITION_SQUAD");
  }
  const { starters } = squadMembers(input);
  if (!validFormation(starters)) errors.push("INVALID_STARTING_FORMATION");
  if (
    !input.starterIds.includes(input.captainId) ||
    !input.starterIds.includes(input.viceCaptainId) ||
    input.captainId === input.viceCaptainId
  ) {
    errors.push("INVALID_CAPTAINCY_PAIR");
  }
  return { valid: errors.length === 0, errors };
}

function substituteReliability(
  starter: PreseasonPlayerAssessment,
  members: SquadMembers,
) {
  const remainingStarters = members.starters.filter(
    (player) => player.id !== starter.id,
  );
  const substitute = members.bench.find((candidate) =>
    validFormation([...remainingStarters, candidate]),
  );
  return substitute?.reliability.score ?? 0;
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;
  return (
    values.reduce((sum, item) => sum + item.value * item.weight, 0) /
    totalWeight
  );
}

function teamDiversification(starters: PreseasonPlayerAssessment[]) {
  if (starters.length === 0) return 0;
  const totalPotential = starters.reduce(
    (sum, player) => sum + Math.max(player.projectedPoints, 0.01),
    0,
  );
  const byTeam = new Map<string, number>();
  for (const player of starters) {
    byTeam.set(
      player.team,
      (byTeam.get(player.team) ?? 0) + Math.max(player.projectedPoints, 0.01),
    );
  }
  const hhi = [...byTeam.values()].reduce(
    (sum, potential) => sum + (potential / totalPotential) ** 2,
    0,
  );
  const minimumHhi = 1 / starters.length;
  return clamp(1 - (hhi - minimumHhi) / (1 - minimumHhi)) * 100;
}

export interface SquadAssessment {
  validation: SquadValidation;
  potential: {
    startingXI: number;
    benchContribution: number;
    total: number;
  };
  reliability: { startingXI: number };
  resilience: {
    benchCoverage: number;
    teamDiversification: number;
    liquidity: number;
    captainRedundancy: number;
    score: number;
  };
  verdict: "REJECT" | "REVIEW" | "VIABLE";
  concerns: string[];
}

export function assessPreseasonSquad(input: SquadInput): SquadAssessment {
  const validation = validatePreseasonSquad(input);
  const { starters, bench } = squadMembers(input);
  const startingPotential = starters.reduce(
    (sum, player) => sum + player.projectedPoints,
    0,
  );
  const benchPotential = bench.reduce(
    (sum, player) => sum + player.projectedPoints * 0.2,
    0,
  );
  const startingReliability = weightedAverage(
    starters.map((player) => ({
      value: player.reliability.score,
      weight: Math.max(player.projectedPoints, 0.01),
    })),
  );
  const benchCoverage = weightedAverage(
    starters.map((starter) => ({
      value: substituteReliability(starter, { starters, bench }),
      weight: 1 - starter.reliability.sixtyMinuteProbability,
    })),
  );
  const diversification = teamDiversification(starters);
  const liquidity = clamp(input.bank / 10) * 100;
  const captain = starters.find((player) => player.id === input.captainId);
  const viceCaptain = starters.find(
    (player) => player.id === input.viceCaptainId,
  );
  const captainRedundancy =
    captain && viceCaptain
      ? clamp(
          (viceCaptain.reliability.score / 100) * 0.6 +
            Math.min(
              1,
              viceCaptain.projectedPoints /
                Math.max(captain.projectedPoints, 0.01),
            ) *
              0.4,
        ) * 100
      : 0;
  const resilience =
    benchCoverage * 0.4 +
    diversification * 0.25 +
    liquidity * 0.2 +
    captainRedundancy * 0.15;
  const concerns = [
    ...validation.errors,
    ...starters
      .filter((player) => player.reliability.availabilityProbability === 0)
      .map((player) => `UNAVAILABLE_STARTER:${player.id}`),
    ...(startingReliability < 65 ? ["LOW_STARTING_XI_RELIABILITY"] : []),
    ...(resilience < 55 ? ["LOW_SQUAD_RESILIENCE"] : []),
  ];
  const verdict =
    concerns.some(
      (concern) =>
        concern.startsWith("UNAVAILABLE_STARTER") ||
        ["BUDGET_EXCEEDED", "TEAM_LIMIT_EXCEEDED"].includes(concern),
    ) || !validation.valid
      ? "REJECT"
      : concerns.length > 0
        ? "REVIEW"
        : "VIABLE";
  return {
    validation,
    potential: {
      startingXI: Number(startingPotential.toFixed(2)),
      benchContribution: Number(benchPotential.toFixed(2)),
      total: Number((startingPotential + benchPotential).toFixed(2)),
    },
    reliability: { startingXI: Number(startingReliability.toFixed(1)) },
    resilience: {
      benchCoverage: Number(benchCoverage.toFixed(1)),
      teamDiversification: Number(diversification.toFixed(1)),
      liquidity: Number(liquidity.toFixed(1)),
      captainRedundancy: Number(captainRedundancy.toFixed(1)),
      score: Number(resilience.toFixed(1)),
    },
    verdict,
    concerns,
  };
}

export function rankPreseasonSquads(
  squads: Array<{ id: string; assessment: SquadAssessment }>,
  strategy: PreseasonStrategy,
) {
  const potentials = squads.map((squad) => squad.assessment.potential.total);
  const maxPotential = Math.max(...potentials);
  const weights: Record<PreseasonStrategy, [number, number, number]> = {
    SAFE: [0.35, 0.45, 0.2],
    BALANCED: [0.5, 0.3, 0.2],
    AGGRESSIVE: [0.65, 0.15, 0.2],
  };
  const [potentialWeight, reliabilityWeight, resilienceWeight] =
    weights[strategy];
  return squads
    .map((squad) => {
      const potential =
        maxPotential === 0
          ? 0
          : (squad.assessment.potential.total / maxPotential) * 100;
      const utility =
        potential * potentialWeight +
        squad.assessment.reliability.startingXI * reliabilityWeight +
        squad.assessment.resilience.score * resilienceWeight;
      return {
        id: squad.id,
        potential: Number(potential.toFixed(1)),
        utility: Number(utility.toFixed(1)),
        verdict: squad.assessment.verdict,
      };
    })
    .sort(
      (left, right) =>
        right.utility - left.utility || left.id.localeCompare(right.id),
    );
}

const SQUAD_POSITION_COUNTS: Record<PreseasonPosition, number> = {
  GOALKEEPER: 2,
  DEFENDER: 5,
  MIDFIELDER: 5,
  FORWARD: 3,
};

export interface BalancedAutoPickResult {
  squad: SquadInput;
  assessment: SquadAssessment;
  objective: number;
  spent: number;
  bank: number;
  captainBonus: number;
  concentrationPenalty: number;
  allocation: Record<PreseasonPosition, number>;
  rationale: string[];
}

function teamCount(players: PreseasonPlayerAssessment[], team: string) {
  return players.filter((player) => player.team === team).length;
}

function roleEvidenceAdjustment(player: PreseasonPlayerAssessment) {
  return (
    (player.reliability.roleContinuity +
      player.reliability.evidenceQuality -
      1) *
    0.12
  );
}

function starterValue(player: PreseasonPlayerAssessment) {
  return player.projectedPoints + roleEvidenceAdjustment(player);
}

function balancedStartingIds(players: PreseasonPlayerAssessment[]) {
  const byPosition = (position: PreseasonPosition) =>
    players
      .filter((player) => player.position === position)
      .sort((left, right) => starterValue(right) - starterValue(left));
  const locked = [
    ...byPosition("GOALKEEPER").slice(0, 1),
    ...byPosition("DEFENDER").slice(0, 3),
    ...byPosition("MIDFIELDER").slice(0, 2),
    ...byPosition("FORWARD").slice(0, 1),
  ];
  const starterIds = new Set(locked.map((player) => player.id));
  const starters = [...locked];
  const starterPositionCounts = Object.fromEntries(
    (Object.keys(SQUAD_POSITION_COUNTS) as PreseasonPosition[]).map(
      (position) => [
        position,
        starters.filter((player) => player.position === position).length,
      ],
    ),
  ) as Record<PreseasonPosition, number>;
  for (const player of [...players].sort(
    (left, right) => starterValue(right) - starterValue(left),
  )) {
    if (starters.length === 11) break;
    if (starterIds.has(player.id)) continue;
    if (
      starterPositionCounts[player.position] >=
      SQUAD_POSITION_COUNTS[player.position]
    ) {
      continue;
    }
    starters.push(player);
    starterIds.add(player.id);
    starterPositionCounts[player.position] += 1;
  }
  return starters.map((player) => player.id);
}

function concentrationPenalty(players: PreseasonPlayerAssessment[]) {
  const byTeam = new Map<string, PreseasonPlayerAssessment[]>();
  for (const player of players) {
    byTeam.set(player.team, [...(byTeam.get(player.team) ?? []), player]);
  }
  let penalty = 0;
  for (const teamPlayers of byTeam.values()) {
    const attackers = teamPlayers.filter(
      (player) =>
        player.position === "MIDFIELDER" || player.position === "FORWARD",
    ).length;
    const defenders = teamPlayers.filter(
      (player) =>
        player.position === "GOALKEEPER" || player.position === "DEFENDER",
    ).length;
    if (attackers >= 2) penalty += 0.16;
    if (attackers >= 3) penalty += 0.3;
    if (defenders >= 2) penalty += 0.08;
    if (teamPlayers.length === 3) penalty += 0.08;
  }
  return penalty;
}

function evaluateBalancedSquad(players: PreseasonPlayerAssessment[]) {
  const starterIds = balancedStartingIds(players);
  const starters = players.filter((player) => starterIds.includes(player.id));
  const bench = players.filter((player) => !starterIds.includes(player.id));
  const captaincyOrder = [...starters].sort(
    (left, right) => starterValue(right) - starterValue(left),
  );
  const captain = captaincyOrder[0];
  const viceCaptain = captaincyOrder[1];
  if (!captain || !viceCaptain) throw new Error("Captaincy candidates missing");
  const captainBonus = captain.projectedPoints;
  const penalty = concentrationPenalty(players);
  const objective =
    starters.reduce((sum, player) => sum + starterValue(player), 0) +
    captainBonus +
    bench.reduce((sum, player) => sum + player.projectedPoints * 0.12, 0) -
    penalty;
  return {
    starterIds,
    captainId: captain.id,
    viceCaptainId: viceCaptain.id,
    captainBonus,
    concentrationPenalty: penalty,
    objective,
  };
}

function candidatePool(
  players: PreseasonPlayerAssessment[],
  position: PreseasonPosition,
) {
  const eligible = players.filter(
    (player) =>
      player.position === position &&
      player.reliability.availabilityProbability > 0 &&
      player.projectedPoints > 0,
  );
  const byPotential = [...eligible]
    .sort((left, right) => starterValue(right) - starterValue(left))
    .slice(0, 90);
  const byEfficiency = [...eligible]
    .sort(
      (left, right) =>
        right.projectedPoints / Math.max(right.price, 1) -
        left.projectedPoints / Math.max(left.price, 1),
    )
    .slice(0, 90);
  const byPrice = [...eligible]
    .sort(
      (left, right) =>
        left.price - right.price || starterValue(right) - starterValue(left),
    )
    .slice(0, 60);
  return [
    ...new Map(
      [...byPotential, ...byEfficiency, ...byPrice].map((player) => [
        player.id,
        player,
      ]),
    ).values(),
  ];
}

/**
 * Deterministic first-pass GW1 optimiser. It starts with the cheapest legal
 * 15-player shell, then repeatedly takes the largest valid marginal upgrade.
 * Price is never rewarded directly: it only constrains which upgrades fit.
 */
export function buildBalancedPreseasonSquad(
  players: PreseasonPlayerAssessment[],
): BalancedAutoPickResult {
  const pools = Object.fromEntries(
    (Object.keys(SQUAD_POSITION_COUNTS) as PreseasonPosition[]).map(
      (position) => [position, candidatePool(players, position)],
    ),
  ) as Record<PreseasonPosition, PreseasonPlayerAssessment[]>;
  const selected: PreseasonPlayerAssessment[] = [];
  for (const position of Object.keys(
    SQUAD_POSITION_COUNTS,
  ) as PreseasonPosition[]) {
    const needed = SQUAD_POSITION_COUNTS[position];
    const cheapestLegal = [...pools[position]].sort(
      (left, right) =>
        left.price - right.price || starterValue(right) - starterValue(left),
    );
    for (const initialTeamLimit of [2, 3]) {
      for (const player of cheapestLegal) {
        if (
          selected.filter((candidate) => candidate.position === position)
            .length >= needed
        ) {
          break;
        }
        if (selected.some((candidate) => candidate.id === player.id)) {
          continue;
        }
        if (teamCount(selected, player.team) >= initialTeamLimit) continue;
        selected.push(player);
      }
    }
    if (
      selected.filter((player) => player.position === position).length !==
      needed
    ) {
      throw new Error(
        `Not enough eligible ${position} players for a legal squad`,
      );
    }
  }
  if (selected.reduce((sum, player) => sum + player.price, 0) > 1000) {
    throw new Error("No eligible 15-player squad fits the £100m budget");
  }

  let current = [...selected];
  let currentEvaluation = evaluateBalancedSquad(current);
  for (let iteration = 0; iteration < 80; iteration += 1) {
    let best: PreseasonPlayerAssessment[] | null = null;
    let bestEvaluation = currentEvaluation;
    const currentCost = current.reduce((sum, player) => sum + player.price, 0);
    for (const outgoing of current) {
      for (const incoming of pools[outgoing.position]) {
        if (
          incoming.id === outgoing.id ||
          current.some((player) => player.id === incoming.id)
        ) {
          continue;
        }
        const nextCost = currentCost - outgoing.price + incoming.price;
        if (nextCost > 1000) continue;
        const withoutOutgoing = current.filter(
          (player) => player.id !== outgoing.id,
        );
        if (teamCount(withoutOutgoing, incoming.team) >= 3) continue;
        const next = [...withoutOutgoing, incoming];
        const nextEvaluation = evaluateBalancedSquad(next);
        if (nextEvaluation.objective > bestEvaluation.objective + 0.0001) {
          best = next;
          bestEvaluation = nextEvaluation;
        }
      }
    }
    if (!best) break;
    current = best;
    currentEvaluation = bestEvaluation;
  }

  const spent = current.reduce((sum, player) => sum + player.price, 0);
  const bank = 1000 - spent;
  const squad: SquadInput = {
    players: current,
    starterIds: currentEvaluation.starterIds,
    benchIds: current
      .filter((player) => !currentEvaluation.starterIds.includes(player.id))
      .map((player) => player.id),
    captainId: currentEvaluation.captainId,
    viceCaptainId: currentEvaluation.viceCaptainId,
    bank,
  };
  const assessment = assessPreseasonSquad(squad);
  if (!assessment.validation.valid) {
    throw new Error(
      `Balanced auto-pick produced an invalid squad: ${assessment.validation.errors.join(", ")}`,
    );
  }
  const teamSlots = new Set(current.map((player) => player.team)).size;
  const allocation = Object.fromEntries(
    (Object.keys(SQUAD_POSITION_COUNTS) as PreseasonPosition[]).map(
      (position) => [
        position,
        current
          .filter((player) => player.position === position)
          .reduce((sum, player) => sum + player.price, 0),
      ],
    ),
  ) as Record<PreseasonPosition, number>;
  return {
    squad,
    assessment,
    objective: Number(currentEvaluation.objective.toFixed(3)),
    spent,
    bank,
    captainBonus: Number(currentEvaluation.captainBonus.toFixed(2)),
    concentrationPenalty: Number(
      currentEvaluation.concentrationPenalty.toFixed(2),
    ),
    allocation,
    rationale: [
      `£${(spent / 10).toFixed(1)} spent; £${(bank / 10).toFixed(1)} remains unallocated.`,
      `Allocation: GK £${(allocation.GOALKEEPER / 10).toFixed(1)}, DEF £${(allocation.DEFENDER / 10).toFixed(1)}, MID £${(allocation.MIDFIELDER / 10).toFixed(1)}, FWD £${(allocation.FORWARD / 10).toFixed(1)}.`,
      `Captain bonus adds ${currentEvaluation.captainBonus.toFixed(2)} GW1 xPts.`,
      `${teamSlots} teams selected; concentration penalty ${currentEvaluation.concentrationPenalty.toFixed(2)}.`,
      "Every swap was accepted only when it improved the whole legal squad, not a single player ranking.",
    ],
  };
}
