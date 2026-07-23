import { strict as assert } from "node:assert";
import test from "node:test";
import {
  assertPulseLiveBatchBoundary,
  deriveCumulativeDelta,
  type CumulativeStatRow,
} from "../lib/services/pulseLiveDeltaService";

const row = (
  optaId: string | undefined,
  value: number,
  name = "Player",
): CumulativeStatRow => ({
  owner: { name: { display: name }, altIds: optaId ? { opta: optaId } : {} },
  value,
});

test("deriveCumulativeDelta subtracts the previous cumulative value", () => {
  const result = deriveCumulativeDelta([row("p1", 100)], [row("p1", 125)]);
  assert.deepEqual(result, [
    {
      optaId: "p1",
      playerName: "Player",
      value: 25,
      previousValue: 100,
      currentValue: 125,
    },
  ]);
});

test("deriveCumulativeDelta treats a newly ranked player as starting at zero", () => {
  const result = deriveCumulativeDelta([], [row("p2", 7, "New Player")]);
  assert.equal(result[0].value, 7);
  assert.equal(result[0].previousValue, 0);
});

test("GW1 logical-zero baseline yields the current cumulative value", () => {
  const result = deriveCumulativeDelta([], [row("p1", 31)]);
  assert.deepEqual(result[0], {
    optaId: "p1",
    playerName: "Player",
    value: 31,
    previousValue: 0,
    currentValue: 31,
  });
});

test("deriveCumulativeDelta ignores rows without an exact Opta ID", () => {
  const result = deriveCumulativeDelta([], [row(undefined, 7)]);
  assert.deepEqual(result, []);
});

test("deriveCumulativeDelta rejects a decreasing cumulative value", () => {
  assert.throws(
    () => deriveCumulativeDelta([row("p1", 100)], [row("p1", 99)]),
    /decreased.*100 -> 99/i,
  );
});

const boundary = (overrides: Record<string, unknown> = {}) => ({
  seasonId: 2,
  season: "2026/27",
  sourceSeasonId: "841",
  gameweek: 1,
  ...overrides,
});

test("batch boundary accepts one canonical season and source-season", () => {
  assert.deepEqual(
    assertPulseLiveBatchBoundary([boundary(), boundary()], "batch-1"),
    {
      seasonId: 2,
      season: "2026/27",
      sourceSeasonId: "841",
      gameweek: 1,
    },
  );
});

test("batch boundary rejects mixed canonical seasons", () => {
  assert.throws(
    () =>
      assertPulseLiveBatchBoundary(
        [boundary(), boundary({ seasonId: 1, season: "2025/26" })],
        "batch-1",
      ),
    /inconsistent season/i,
  );
});

test("batch boundary rejects mixed PulseLive source-seasons", () => {
  assert.throws(
    () =>
      assertPulseLiveBatchBoundary(
        [boundary(), boundary({ sourceSeasonId: "777" })],
        "batch-1",
      ),
    /inconsistent season/i,
  );
});

test("batch boundary requires a canonical season ID", () => {
  assert.throws(
    () =>
      assertPulseLiveBatchBoundary([boundary({ seasonId: null })], "batch-1"),
    /no canonical season binding/i,
  );
});
