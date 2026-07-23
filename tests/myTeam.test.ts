import { strict as assert } from "node:assert";
import test from "node:test";
import {
  captaincy,
  eliteSquadSummary,
  groupStartersByPosition,
  splitSquad,
  type SquadPick,
} from "../components/my-team/model";

function makePick(
  id: number,
  position: number,
  playerPosition: SquadPick["player"]["position"],
): SquadPick {
  return {
    id,
    position,
    isCaptain: position === 1,
    isViceCaptain: position === 2,
    multiplier: position === 1 ? 2 : 1,
    purchasePrice: 50,
    sellingPrice: 50,
    player: {
      id,
      fplId: id,
      webName: `Player ${id}`,
      position: playerPosition,
      nowCost: 50,
      status: "a",
      news: null,
      chanceOfPlaying: null,
      team: { shortName: "TST", name: "Test" },
      fplStats: [{ totalPoints: id }],
    },
  };
}

const picks: SquadPick[] = [
  makePick(1, 1, "GOALKEEPER"),
  ...Array.from({ length: 4 }, (_, index) =>
    makePick(index + 2, index + 2, "DEFENDER"),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    makePick(index + 6, index + 6, "MIDFIELDER"),
  ),
  ...Array.from({ length: 2 }, (_, index) =>
    makePick(index + 10, index + 10, "FORWARD"),
  ),
  makePick(12, 12, "GOALKEEPER"),
  makePick(13, 13, "DEFENDER"),
  makePick(14, 14, "MIDFIELDER"),
  makePick(15, 15, "FORWARD"),
];

test("My Team keeps eleven starters and four bench players", () => {
  const split = splitSquad(picks);
  assert.equal(split.starters.length, 11);
  assert.equal(split.bench.length, 4);
  assert.equal(
    groupStartersByPosition(picks).flatMap((group) => group.picks).length,
    11,
  );
});

test("My Team exposes captain and vice-captain without relying on colour", () => {
  const armband = captaincy(picks);
  assert.equal(armband.captain?.player.webName, "Player 1");
  assert.equal(armband.viceCaptain?.player.webName, "Player 2");
});

test("elite context reports owned differentials and template gaps", () => {
  const summary = eliteSquadSummary(picks, { "1": 70, "99": 80, "2": 5 });
  assert.equal(summary.missingTemplate, 1);
  assert.equal(summary.differentials, 14);
});
