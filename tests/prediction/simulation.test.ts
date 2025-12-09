process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/testdb";

import { strict as assert } from "node:assert";
import test from "node:test";
import { 
  simulateGame, 
  quickSimulate,
  samplePoisson,
  sampleMinutes,
} from "../../lib/services/prediction/simulation";

// ============================================================================
// Sampling Tests
// ============================================================================

test("samplePoisson: should return non-negative integers", () => {
  for (let i = 0; i < 100; i++) {
    const sample = samplePoisson(1.5);
    assert.ok(sample >= 0, "Poisson sample should be >= 0");
    assert.ok(Number.isInteger(sample), "Poisson sample should be integer");
  }
});

test("samplePoisson: lambda=0 should always return 0", () => {
  for (let i = 0; i < 10; i++) {
    assert.equal(samplePoisson(0), 0);
  }
});

test("sampleMinutes: should return values in valid range", () => {
  for (let i = 0; i < 100; i++) {
    const minutes = sampleMinutes({
      startProbability: 0.8,
      expectedMinutes: 70,
      prob60: 0.75,
    });
    assert.ok(minutes >= 0 && minutes <= 90, `Minutes should be 0-90, got ${minutes}`);
  }
});

// ============================================================================
// Simulation Tests
// ============================================================================

test("simulateGame: should return valid statistics", () => {
  const output = simulateGame({
    playerId: 1,
    playerName: "Test Player",
    position: "MIDFIELDER",
    startProbability: 0.9,
    expectedMinutes: 75,
    prob60: 0.85,
    xG: 0.4,
    xA: 0.25,
    csProb: 0.3,
    cbit90: 5,
    cbirt90: 8,
  }, 500);
  
  assert.equal(output.playerId, 1);
  assert.equal(output.simulations, 500);
  assert.ok(output.stats.mean >= 0, "Mean should be >= 0");
  assert.ok(output.stats.stdDev >= 0, "StdDev should be >= 0");
  assert.ok(output.stats.min <= output.stats.max, "Min should be <= Max");
  assert.ok(output.stats.percentile25 <= output.stats.median, "P25 <= median");
  assert.ok(output.stats.median <= output.stats.percentile75, "Median <= P75");
});

test("simulateGame: distribution should sum to 1", () => {
  const output = simulateGame({
    playerId: 1,
    playerName: "Test",
    position: "FORWARD",
    startProbability: 0.8,
    expectedMinutes: 70,
    prob60: 0.75,
    xG: 0.5,
    xA: 0.2,
    csProb: 0.2,
    cbit90: 3,
    cbirt90: 5,
  }, 1000);
  
  const sum = output.distribution.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.01, `Distribution should sum to ~1, got ${sum}`);
});

test("simulateGame: high xG player should have higher mean", () => {
  const lowXg = simulateGame({
    playerId: 1,
    playerName: "Low xG",
    position: "FORWARD",
    startProbability: 0.9,
    expectedMinutes: 80,
    prob60: 0.85,
    xG: 0.1,
    xA: 0.1,
    csProb: 0.2,
    cbit90: 2,
    cbirt90: 4,
  }, 500);
  
  const highXg = simulateGame({
    playerId: 2,
    playerName: "High xG",
    position: "FORWARD",
    startProbability: 0.9,
    expectedMinutes: 80,
    prob60: 0.85,
    xG: 0.8,
    xA: 0.4,
    csProb: 0.2,
    cbit90: 2,
    cbirt90: 4,
  }, 500);
  
  assert.ok(
    highXg.stats.mean > lowXg.stats.mean,
    `High xG (${highXg.stats.mean}) should have higher mean than low xG (${lowXg.stats.mean})`
  );
});

test("simulateGame: haul_probability should be reasonable", () => {
  const output = simulateGame({
    playerId: 1,
    playerName: "Star Player",
    position: "MIDFIELDER",
    startProbability: 0.95,
    expectedMinutes: 85,
    prob60: 0.92,
    xG: 0.6,
    xA: 0.4,
    csProb: 0.35,
    cbit90: 6,
    cbirt90: 10,
  }, 1000);
  
  assert.ok(output.haul_probability >= 0 && output.haul_probability <= 1);
  assert.ok(output.blank_probability >= 0 && output.blank_probability <= 1);
});

test("quickSimulate: should return reasonable expected value", () => {
  const expected = quickSimulate({
    playerId: 1,
    playerName: "Test",
    position: "DEFENDER",
    startProbability: 0.9,
    expectedMinutes: 80,
    prob60: 0.88,
    xG: 0.1,
    xA: 0.05,
    csProb: 0.4,
    cbit90: 12,
    cbirt90: 14,
  }, 100);
  
  assert.ok(expected >= 1 && expected <= 10, `Expected ${expected} should be reasonable`);
});

test("simulateGame: defender with high CS prob should have bonus points", () => {
  const output = simulateGame({
    playerId: 1,
    playerName: "CB",
    position: "DEFENDER",
    startProbability: 0.95,
    expectedMinutes: 88,
    prob60: 0.93,
    xG: 0.05,
    xA: 0.02,
    csProb: 0.5, // High CS probability
    cbit90: 14, // High DEFCON potential
    cbirt90: 16,
  }, 500);
  
  assert.ok(output.stats.mean > 3, `Defender mean (${output.stats.mean}) should be > 3`);
});
