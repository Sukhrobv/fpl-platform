import { strict as assert } from "node:assert";
import test from "node:test";
import {
  assistantPlayers,
  isAssistantComparison,
  visibleComparisonMetrics,
} from "../components/assistant/model";
import { validFplId } from "../components/settings/model";

const player = {
  id: 1,
  webName: "Example",
  team: "TST",
  position: "MID",
  price: 7.5,
  form: 4.2,
  ownership: 12.4,
  isInjured: false,
  xPtsNext5: 99,
};

test("assistant evidence accepts factual player records", () => {
  assert.deepEqual(assistantPlayers(player), [player]);
  assert.deepEqual(assistantPlayers([player, { error: "missing" }]), [player]);
  assert.deepEqual(assistantPlayers({ error: "missing" }), []);
});

test("assistant comparison suppresses legacy xPts from the new-season evidence surface", () => {
  const comparison = {
    player1: player,
    player2: { ...player, id: 2, webName: "Example 2" },
    comparison: [
      { metric: "Цена", player1Value: "7.5m", player2Value: "7.8m", winner: 1 },
      {
        metric: "xPts (5 туров)",
        player1Value: 20,
        player2Value: 22,
        winner: 2,
      },
    ],
    recommendation: "Stored comparison",
  };

  assert.equal(isAssistantComparison(comparison), true);
  if (!isAssistantComparison(comparison)) return;
  assert.deepEqual(
    visibleComparisonMetrics(comparison).map(({ metric }) => metric),
    ["Цена"],
  );
});

test("FPL onboarding accepts only positive numeric public team IDs", () => {
  assert.equal(validFplId("123456"), true);
  assert.equal(validFplId("0"), false);
  assert.equal(validFplId("12abc"), false);
  assert.equal(validFplId(""), false);
});
