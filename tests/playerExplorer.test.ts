import { strict as assert } from "node:assert";
import test from "node:test";
import {
  confidenceForForecast,
  filterExplorerPlayers,
  mergePlayersWithPredictions,
  type PlayerApiItem,
} from "../components/player-explorer/model";

function makePlayer(index: number): PlayerApiItem {
  return {
    id: index,
    fplId: index,
    webName: `Player ${index}`,
    firstName: "Player",
    secondName: String(index),
    position: index % 2 === 0 ? "MIDFIELDER" : "DEFENDER",
    nowCost: 45 + (index % 80),
    selectedBy: index % 50,
    totalPoints: index % 220,
    pointsPerGame: index % 9,
    form: index % 10,
    status: index % 10 === 0 ? "d" : "a",
    news: null,
    chanceOfPlaying: index % 10 === 0 ? 75 : null,
    team: {
      shortName: `T${index % 20}`,
      name: `Team ${index % 20}`,
    },
  };
}

test("Player Explorer keeps a realistic 841-player roster intact", () => {
  const players = Array.from({ length: 841 }, (_, index) =>
    makePlayer(index + 1),
  );
  const merged = mergePlayersWithPredictions(players, []);

  assert.equal(merged.length, 841);
  assert.equal(merged[0].forecastTotal, null);
  assert.deepEqual(merged[0].forecasts, {});
});

test("Player Explorer combines search, position, team and availability filters", () => {
  const players = mergePlayersWithPredictions(
    Array.from({ length: 841 }, (_, index) => makePlayer(index + 1)),
    [],
  );
  const filtered = filterExplorerPlayers(players, {
    query: "Player",
    position: "MIDFIELDER",
    team: "T2",
    availability: "AVAILABLE",
  });

  assert.ok(filtered.length > 0);
  assert.ok(
    filtered.every(
      (player) =>
        player.position === "MIDFIELDER" &&
        player.team.shortName === "T2" &&
        player.status === "a",
    ),
  );
});

test("forecast confidence is exposed as a non-colour state", () => {
  assert.equal(confidenceForForecast(), "unavailable");
  assert.equal(
    confidenceForForecast({
      xPts: 5,
      fixture: "ARS (H)",
      opponent: "ARS",
      isHome: true,
      breakdown: {
        appearance: 2,
        attack: 2,
        defense: 0.5,
        bonus: 0.5,
      },
      raw: { pStart: 0.82 },
      context: { player: { xG90_recent: 0.4 } },
    }),
    "high",
  );
});
