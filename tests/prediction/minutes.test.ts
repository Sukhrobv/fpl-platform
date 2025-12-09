process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/testdb";

import { strict as assert } from "node:assert";
import test from "node:test";
import { predictMinutesAndProbability, POS_MINUTES_SETTINGS, CAMEO_MINUTES } from "../../lib/services/prediction/minutes";

const baseOpts = {
  position: "MIDFIELDER" as const,
  seasonStats: { minutes: 2700, games: 30 }, // avg 90 min/game
  recentStats: { minutes: 450, games: 5 },   // avg 90 min/game
  chanceOfPlaying: 100,
};

test("predictMinutesAndProbability: base case without context", () => {
  const result = predictMinutesAndProbability(baseOpts);
  
  assert.ok(result.start_probability > 0.8, "High-minute player should have high start prob");
  assert.ok(result.expected_minutes > 70, "Should expect near full 90 minutes");
  assert.ok(result.prob_60 !== undefined, "Should return prob_60");
});

test("predictMinutesAndProbability: rest_days penalty", () => {
  const withRest = predictMinutesAndProbability({
    ...baseOpts,
    context: { rest_days: 2 }, // short turnaround
  });
  
  const withoutRest = predictMinutesAndProbability({
    ...baseOpts,
    context: { rest_days: 7 }, // normal rest
  });
  
  assert.ok(
    withRest.start_probability < withoutRest.start_probability,
    "Short rest should reduce start_probability"
  );
  assert.ok(
    withRest.expected_minutes < withoutRest.expected_minutes,
    "Short rest should reduce expected_minutes"
  );
});

test("predictMinutesAndProbability: Europe penalty", () => {
  const withEurope = predictMinutesAndProbability({
    ...baseOpts,
    context: { has_midweek_europe_before: true },
  });
  
  const withoutEurope = predictMinutesAndProbability({
    ...baseOpts,
    context: { has_midweek_europe_before: false },
  });
  
  assert.ok(
    withEurope.start_probability < withoutEurope.start_probability,
    "Europe game should reduce start_probability"
  );
  assert.ok(
    withEurope.prob_60! < withoutEurope.prob_60!,
    "Europe game should reduce prob_60"
  );
});

test("predictMinutesAndProbability: injury recovery penalty", () => {
  const longInjury = predictMinutesAndProbability({
    ...baseOpts,
    context: { days_out: 45 },
  });
  
  const mediumInjury = predictMinutesAndProbability({
    ...baseOpts,
    context: { days_out: 25 },
  });
  
  const noInjury = predictMinutesAndProbability({
    ...baseOpts,
    context: { days_out: null },
  });
  
  assert.ok(longInjury.expected_minutes <= 25, "Long injury: target ~20-25 minutes");
  assert.ok(mediumInjury.expected_minutes <= 40, "Medium injury: target ~35-40 minutes");
  assert.ok(noInjury.expected_minutes > 70, "No injury: normal minutes");
});

test("predictMinutesAndProbability: first game back penalty", () => {
  const firstGameBack = predictMinutesAndProbability({
    ...baseOpts,
    context: { game_index_since_return: 0 },
  });
  
  const thirdGameBack = predictMinutesAndProbability({
    ...baseOpts,
    context: { game_index_since_return: 2 },
  });
  
  assert.ok(
    firstGameBack.start_probability < thirdGameBack.start_probability,
    "First game back should have lower start prob"
  );
});

test("predictMinutesAndProbability: impact sub role penalty", () => {
  const impactSub = predictMinutesAndProbability({
    ...baseOpts,
    context: { perSub_ratio: 1.5 }, // high xG from sub appearances
  });
  
  const starter = predictMinutesAndProbability({
    ...baseOpts,
    context: { perSub_ratio: 0.5 }, // better as starter
  });
  
  assert.ok(
    impactSub.start_probability < starter.start_probability,
    "Impact sub should have lower start prob"
  );
  assert.ok(
    impactSub.expected_minutes <= 35,
    "Impact sub should have capped minutes"
  );
});

test("predictMinutesAndProbability: combined penalties", () => {
  const combined = predictMinutesAndProbability({
    ...baseOpts,
    context: {
      rest_days: 2,
      has_midweek_europe_before: true,
      game_index_since_return: 0,
    },
  });
  
  const baseResult = predictMinutesAndProbability(baseOpts);
  
  // Combined penalties should significantly reduce probability
  // 0.85 * 0.9 * 0.7 = 0.5355 of base
  assert.ok(
    combined.start_probability < baseResult.start_probability * 0.6,
    "Combined penalties should stack"
  );
});
