process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/testdb";

import { strict as assert } from "node:assert";
import test from "node:test";
import { 
  calculateInvolvementScore, 
  calculateAssistBoost, 
  lambdaAttack 
} from "../../lib/services/prediction/attack";

const leagueAvg = {
  avg_xG: 1.45,
  avg_xGA: 1.45,
  avg_deep: 6.5,
  avg_ppda: 11.5,
};

test("calculateInvolvementScore: elite attacker should have high score", () => {
  const score = calculateInvolvementScore({
    xG90: 0.6,
    xA90: 0.3,
    keyPasses90: 2.5,
    touchesInBox90: 5,
    teamXg90: 1.5,
  });
  
  assert.ok(score > 0.45, `Elite attacker should have score > 0.45, got ${score}`);
});

test("calculateInvolvementScore: low involvement player should have low score", () => {
  const score = calculateInvolvementScore({
    xG90: 0.05,
    xA90: 0.05,
    keyPasses90: 0.5,
    touchesInBox90: 1,
    teamXg90: 1.5,
  });
  
  assert.ok(score < 0.3, `Low involvement should have score < 0.3, got ${score}`);
});

test("calculateInvolvementScore: score should be capped at 1", () => {
  const score = calculateInvolvementScore({
    xG90: 1.2, // unrealistically high
    xA90: 0.8,
    keyPasses90: 4,
    touchesInBox90: 8,
    teamXg90: 1.5,
  });
  
  assert.ok(score <= 1, `Score should be capped at 1, got ${score}`);
});

test("calculateAssistBoost: high xA player should get quality boost", () => {
  const boost = calculateAssistBoost({
    xA90: 0.4,
    keyPasses90: 2,
    leagueAvgXa90: 0.15,
  });
  
  // Expected from KP: 2 * 0.12 = 0.24, actual xA = 0.4
  // Quality boost = (0.4 - 0.24) * 0.5 = 0.08
  assert.ok(boost > 0, `High xA player should get positive boost, got ${boost}`);
});

test("calculateAssistBoost: unlucky player (high KP, low xA) should get boost", () => {
  const boost = calculateAssistBoost({
    xA90: 0.1,
    keyPasses90: 3,
    leagueAvgXa90: 0.15,
  });
  
  // Expected from KP: 3 * 0.12 = 0.36, actual xA = 0.1
  // Unlucky boost = (0.36 - 0.1) * 0.3 = 0.078
  assert.ok(boost > 0, `Unlucky player should get boost, got ${boost}`);
});

test("calculateAssistBoost: low key passes should return 0", () => {
  const boost = calculateAssistBoost({
    xA90: 0.1,
    keyPasses90: 0.3,
    leagueAvgXa90: 0.15,
  });
  
  assert.equal(boost, 0, "Low KP player should get no boost");
});

test("lambdaAttack: home team should have higher lambda", () => {
  const homeAttack = lambdaAttack(1.5, 1.5, 6, true, leagueAvg);
  const awayAttack = lambdaAttack(1.5, 1.5, 6, false, leagueAvg);
  
  assert.ok(homeAttack > awayAttack, "Home team should have higher attack lambda");
});

test("lambdaAttack: trend context should adjust lambda", () => {
  const withPositiveTrend = lambdaAttack(1.5, 1.5, 6, true, leagueAvg, {
    team_xG_trend: 0.1, // team scoring more recently
    opp_xGA_trend: 0.1, // opponent conceding more recently
  });
  
  const noTrend = lambdaAttack(1.5, 1.5, 6, true, leagueAvg);
  
  assert.ok(
    withPositiveTrend > noTrend,
    `Positive trends should increase lambda: ${withPositiveTrend} vs ${noTrend}`
  );
});

test("lambdaAttack: negative trend should decrease lambda", () => {
  const withNegativeTrend = lambdaAttack(1.5, 1.5, 6, true, leagueAvg, {
    team_xG_trend: -0.1, // team scoring less recently
  });
  
  const noTrend = lambdaAttack(1.5, 1.5, 6, true, leagueAvg);
  
  assert.ok(
    withNegativeTrend < noTrend,
    `Negative trend should decrease lambda: ${withNegativeTrend} vs ${noTrend}`
  );
});
