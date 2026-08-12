import { strict as assert } from "node:assert";
import test from "node:test";
import {
  emptyPreseasonSquadDraftState,
  preseasonSquadDraftStateSchema,
} from "../lib/services/preseasonSquadDraftService";

test("an empty preseason draft is valid and safe to persist", () => {
  assert.deepEqual(
    preseasonSquadDraftStateSchema.parse(emptyPreseasonSquadDraftState()),
    {
      playerIds: [],
      starterIds: [],
      captainId: null,
      viceCaptainId: null,
      bank: 0,
    },
  );
});

test("a preseason draft rejects invalid captaincy and duplicate players", () => {
  const duplicate = preseasonSquadDraftStateSchema.safeParse({
    playerIds: [11, 11],
    starterIds: [11],
    captainId: 11,
    viceCaptainId: null,
    bank: 0,
  });
  const captainOnBench = preseasonSquadDraftStateSchema.safeParse({
    playerIds: [11, 12],
    starterIds: [11],
    captainId: 12,
    viceCaptainId: null,
    bank: 0,
  });

  assert.equal(duplicate.success, false);
  assert.equal(captainOnBench.success, false);
});

test("a preseason draft retains a negative calculated bank while it is repaired", () => {
  const result = preseasonSquadDraftStateSchema.safeParse({
    playerIds: [11],
    starterIds: [],
    captainId: null,
    viceCaptainId: null,
    bank: -5,
  });

  assert.equal(result.success, true);
});
