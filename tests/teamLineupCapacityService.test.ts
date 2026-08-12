import { strict as assert } from "node:assert";
import test from "node:test";
import {
  TEAM_LINEUP_START_CAPACITY,
  TEAM_OUTFIELD_START_CAPACITY,
  TEAM_SUBSTITUTE_APPEARANCE_CAPACITY,
  constrainTeamLineupProbabilities,
  constrainTeamStartProbabilities,
} from "../lib/services/teamLineupCapacityService";

test("team lineup capacity prevents two goalkeepers from both being likely starters", () => {
  const result = constrainTeamStartProbabilities([
    {
      seasonPlayerId: 1,
      team: "MCI",
      position: "GOALKEEPER",
      startProbability: 0.82,
    },
    {
      seasonPlayerId: 2,
      team: "MCI",
      position: "GOALKEEPER",
      startProbability: 0.78,
    },
  ]);

  const total = [...result.values()].reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - TEAM_LINEUP_START_CAPACITY.GOALKEEPER) < 1e-9);
  assert.ok((result.get(1) ?? 0) < 0.82);
  assert.ok((result.get(2) ?? 0) < 0.78);
});

test("team lineup capacity retains a feasible five-defender formation", () => {
  const result = constrainTeamStartProbabilities([
    ...Array.from({ length: 5 }, (_, index) => ({
      seasonPlayerId: index + 1,
      team: "MCI",
      position: "DEFENDER" as const,
      startProbability: 1,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      seasonPlayerId: index + 6,
      team: "MCI",
      position: "MIDFIELDER" as const,
      startProbability: 1,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      seasonPlayerId: index + 9,
      team: "MCI",
      position: "FORWARD" as const,
      startProbability: 1,
    })),
  ]);

  const total = [...result.values()].reduce((sum, value) => sum + value, 0);
  assert.equal(total, TEAM_OUTFIELD_START_CAPACITY);
  assert.equal(
    [...result.entries()]
      .filter(([seasonPlayerId]) => seasonPlayerId <= 5)
      .reduce((sum, [, value]) => sum + value, 0),
    TEAM_LINEUP_START_CAPACITY.DEFENDER,
  );
});

test("team lineup capacity limits a crowded defensive depth chart", () => {
  const result = constrainTeamStartProbabilities(
    Array.from({ length: 10 }, (_, index) => ({
      seasonPlayerId: index + 1,
      team: "MCI",
      position: "DEFENDER" as const,
      startProbability: 0.8,
    })),
  );

  const total = [...result.values()].reduce((sum, value) => sum + value, 0);
  assert.ok(total <= TEAM_LINEUP_START_CAPACITY.DEFENDER + 1e-9);
  assert.ok([...result.values()].every((value) => value < 0.8));
});

test("team lineup capacity protects a likely starter before reducing fringe options", () => {
  const result = constrainTeamStartProbabilities([
    {
      seasonPlayerId: 1,
      team: "MCI",
      position: "FORWARD",
      startProbability: 0.92,
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      seasonPlayerId: index + 2,
      team: "MCI",
      position: "FORWARD" as const,
      startProbability: 0.78,
    })),
  ]);

  const likelyStarterReduction = 0.92 - (result.get(1) ?? 0);
  const fringeReduction = 0.78 - (result.get(2) ?? 0);
  assert.ok(likelyStarterReduction < fringeReduction);
  assert.ok((result.get(1) ?? 0) > 0.8);
});

test("team lineup capacity leaves feasible probabilities unchanged", () => {
  const result = constrainTeamStartProbabilities([
    {
      seasonPlayerId: 1,
      team: "ARS",
      position: "FORWARD",
      startProbability: 0.7,
    },
    {
      seasonPlayerId: 2,
      team: "ARS",
      position: "FORWARD",
      startProbability: 0.6,
    },
  ]);

  assert.equal(result.get(1), 0.7);
  assert.equal(result.get(2), 0.6);
});

test("team lineup capacity limits bench appearances and excludes goalkeeper substitutes", () => {
  const result = constrainTeamLineupProbabilities([
    {
      seasonPlayerId: 1,
      team: "MCI",
      position: "GOALKEEPER",
      startProbability: 0.7,
      substituteAppearanceProbability: 0,
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      seasonPlayerId: index + 2,
      team: "MCI",
      position: "DEFENDER" as const,
      startProbability: 0.3,
      substituteAppearanceProbability: 0.55,
    })),
  ]);

  const totalSubstituteProbability = [...result.values()].reduce(
    (sum, value) => sum + value.substituteAppearanceProbability,
    0,
  );
  assert.ok(
    Math.abs(totalSubstituteProbability - TEAM_SUBSTITUTE_APPEARANCE_CAPACITY) <
      1e-9,
  );
  assert.equal(result.get(1)?.substituteAppearanceProbability, 0);
});
