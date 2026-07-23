import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildExactOptaMappingReport,
  type FplIdentity,
  type PulseLiveIdentity,
} from "../lib/services/pulseLiveMappingService";

const fpl = (code: number, played = true): FplIdentity => ({
  playerId: code,
  fplId: code + 1000,
  code,
  name: `FPL ${code}`,
  played,
});
const source = (
  sourcePlayerId: number,
  optaId?: string,
): PulseLiveIdentity => ({
  sourcePlayerId,
  optaId,
  name: `PL ${sourcePlayerId}`,
});

test("buildExactOptaMappingReport maps p-prefixed Opta IDs to FPL code", () => {
  const report = buildExactOptaMappingReport([source(1, "p123")], [fpl(123)]);
  assert.equal(report.exactMatches.length, 1);
  assert.equal(report.exactMatches[0].fplId, 1123);
  assert.equal(report.sourceCoverage, 1);
});

test("buildExactOptaMappingReport deduplicates the same PulseLive owner across metrics", () => {
  const report = buildExactOptaMappingReport(
    [source(1, "p123"), source(1, "p123")],
    [fpl(123)],
  );
  assert.equal(report.sourcePlayers, 1);
  assert.equal(report.exactMatches.length, 1);
  assert.deepEqual(report.conflicts, []);
});

test("buildExactOptaMappingReport reports duplicate ownership of an Opta ID", () => {
  const report = buildExactOptaMappingReport(
    [source(1, "p123"), source(2, "p123")],
    [fpl(123)],
  );
  assert.equal(report.exactMatches.length, 0);
  assert.equal(report.conflicts.length, 1);
  assert.match(report.conflicts[0], /multiple PulseLive players/i);
});

test("buildExactOptaMappingReport separates played coverage from full roster coverage", () => {
  const report = buildExactOptaMappingReport(
    [source(1, "123")],
    [fpl(123), fpl(456, false)],
  );
  assert.equal(report.fplPlayedMappingCoverage, 1);
  assert.equal(report.sourceCoverage, 1);
  assert.equal(report.rosterCoverage, 0.5);
  assert.equal(report.eligibleForRollout, true);
  assert.equal(report.unmatchedFpl[0].code, 456);
});
