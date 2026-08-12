import { strict as assert } from "node:assert";
import test from "node:test";
import {
  blendCurrentRate,
  canUseCurrentSeasonBootstrap,
  calculateH2hRateAdjustment,
  expectedSavePoints,
  rollingRoleConfidence,
  rollingStartProbability,
} from "../lib/services/rollingPredictionService";

test("pre-season rolling forecasts do not reuse stale bootstrap totals", () => {
  assert.equal(canUseCurrentSeasonBootstrap(0), false);
  assert.equal(canUseCurrentSeasonBootstrap(1), true);
});

test("current-season rates move gradually away from the prior", () => {
  const early = blendCurrentRate({
    prior: 0.2,
    current: 0.5,
    currentMinutes: 90,
  });
  const established = blendCurrentRate({
    prior: 0.2,
    current: 0.5,
    currentMinutes: 900,
  });
  assert.ok(early != null && established != null);
  assert.ok(early > 0.2 && early < 0.5);
  assert.ok(established > early && established < 0.5);
});

test("rolling minutes update the start probability without overreacting to one cameo", () => {
  const cameo = rollingStartProbability({
    priorMinutes: 2400,
    priorAppearances: 30,
    currentMinutes: 15,
    currentAppearances: 1,
  });
  const regular = rollingStartProbability({
    priorMinutes: 900,
    priorAppearances: 20,
    currentMinutes: 360,
    currentAppearances: 4,
  });
  assert.ok(cameo != null && regular != null);
  assert.ok(cameo > 0.5);
  assert.ok(regular > cameo);
});

test("rolling role confidence updates gradually for every position after new minutes", () => {
  const unchanged = rollingRoleConfidence({
    priorConfidenceScore: 0.45,
    currentMinutes: 0,
    currentAppearances: 0,
    nextStartProbability: 0.8,
  });
  const firstStart = rollingRoleConfidence({
    priorConfidenceScore: 0.45,
    currentMinutes: 90,
    currentAppearances: 1,
    nextStartProbability: 0.8,
  });
  const established = rollingRoleConfidence({
    priorConfidenceScore: 0.45,
    currentMinutes: 450,
    currentAppearances: 5,
    nextStartProbability: 0.9,
  });

  assert.equal(unchanged.score, 0.45);
  assert.ok(firstStart.score > unchanged.score);
  assert.ok(established.score > firstStart.score);
  assert.equal(established.confidence, "HIGH");
});

test("expected save points reward only complete save trios in expectation", () => {
  assert.equal(expectedSavePoints(0), 0);
  assert.ok(expectedSavePoints(3) > 0);
  assert.ok(expectedSavePoints(6) > expectedSavePoints(3));
});

test("H2H uses at most two matches and cannot dominate the player baseline", () => {
  const adjustment = calculateH2hRateAdjustment({
    baseXG90: 0.5,
    baseXA90: 0.2,
    matches: [
      { minutes: 90, xG: 1.2, xA: 0.6 },
      { minutes: 90, xG: 1.2, xA: 0.6, goals: 2, assists: 1 },
      { minutes: 90, xG: 2, xA: 2 },
    ],
  });
  assert.ok(adjustment);
  assert.equal(adjustment.matches, 2);
  assert.ok(adjustment.weight <= 0.15);
  assert.ok((adjustment.xG90Adjusted ?? 0) > 0.5);
  assert.ok((adjustment.xG90Adjusted ?? 0) < 0.54);
  assert.equal(adjustment.goals, 2);
  assert.equal(adjustment.assists, 1);
});

test("H2H remains unavailable for a cameo-sized sample", () => {
  assert.equal(
    calculateH2hRateAdjustment({
      baseXG90: 0.4,
      baseXA90: 0.2,
      matches: [{ minutes: 30, xG: 0.8, xA: 0.4 }],
    }),
    null,
  );
});

test("H2H adjustment does not invent a rate when the player baseline is absent", () => {
  const adjustment = calculateH2hRateAdjustment({
    baseXG90: null,
    baseXA90: null,
    matches: [{ minutes: 90, xG: 1, xA: 0.5 }],
  });
  assert.ok(adjustment);
  assert.equal(adjustment.xG90Adjusted, null);
  assert.equal(adjustment.xA90Adjusted, null);
});
