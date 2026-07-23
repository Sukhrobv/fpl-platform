import { strict as assert } from "node:assert";
import test from "node:test";
import { buildGw1ReadinessChecks } from "../lib/services/gw1ReadinessService";

const completeCoverage = {
  teams: 20,
  players: 555,
  bootstrapPlayers: 555,
  fixtures: 380,
  fixtureSnapshotRows: 380,
  gameweeks: 38,
  gw1Fixtures: 10,
  gw1Teams: 20,
  profilesWithoutGw1Fixture: 0,
  priors: 841,
  sourceRegistrations: 841,
  resolvedProfiles: 555,
  unavailableProfiles: 0,
};

test("GW1 readiness requires roster, fixture, prior and availability coverage", () => {
  const result = buildGw1ReadinessChecks(completeCoverage);
  assert.equal(result.ready, true);
  assert.deepEqual(Object.values(result.checks).every(Boolean), true);
});

test("GW1 readiness fails closed when a required coverage domain is incomplete", () => {
  const result = buildGw1ReadinessChecks({
    ...completeCoverage,
    fixtureSnapshotRows: 379,
    gw1Teams: 19,
    profilesWithoutGw1Fixture: 1,
    unavailableProfiles: 1,
  });
  assert.equal(result.ready, false);
  assert.equal(result.checks.completeFixtures, false);
  assert.equal(result.checks.completeGw1Fixtures, false);
  assert.equal(result.checks.completePlayerFixtures, false);
  assert.equal(result.checks.explicitAvailability, false);
});
