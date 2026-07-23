import { strict as assert } from "node:assert";
import test from "node:test";
import { extractConfirmedPlayerTotals } from "../lib/services/pulseLivePlayerSupplementService";

test("individual totals turn an absent metric into a confirmed zero only with minutes", () => {
  const result = extractConfirmedPlayerTotals({
    entity: {
      id: 42,
      name: { display: "Player" },
      altIds: { opta: "p42" },
    },
    stats: [
      { name: "mins_played", value: 900 },
      { name: "touches", value: 500 },
      { name: "carries", value: 100 },
    ],
  });
  assert.equal(result?.values.total_att_assist, 0);
  assert.deepEqual(result?.absentAsZero, ["total_att_assist"]);
});

test("individual totals keep absent evidence unresolved without minutes", () => {
  const result = extractConfirmedPlayerTotals({
    entity: {
      id: 42,
      name: { display: "Player" },
      altIds: { opta: "p42" },
    },
    stats: [{ name: "touches", value: 0 }],
  });
  assert.equal(result, null);
});
