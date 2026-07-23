import { strict as assert } from "node:assert";
import test from "node:test";
import { parseFeatureFlag } from "../lib/services/enrichmentFeatureFlags";

test("parseFeatureFlag is fail-closed", () => {
  assert.equal(parseFeatureFlag(undefined), false);
  assert.equal(parseFeatureFlag("false"), false);
  assert.equal(parseFeatureFlag("unexpected"), false);
  assert.equal(parseFeatureFlag(" TRUE "), true);
});
