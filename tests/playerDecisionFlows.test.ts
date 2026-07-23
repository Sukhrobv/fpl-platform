import { strict as assert } from "node:assert";
import test from "node:test";
import {
  evaluateTransfer,
  updateComparisonSelection,
  type ExplorerPlayer,
} from "../components/player-explorer/model";

function player(
  id: number,
  position: ExplorerPlayer["position"] = "MIDFIELDER",
  forecastTotal: number | null = 20,
): ExplorerPlayer {
  return {
    id,
    fplId: id,
    webName: `Player ${id}`,
    firstName: "Player",
    secondName: String(id),
    position,
    nowCost: 50 + id,
    selectedBy: 1,
    totalPoints: 100,
    pointsPerGame: 4,
    form: 3,
    status: "a",
    news: null,
    chanceOfPlaying: null,
    team: { shortName: "TST", name: "Test" },
    forecastTotal,
    forecasts: {},
  };
}

test("comparison selection toggles players and stops at three", () => {
  const one = updateComparisonSelection([], player(1));
  const three = updateComparisonSelection(
    updateComparisonSelection(one, player(2)),
    player(3),
  );
  const stillThree = updateComparisonSelection(three, player(4));
  const removed = updateComparisonSelection(stillThree, player(2));

  assert.deepEqual(
    three.map((item) => item.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    stillThree.map((item) => item.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    removed.map((item) => item.id),
    [1, 3],
  );
});

test("transfer evaluation enforces position and reports forecast delta", () => {
  const upgrade = evaluateTransfer(
    player(1, "MIDFIELDER", 18),
    player(2, "MIDFIELDER", 23),
  );
  const invalid = evaluateTransfer(
    player(1, "MIDFIELDER", 18),
    player(3, "FORWARD", 25),
  );

  assert.equal(upgrade.compatible, true);
  assert.equal(upgrade.forecastDelta, 5);
  assert.equal(upgrade.verdict, "upgrade");
  assert.equal(invalid.compatible, false);
  assert.equal(invalid.verdict, "invalid");
});

test("transfer evaluation waits rather than inventing missing forecasts", () => {
  const evaluation = evaluateTransfer(
    player(1, "DEFENDER", null),
    player(2, "DEFENDER", null),
  );
  assert.equal(evaluation.evidenceAvailable, false);
  assert.equal(evaluation.forecastDelta, null);
  assert.equal(evaluation.verdict, "awaiting-data");
});
