import { strict as assert } from "node:assert";
import test from "node:test";
import {
  parseSeasonPredictionPublicationFlag,
  buildGw1AuditReport,
  expectedFplAppearancePoints,
  expectedPreseasonDefconPoints,
  projectGw1PreseasonProfile,
  type Gw1PreseasonProfile,
} from "../lib/services/seasonPredictionPublicationService";
import {
  assessPreseasonPlayer,
  assessPreseasonSquad,
  buildBalancedPreseasonSquad,
  rankPreseasonSquads,
  type PreseasonPlayerInput,
} from "../lib/services/preseasonDecisionModel";

const profile: Gw1PreseasonProfile = {
  seasonPlayerId: 1,
  fplId: 10,
  playerId: 20,
  playerName: "Example",
  team: "AAA",
  position: "MIDFIELDER",
  price: 75,
  availability: { status: "a", chanceOfPlaying: null },
  gw1Fixtures: [{ fixtureId: 100, opponent: "BBB", isHome: true }],
  provenance: "PLAYER_PRIOR",
  confidence: "HIGH",
  confidenceScore: 0.9,
  uncertaintyReasons: [],
  priorMetrics: {
    xG90: 0.3,
    xA90: 0.2,
    touches90: 50,
    keyPasses90: 2,
    carries90: 18,
    defconActions90: 1,
    clearances90: 3,
  },
  priorUsage: { minutes: 2700, appearances: 34, starts: 30 },
};

test("GW1 preview is explicitly prior-only and carries its evidence", () => {
  const result = projectGw1PreseasonProfile(profile);
  assert.equal(result.estimateStatus, "PREVIEW_ONLY");
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.evidence.touches90, 50);
  assert.ok(result.totalXPts > 0);
  assert.equal(result.totalRange.label, "INDICATIVE");
  assert.ok(result.totalRange.lower < result.totalXPts);
  assert.ok(result.totalRange.upper > result.totalXPts);
  assert.ok(result.reliability.sixtyMinuteProbability > 0);
  assert.ok(result.reliability.score > 0);
  assert.ok(result.limitations.includes("NO_CURRENT_SEASON_FORM"));
  assert.ok(result.limitations.includes("NO_CURRENT_SEASON_TEAM_STRENGTH"));
  assert.ok(result.limitations.includes("NO_BONUS_OR_SAVE_MODEL"));
  assert.equal(result.fixtures[0].opponentStrength.source, "NEUTRAL");
  assert.equal(
    result.fixtures[0].opponentStrength.defensiveVulnerabilityMultiplier,
    1,
  );
});

test("GW1 preview applies a bounded historical opponent defensive prior", () => {
  const neutral = projectGw1PreseasonProfile(profile);
  const adjusted = projectGw1PreseasonProfile(profile, {
    sourceSeason: "2025/26",
    opponentStrengthByFixtureId: new Map([
      [
        100,
        {
          teamId: 9,
          matches: 38,
          goalsForPerMatch: 1.1,
          goalsConcededPerMatch: 1.8,
          attackMultiplier: 0.95,
          defensiveVulnerabilityMultiplier: 1.12,
          source: "HISTORICAL",
        },
      ],
    ]),
  });
  assert.ok(adjusted.totalXPts > neutral.totalXPts);
  assert.equal(adjusted.fixtures[0].opponentStrength.source, "HISTORICAL");
  assert.equal(adjusted.fixtures[0].opponentStrength.sourceSeason, "2025/26");
  assert.equal(
    adjusted.fixtures[0].opponentStrength.defensiveVulnerabilityMultiplier,
    1.12,
  );
});

test("pre-season DEFCON is threshold-based and scales with expected minutes", () => {
  const shortAppearance = expectedPreseasonDefconPoints({
    position: "DEFENDER",
    defconActions90: 14,
    expectedMinutes: 45,
    opponentAttackMultiplier: 1,
    teamDefensiveVulnerabilityMultiplier: 1,
    isHome: true,
  });
  const fullAppearance = expectedPreseasonDefconPoints({
    position: "DEFENDER",
    defconActions90: 14,
    expectedMinutes: 90,
    opponentAttackMultiplier: 1,
    teamDefensiveVulnerabilityMultiplier: 1,
    isHome: true,
  });
  assert.ok(shortAppearance > 0, "DEFCON has no artificial 60-minute gate");
  assert.ok(fullAppearance > shortAppearance);
  assert.equal(
    expectedPreseasonDefconPoints({
      position: "GOALKEEPER",
      defconActions90: 20,
      expectedMinutes: 90,
      opponentAttackMultiplier: 1,
      teamDefensiveVulnerabilityMultiplier: 1,
      isHome: true,
    }),
    0,
  );
});

