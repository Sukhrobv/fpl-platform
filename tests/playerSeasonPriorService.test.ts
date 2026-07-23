import { strict as assert } from "node:assert";
import test from "node:test";
import {
  applyUncertaintyFlags,
  blendPriorWithCurrent,
  classifyPriorConfidence,
  per90OrNull,
  shrinkRate,
} from "../lib/services/playerSeasonPriorService";

test("per90OrNull preserves missing evidence instead of fabricating zero", () => {
  assert.equal(per90OrNull(null, 900), null);
  assert.equal(per90OrNull(10, 0), null);
  assert.equal(per90OrNull(0, 900), 0);
  assert.equal(per90OrNull(10, 900), 1);
});

test("shrinkRate pulls a small observed sample toward its baseline", () => {
  const small = shrinkRate(1, 0.2, 90, 900)!;
  const large = shrinkRate(1, 0.2, 2700, 900)!;
  assert.ok(small < large);
  assert.ok(Math.abs(small - 0.2727) < 0.001);
  assert.equal(shrinkRate(null, 0.2, 90), null);
});

test("early-season role evidence updates faster than stable event rates", () => {
  const eventRate = blendPriorWithCurrent(
    0.2,
    { value: 0.8, minutes: 180 },
    "eventRate",
  )!;
  const role = blendPriorWithCurrent(
    0.2,
    { value: 0.8, minutes: 180 },
    "role",
  )!;
  assert.ok(role > eventRate);
  assert.equal(blendPriorWithCurrent(null, { value: null, minutes: 0 }), null);
});

test("context changes lower confidence and expose explicit reasons", () => {
  const adjusted = applyUncertaintyFlags(0.9, {
    transfer: true,
    positionChange: true,
  });
  assert.ok(adjusted.score < 0.9);
  assert.deepEqual(adjusted.reasons, ["TRANSFER", "POSITION_CHANGE"]);
  assert.equal(classifyPriorConfidence(adjusted.score), adjusted.confidence);
});
