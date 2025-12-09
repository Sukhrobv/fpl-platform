process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/testdb";

import { strict as assert } from "node:assert";
import test from "node:test";
import { 
  poissonPmf, 
  calculatePoissonGoalPoints, 
  calculatePoissonAssistPoints,
  calculatePoissonAttackPoints,
  calculateSmartBonus 
} from "../../lib/services/prediction/points";

test("poissonPmf: P(0|λ=1) should be approximately 0.368", () => {
  const prob = poissonPmf(1, 0);
  assert.ok(Math.abs(prob - 0.368) < 0.01, `Expected ~0.368, got ${prob}`);
});

test("poissonPmf: P(1|λ=1) should be approximately 0.368", () => {
  const prob = poissonPmf(1, 1);
  assert.ok(Math.abs(prob - 0.368) < 0.01, `Expected ~0.368, got ${prob}`);
});

test("poissonPmf: P(2|λ=1) should be approximately 0.184", () => {
  const prob = poissonPmf(1, 2);
  assert.ok(Math.abs(prob - 0.184) < 0.01, `Expected ~0.184, got ${prob}`);
});

test("poissonPmf: λ=0 should give P(0)=1, P(k>0)=0", () => {
  assert.equal(poissonPmf(0, 0), 1);
  assert.equal(poissonPmf(0, 1), 0);
  assert.equal(poissonPmf(0, 2), 0);
});

test("poissonPmf: sum of probabilities should be ~1", () => {
  let sum = 0;
  for (let k = 0; k <= 10; k++) {
    sum += poissonPmf(0.5, k);
  }
  assert.ok(Math.abs(sum - 1) < 0.001, `Sum should be ~1, got ${sum}`);
});

test("calculatePoissonGoalPoints: should return expected points for forward", () => {
  const result = calculatePoissonGoalPoints({ xG: 0.5, position: "FORWARD" });
  
  // For FWD, goal = 4 pts. Expected = 4 * 0.5 = 2 (simplified)
  // With Poisson: Σ P(k) * 4 * k ≈ 4 * λ = 2
  assert.ok(result.expectedPoints > 1.8 && result.expectedPoints < 2.2, 
    `Expected ~2 pts, got ${result.expectedPoints}`);
  assert.ok(result.distribution.length > 0, "Should have distribution");
});

test("calculatePoissonGoalPoints: midfielder should get more points per goal", () => {
  const fwd = calculatePoissonGoalPoints({ xG: 0.5, position: "FORWARD" });
  const mid = calculatePoissonGoalPoints({ xG: 0.5, position: "MIDFIELDER" });
  
  assert.ok(mid.expectedPoints > fwd.expectedPoints, 
    `MID (5pts/goal) should get more than FWD (4pts/goal)`);
});

test("calculatePoissonAssistPoints: should return 3 pts per xA", () => {
  const result = calculatePoissonAssistPoints({ xA: 0.3 });
  
  // Expected = 3 * 0.3 = 0.9
  assert.ok(result.expectedPoints > 0.8 && result.expectedPoints < 1.0, 
    `Expected ~0.9 pts, got ${result.expectedPoints}`);
});

test("calculatePoissonAttackPoints: should combine goals and assists", () => {
  const result = calculatePoissonAttackPoints({
    xG: 0.5,
    xA: 0.3,
    position: "FORWARD",
  });
  
  assert.ok(result.totalAttackPoints > 2.5, "Total should be > 2.5");
  assert.equal(
    result.totalAttackPoints, 
    result.goalPoints + result.assistPoints,
    "Total should equal goals + assists"
  );
});

test("calculateSmartBonus: high xG should give higher bonus", () => {
  const highXg = calculateSmartBonus({
    position: "FORWARD",
    xG_hat: 0.8,
    xA_hat: 0.3,
    prob_cs: 0.3,
    win_prob: 0.5,
    isKeyPlayer: true,
  });
  
  const lowXg = calculateSmartBonus({
    position: "FORWARD",
    xG_hat: 0.1,
    xA_hat: 0.1,
    prob_cs: 0.3,
    win_prob: 0.5,
    isKeyPlayer: false,
  });
  
  assert.ok(highXg > lowXg, `High xG (${highXg}) should have higher bonus than low xG (${lowXg})`);
});

test("calculateSmartBonus: should be capped at 3", () => {
  const bonus = calculateSmartBonus({
    position: "MIDFIELDER",
    xG_hat: 2.0, // unrealistically high
    xA_hat: 1.0,
    prob_cs: 0.9,
    win_prob: 0.9,
    isKeyPlayer: true,
  });
  
  assert.ok(bonus <= 3, `Bonus should be capped at 3, got ${bonus}`);
});

test("calculateSmartBonus: defender with clean sheet potential", () => {
  const bonus = calculateSmartBonus({
    position: "DEFENDER",
    xG_hat: 0.1,
    xA_hat: 0.1,
    prob_cs: 0.5,
    win_prob: 0.6,
    isKeyPlayer: true,
  });
  
  assert.ok(bonus > 0, `Defender with CS potential should have bonus > 0, got ${bonus}`);
});