test("pre-season ranges remain bounded and never imply a calibrated interval", () => {
  const result = projectGw1PreseasonProfile({
    ...profile,
    confidence: "LOW",
    confidenceScore: 0.2,
    priorUsage: { minutes: 180, appearances: 4, starts: 1 },
  });
  assert.equal(result.fixtures[0].range.label, "INDICATIVE");
  assert.ok(result.fixtures[0].range.lower >= 0);
  assert.ok(result.fixtures[0].range.upper > result.fixtures[0].range.lower);
  assert.ok(
    result.fixtures[0].range.upper - result.fixtures[0].range.lower <=
      Math.max(3.6, result.fixtures[0].xPts * 1.1),
  );
});

test("start probability follows starts per appearance rather than starts per 90", () => {
  const partTimePlayer = projectGw1PreseasonProfile({
    ...profile,
    priorUsage: { minutes: 1188, appearances: 31, starts: 13 },
  });
  assert.ok(partTimePlayer.fixtures[0].startProbability < 0.6);
  assert.ok(partTimePlayer.fixtures[0].expectedMinutes < 50);
});

test("GW1 preview fails safely to unavailable for a player ruled out", () => {
  const result = projectGw1PreseasonProfile({
    ...profile,
    availability: { status: "i", chanceOfPlaying: 0 },
  });
  assert.equal(result.estimateStatus, "UNAVAILABLE");
  assert.equal(result.totalXPts, 0);
  assert.equal(result.fixtures[0].expectedMinutes, 0);
});

test("zero expected minutes receive no FPL appearance or clean-sheet points", () => {
  const result = projectGw1PreseasonProfile(profile, {
    preseasonMinutesEvidence: {
      seasonPlayerId: profile.seasonPlayerId,
      teamCode: "AAA",
      playerName: "Example",
      totalMinutes: 0,
      possibleMinutes: 180,
      matchMinutes: [0, 0],
      participationRate: 0,
      expectedMinutesCap: 0,
      sourceUrl: "https://example.com/tracker",
      fetchedAt: new Date("2026-08-07T00:00:00.000Z"),
    },
  });
  assert.equal(
    expectedFplAppearancePoints({ expectedMinutes: 0, startProbability: 0.9 }),
    0,
  );
  assert.equal(result.fixtures[0].expectedMinutes, 0);
  assert.equal(result.fixtures[0].startProbability, 0);
  assert.equal(result.fixtures[0].breakdown.appearance, 0);
  assert.equal(result.fixtures[0].breakdown.cleanSheet, 0);
  assert.equal(result.totalXPts, 0);
});

test("manual preseason evidence can cap minutes but cannot add points", () => {
  const baseline = projectGw1PreseasonProfile(profile);
  const capped = projectGw1PreseasonProfile(profile, {
    manualOverride: {
      id: 1,
      kind: "MANAGED_MINUTES",
      availabilityCap: null,
      startProbabilityCap: null,
      expectedMinutesCap: 30,
      appliesThroughGameweek: 1,
      note: "Managed return after a late preseason.",
      sourceUrl: null,
    },
  });

  assert.ok(capped.totalXPts < baseline.totalXPts);
  assert.equal(capped.fixtures[0].expectedMinutes, 30);
  assert.ok(capped.limitations.includes("MANUAL_MANAGED_MINUTES"));
});

test("Google Sheets preseason minutes cap can only lower a projection", () => {
  const baseline = projectGw1PreseasonProfile(profile);
  const capped = projectGw1PreseasonProfile(profile, {
    preseasonMinutesEvidence: {
      seasonPlayerId: profile.seasonPlayerId,
      teamCode: "AAA",
      playerName: "Example",
      totalMinutes: 190,
      possibleMinutes: 360,
      matchMinutes: [45, 55, 0, 90],
      participationRate: 0.5278,
      expectedMinutesCap: 40,
      sourceUrl: "https://example.com/tracker",
      fetchedAt: new Date("2026-08-07T00:00:00.000Z"),
    },
  });

  assert.ok(capped.totalXPts < baseline.totalXPts);
  assert.equal(capped.fixtures[0].expectedMinutes, 40);
  assert.ok(capped.limitations.includes("PRESEASON_MINUTES_TRACKER_EVIDENCE"));
});

