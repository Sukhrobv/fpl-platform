import { strict as assert } from "node:assert";
import test from "node:test";
import { currentSeasonFplId } from "../lib/services/fpl-personal-service";

test("linked squads use the current season FPL element ID", () => {
  assert.equal(currentSeasonFplId([{ fplId: 801 }]), 801);
});

test("linked squads fail clearly when a player has no current registration", () => {
  assert.throws(
    () => currentSeasonFplId([]),
    /missing from the current season roster/,
  );
});
