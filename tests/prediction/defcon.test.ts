process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/testdb";

import { strict as assert } from "node:assert";
import test from "node:test";
import { 
  calculateDefconPoints, 
  calculateExpectedDefconPoints 
} from "../../lib/services/prediction/points";
import { buildDefenseFeatures } from "../../lib/services/prediction/features/defenseFeatures";

// ============================================================================
// DEFCON Points Tests
// ============================================================================

test("calculateDefconPoints: DEF with 10 CBIT should get 2 pts", () => {
  const result = calculateDefconPoints({
    position: "DEFENDER",
    clearances: 4,
    blocks: 2,
    interceptions: 2,
    tackles: 2,
    recoveries: 5, // Should be ignored for DEF
  });
  
  assert.equal(result.points, 2, "Should get 2 DEFCON points");
  assert.equal(result.totalActions, 10, "CBIT should be 10");
  assert.equal(result.threshold, 10, "Threshold should be 10 for DEF");
  assert.equal(result.qualified, true);
});

test("calculateDefconPoints: DEF with 9 CBIT should get 0 pts", () => {
  const result = calculateDefconPoints({
    position: "DEFENDER",
    clearances: 3,
    blocks: 2,
    interceptions: 2,
    tackles: 2,
    recoveries: 10, // Still ignored
  });
  
  assert.equal(result.points, 0, "Should not qualify with 9 CBIT");
  assert.equal(result.totalActions, 9);
  assert.equal(result.qualified, false);
});

test("calculateDefconPoints: GK with 10 CBIT should get 2 pts", () => {
  const result = calculateDefconPoints({
    position: "GOALKEEPER",
    clearances: 5,
    blocks: 2,
    interceptions: 2,
    tackles: 1,
    recoveries: 0,
  });
  
  assert.equal(result.points, 2);
  assert.equal(result.threshold, 10);
});

test("calculateDefconPoints: MID with 12 CBIRT should get 2 pts", () => {
  const result = calculateDefconPoints({
    position: "MIDFIELDER",
    clearances: 2,
    blocks: 1,
    interceptions: 3,
    tackles: 2, // CBIT = 8
    recoveries: 4, // CBIRT = 12
  });
  
  assert.equal(result.points, 2, "MID should get 2 pts with 12 CBIRT");
  assert.equal(result.totalActions, 12);
  assert.equal(result.threshold, 12);
  assert.equal(result.qualified, true);
});

test("calculateDefconPoints: MID with 11 CBIRT should get 0 pts", () => {
  const result = calculateDefconPoints({
    position: "MIDFIELDER",
    clearances: 2,
    blocks: 1,
    interceptions: 2,
    tackles: 2,
    recoveries: 4, // CBIRT = 11
  });
  
  assert.equal(result.points, 0, "MID should not qualify with 11 CBIRT");
  assert.equal(result.qualified, false);
});

test("calculateDefconPoints: FWD with 12 CBIRT should get 2 pts", () => {
  const result = calculateDefconPoints({
    position: "FORWARD",
    clearances: 0,
    blocks: 0,
    interceptions: 1,
    tackles: 3,
    recoveries: 8, // CBIRT = 12
  });
  
  assert.equal(result.points, 2);
  assert.equal(result.threshold, 12);
});

// ============================================================================
// Expected DEFCON Points Tests
// ============================================================================

test("calculateExpectedDefconPoints: high CBIT DEF should have positive expected pts", () => {
  const expected = calculateExpectedDefconPoints({
    position: "DEFENDER",
    cbit90: 12, // High defensive activity
    cbirt90: 12,
    prob_60: 0.9,
  });
  
  assert.ok(expected > 0.5, `Expected > 0.5, got ${expected}`);
  assert.ok(expected <= 2, "Should not exceed 2");
});

test("calculateExpectedDefconPoints: low CBIT DEF should have near-zero expected pts", () => {
  const expected = calculateExpectedDefconPoints({
    position: "DEFENDER",
    cbit90: 4, // Low defensive activity
    cbirt90: 4,
    prob_60: 0.9,
  });
  
  assert.ok(expected < 0.2, `Expected < 0.2, got ${expected}`);
});

// ============================================================================
// Defense Features Tests
// ============================================================================

test("buildDefenseFeatures: should calculate per-90 stats", () => {
  const features = buildDefenseFeatures([
    { clearances: 5, blocks: 2, interceptions: 3, tackles: 2, recoveries: 4 },
    { clearances: 3, blocks: 1, interceptions: 2, tackles: 3, recoveries: 5 },
  ], 180); // 2 full games
  
  assert.ok(features.cbit90 > 0, "Should have CBIT per 90");
  assert.ok(features.cbirt90 > features.cbit90, "CBIRT should include recoveries");
  assert.ok(features.prob_defcon >= 0 && features.prob_defcon <= 1, "Prob should be 0-1");
});

test("buildDefenseFeatures: empty matches should return zeros", () => {
  const features = buildDefenseFeatures([], 0);
  
  assert.equal(features.cbit90, 0);
  assert.equal(features.cbirt90, 0);
  assert.equal(features.prob_defcon, 0);
});