test("confirmed starter notes remain evidence-only and cannot inflate xPts", () => {
  const baseline = projectGw1PreseasonProfile(profile);
  const confirmedStarter = projectGw1PreseasonProfile(profile, {
    manualOverride: {
      id: 2,
      kind: "CONFIRMED_STARTER",
      availabilityCap: null,
      startProbabilityCap: null,
      expectedMinutesCap: null,
      appliesThroughGameweek: 1,
      note: "Confirmed starter in the final friendly.",
      sourceUrl: null,
    },
  });

  assert.equal(confirmedStarter.totalXPts, baseline.totalXPts);
  assert.ok(confirmedStarter.limitations.includes("MANUAL_CONFIRMED_STARTER"));
});

test("GW1 preview labels a missing attacking prior as partial instead of hiding it", () => {
  const result = projectGw1PreseasonProfile({
    ...profile,
    priorMetrics: { ...profile.priorMetrics, xG90: null },
  });
  assert.equal(result.estimateStatus, "PARTIAL");
  assert.ok(result.limitations.includes("MISSING_XG90_NO_GOAL_ESTIMATE"));
});

test("season prediction publication flag is fail-closed", () => {
  assert.equal(parseSeasonPredictionPublicationFlag(undefined), false);
  assert.equal(parseSeasonPredictionPublicationFlag("false"), false);
  assert.equal(parseSeasonPredictionPublicationFlag("true"), true);
});

test("GW1 audit keeps the comparison separate from calibration", () => {
  const report = buildGw1AuditReport(
    [
      { seasonPlayerId: 1, fplId: 10, confidence: "HIGH", totalXPts: 4 },
      { seasonPlayerId: 2, fplId: 11, confidence: "LOW", totalXPts: 2 },
    ],
    new Map([
      [1, 6],
      [2, 0],
    ]),
  );
  assert.equal(report.players, 2);
  assert.equal(report.bias, 0);
  assert.equal(report.mae, 2);
  assert.equal(report.byConfidence.HIGH.bias, 2);
  assert.equal(report.byConfidence.LOW.bias, -2);
});

test("preseason player reliability separates a stable starter from continuity risk", () => {
  const stable = assessPreseasonPlayer({
    ...profile,
    id: profile.seasonPlayerId,
    projectedPoints: 5,
  });
  const transfer = assessPreseasonPlayer({
    ...profile,
    id: profile.seasonPlayerId + 1,
    projectedPoints: 5,
    uncertaintyReasons: ["TRANSFER", "SMALL_SAMPLE"],
    priorUsage: { minutes: 300, appearances: 7, starts: 3 },
  });
  assert.ok(stable.reliability.score > transfer.reliability.score);
  assert.ok(transfer.reliability.reasons.includes("TRANSFER"));
  assert.ok(transfer.reliability.reasons.includes("LIMITED_EVIDENCE"));
});

function playerInput(
  id: number,
  position: PreseasonPlayerInput["position"],
): PreseasonPlayerInput {
  return {
    id,
    team: `T${id}`,
    position,
    price:
      position === "GOALKEEPER"
        ? 40
        : position === "DEFENDER"
          ? 45
          : position === "MIDFIELDER"
            ? 55
            : 60,
    projectedPoints: position === "MIDFIELDER" ? 5 : 4,
    availability: { status: "a", chanceOfPlaying: 100 },
    confidence: "HIGH",
    confidenceScore: 0.9,
    uncertaintyReasons: [],
    priorUsage: { minutes: 2700, appearances: 34, starts: 30 },
    priorMetrics: {
      xG90: 0.2,
      xA90: 0.15,
      touches90: 45,
      keyPasses90: 1.5,
      carries90: 15,
      defconActions90: 1,
      clearances90: 3,
    },
  };
}

function validSquad() {
  const players = [
    ...[1, 2].map((id) => playerInput(id, "GOALKEEPER")),
    ...[3, 4, 5, 6, 7].map((id) => playerInput(id, "DEFENDER")),
    ...[8, 9, 10, 11, 12].map((id) => playerInput(id, "MIDFIELDER")),
    ...[13, 14, 15].map((id) => playerInput(id, "FORWARD")),
  ].map(assessPreseasonPlayer);
  return {
    players,
    starterIds: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
    benchIds: [2, 6, 7, 12],
    captainId: 8,
    viceCaptainId: 13,
    bank: 240,
  };
}

