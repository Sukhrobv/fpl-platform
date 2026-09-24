import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildRollingPredictionAuditReport,
} from "../lib/services/rollingPredictionAuditService";
import type { RollingPlayerProjection } from "../lib/services/rollingPredictionService";

test("rolling audit sums double gameweek fixtures without recalibrating", () => {
  const projections = [
    {
      seasonPlayerId: 1,
      fplId: 10,
      playerName: "Starter",
      position: "MIDFIELDER",
      confidence: "HIGH",
      fixtures: [
        { gameweek: 2, xPts: 2.4, expectedMinutes: 78 },
        { gameweek: 2, xPts: 1.1, expectedMinutes: 35 },
        { gameweek: 3, xPts: 4, expectedMinutes: 80 },
      ],
    },
    {
      seasonPlayerId: 2,
      fplId: 11,
      playerName: "Blank",
      position: "DEFENDER",
      confidence: "LOW",
      fixtures: [{ gameweek: 3, xPts: 2, expectedMinutes: 70 }],
    },
  ] as unknown as RollingPlayerProjection[];
  const report = buildRollingPredictionAuditReport(
    projections,
    2,
    new Map([
      [1, 5],
      [2, 0],
    ]),
  );

  assert.equal(report.players, 2);
  assert.equal(report.rows[0]?.predictedXPts, 3.5);
  assert.equal(report.rows[0]?.expectedMinutes, 113);
  assert.equal(report.rows[0]?.error, 1.5);
  assert.equal(report.byExpectedMinutes.SIXTY_PLUS.players, 1);
  assert.equal(report.byExpectedMinutes.ZERO.players, 1);
  assert.equal(report.byConfidence.HIGH.mae, 1.5);
});
