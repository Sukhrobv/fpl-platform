import { strict as assert } from "node:assert";
import test from "node:test";
import {
  parseCsv,
  parseTrackerNavigation,
  parseTrackerTeamCsv,
} from "../lib/collectors/preseasonMinutesTrackerCollector";
import { derivePreseasonMinutesCap } from "../lib/services/preseasonMinutesTrackerService";

test("tracker navigation rejects an incomplete tab set", () => {
  assert.throws(() =>
    parseTrackerNavigation('items.push({name: "TOT", gid: "1"})'),
  );
});

test("tracker CSV preserves quoted fields and validates minute totals", () => {
  const csv = [
    "SPURS",
    "Name,Price,Position,v One,v Two,TOTAL,%,Goals",
    '"Player, One",50,MID,45,90,135,75.0%,1',
    "Player Two,45,DEF,,,0,0.0%,0",
  ].join("\n");
  assert.deepEqual(parseCsv('"A,B",C'), [["A,B", "C"]]);
  const team = parseTrackerTeamCsv({ teamCode: "TOT", gid: "1", csv });
  assert.equal(team.players[0].totalMinutes, 135);
  assert.deepEqual(team.players[1].matchMinutes, [0, 0]);
  assert.equal(derivePreseasonMinutesCap(team.players[0]), 90);
});

test("zero pre-season minutes do not assert zero league minutes", () => {
  const team = parseTrackerTeamCsv({
    teamCode: "MCI",
    gid: "3",
    csv: [
      "MANCHESTER CITY",
      "Name,Price,Position,v One,v Two,TOTAL,%,Goals",
      "Example Player,100,FWD,0,0,0,0.0%,0",
    ].join("\n"),
  });
  assert.equal(derivePreseasonMinutesCap(team.players[0]), null);
});

test("a team without a friendly stays evidence-only until it has minutes", () => {
  const team = parseTrackerTeamCsv({
    teamCode: "BRE",
    gid: "2",
    csv: [
      "BRENTFORD",
      "Name,Price,Position,TOTAL,%,Goals",
      "Example Player,50,MID,0,0.0%,0",
    ].join("\n"),
  });
  assert.deepEqual(team.players[0].matchMinutes, []);
  assert.equal(team.players[0].possibleMinutes, 0);
  assert.equal(derivePreseasonMinutesCap(team.players[0]), null);
});