test("preseason squad assessment exposes a viable scorecard and a rejected unavailable starter", () => {
  const squad = validSquad();
  const viable = assessPreseasonSquad(squad);
  assert.equal(viable.verdict, "VIABLE");
  assert.equal(viable.validation.valid, true);
  assert.ok(viable.reliability.startingXI >= 65);
  assert.ok(viable.resilience.score >= 55);

  const unavailable = {
    ...squad,
    players: squad.players.map((player) =>
      player.id === 1
        ? assessPreseasonPlayer({
            ...player,
            availability: { status: "i", chanceOfPlaying: 0 },
          })
        : player,
    ),
  };
  const rejected = assessPreseasonSquad(unavailable);
  assert.equal(rejected.verdict, "REJECT");
  assert.ok(rejected.concerns.includes("UNAVAILABLE_STARTER:1"));
});

test("strategy changes the order only when comparing explicit squad alternatives", () => {
  const safer = assessPreseasonSquad(validSquad());
  const riskierInput = validSquad();
  riskierInput.players = riskierInput.players.map((player) =>
    player.id === 8
      ? assessPreseasonPlayer({
          ...player,
          projectedPoints: 9,
          uncertaintyReasons: ["TRANSFER", "NO_PL_HISTORY"],
          priorUsage: { minutes: 0, appearances: 0, starts: null },
        })
      : player,
  );
  const riskier = assessPreseasonSquad(riskierInput);
  const safeRank = rankPreseasonSquads(
    [
      { id: "safer", assessment: safer },
      { id: "riskier", assessment: riskier },
    ],
    "SAFE",
  );
  assert.equal(safeRank[0].id, "safer");
});

function autoPickPlayer(
  id: number,
  position: PreseasonPlayerInput["position"],
  team: string,
  price: number,
  projectedPoints: number,
) {
  return assessPreseasonPlayer({
    ...playerInput(id, position),
    team,
    price,
    projectedPoints,
  });
}

test("balanced auto-pick optimises a legal whole squad rather than individual stars", () => {
  const candidates = [
    ...[40, 45, 50, 55].map((price, index) =>
      autoPickPlayer(index + 1, "GOALKEEPER", `G${index}`, price, 3 + index),
    ),
    ...[45, 50, 55, 60, 65, 70, 75].map((price, index) =>
      autoPickPlayer(
        index + 10,
        "DEFENDER",
        index < 3 ? "Elite-DEF" : `D${index}`,
        price,
        3.5 + index * 0.35,
      ),
    ),
    ...[50, 60, 70, 70, 80, 90, 100].map((price, index) =>
      autoPickPlayer(
        index + 20,
        "MIDFIELDER",
        index < 3 ? "Elite-MID" : `M${index}`,
        price,
        4 + index * 0.45,
      ),
    ),
    ...[55, 70, 85, 100, 120].map((price, index) =>
      autoPickPlayer(
        index + 30,
        "FORWARD",
        index < 3 ? "Elite-FWD" : `F${index}`,
        price,
        4 + index * 0.55,
      ),
    ),
  ];

  const result = buildBalancedPreseasonSquad(candidates);
  const counts = Object.fromEntries(
    ["GOALKEEPER", "DEFENDER", "MIDFIELDER", "FORWARD"].map((position) => [
      position,
      result.squad.players.filter((player) => player.position === position)
        .length,
    ]),
  );
  const byTeam = new Map<string, number>();
  for (const player of result.squad.players) {
    byTeam.set(player.team, (byTeam.get(player.team) ?? 0) + 1);
  }

  assert.equal(result.assessment.validation.valid, true);
  assert.deepEqual(counts, {
    GOALKEEPER: 2,
    DEFENDER: 5,
    MIDFIELDER: 5,
    FORWARD: 3,
  });
  assert.ok(result.spent + result.bank === 1000);
  assert.ok([...byTeam.values()].every((count) => count <= 3));
  assert.equal(result.squad.starterIds.length, 11);
  assert.equal(result.squad.benchIds.length, 4);
  assert.ok(result.squad.starterIds.includes(result.squad.captainId));
  assert.ok(
    result.rationale.some((line) => line.includes("whole legal squad")),
  );
});
