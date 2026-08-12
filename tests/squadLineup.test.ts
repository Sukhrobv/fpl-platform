import test from "node:test";
import assert from "node:assert/strict";
import {
  getOptimalSquadLineup,
  normalizeFplSquadIds,
} from "@/lib/services/squadLineup";

test("normalizes a corrupted squad back to 15 unique FPL slots", () => {
  const roster = [
    ...Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      position: "GOALKEEPER" as const,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      id: index + 4,
      position: "DEFENDER" as const,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      id: index + 10,
      position: "MIDFIELDER" as const,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: index + 16,
      position: "FORWARD" as const,
    })),
  ];

  const ids = normalizeFplSquadIds(
    [...roster.map((player) => player.id), 1, 2],
    roster,
  );

  assert.equal(ids.length, 15);
  assert.equal(new Set(ids).size, 15);
  assert.equal(ids.filter((id) => id <= 3).length, 2);
  assert.equal(ids.filter((id) => id >= 4 && id <= 9).length, 5);
  assert.equal(ids.filter((id) => id >= 10 && id <= 15).length, 5);
  assert.equal(ids.filter((id) => id >= 16).length, 3);
});

test("selects the highest-xPts legal FPL formation without reliability weighting", () => {
  const players = [
    { id: 1, position: "GOALKEEPER", projectedPoints: 3 },
    { id: 2, position: "GOALKEEPER", projectedPoints: 9 },
    { id: 3, position: "DEFENDER", projectedPoints: 1 },
    { id: 4, position: "DEFENDER", projectedPoints: 2 },
    { id: 5, position: "DEFENDER", projectedPoints: 3 },
    { id: 6, position: "DEFENDER", projectedPoints: 4 },
    { id: 7, position: "DEFENDER", projectedPoints: 5 },
    { id: 8, position: "MIDFIELDER", projectedPoints: 1 },
    { id: 9, position: "MIDFIELDER", projectedPoints: 2 },
    { id: 10, position: "MIDFIELDER", projectedPoints: 3 },
    { id: 11, position: "MIDFIELDER", projectedPoints: 4 },
    { id: 12, position: "MIDFIELDER", projectedPoints: 5 },
    { id: 13, position: "FORWARD", projectedPoints: 6 },
    { id: 14, position: "FORWARD", projectedPoints: 7 },
    { id: 15, position: "FORWARD", projectedPoints: 8 },
  ] as const;

  const lineup = getOptimalSquadLineup(players);

  assert.equal(lineup.starterIds.length, 11);
  assert.deepEqual(
    new Set(lineup.starterIds),
    new Set([2, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15]),
  );
  assert.equal(lineup.captainId, 2);
  assert.equal(lineup.viceCaptainId, 15);
  assert.deepEqual(new Set(lineup.benchIds), new Set([1, 3, 8, 9]));
});
