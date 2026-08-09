import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildTeamStrengthPriors,
  evaluateHistoricalWalkForward,
} from "../lib/services/historicalWalkForwardService";

test("team strength priors shrink short samples and keep opponent factors bounded", () => {
  const priors = buildTeamStrengthPriors([
    {
      gameweek: 1,
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 4,
      awayScore: 0,
      finished: true,
    },
  ]);
  const weakDefense = priors.byTeamId.get(2);
  assert.ok(weakDefense);
  assert.equal(weakDefense.source, "HISTORICAL");
  assert.ok(weakDefense.defensiveVulnerabilityMultiplier > 1);
  assert.ok(weakDefense.defensiveVulnerabilityMultiplier <= 1.18);
});

test("walk-forward uses only earlier gameweeks and reports an opponent-factor comparison", () => {
  const report = evaluateHistoricalWalkForward({
    sourceSeason: "2025/26",
    firstGameweek: 3,
    minimumHistoryFixtures: 2,
    fixtures: [
      {
        gameweek: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        homeScore: 3,
        awayScore: 0,
        finished: true,
      },
      {
        gameweek: 2,
        homeTeamId: 1,
        awayTeamId: 2,
        homeScore: 2,
        awayScore: 0,
        finished: true,
      },
      {
        gameweek: 3,
        homeTeamId: 3,
        awayTeamId: 2,
        homeScore: 1,
        awayScore: 0,
        finished: true,
      },
    ],
    playerRows: [
      {
        gameweek: 1,
        playerId: 10,
        teamId: 1,
        opponentTeamId: 2,
        minutes: 90,
        totalPoints: 4,
      },
      {
        gameweek: 2,
        playerId: 10,
        teamId: 1,
        opponentTeamId: 2,
        minutes: 90,
        totalPoints: 4,
      },
      {
        gameweek: 3,
        playerId: 10,
        teamId: 3,
        opponentTeamId: 2,
        minutes: 90,
        totalPoints: 5,
      },
    ],
  });
  assert.equal(report.baseline.rows, 1);
  assert.equal(report.historicalOpponentRows, 1);
  assert.equal(report.neutralOpponentRows, 0);
  assert.equal(report.baseline.meanPredictedPoints, 4);
  assert.ok(report.opponentAdjusted.meanPredictedPoints > 4);
});
