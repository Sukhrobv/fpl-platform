import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildPlayerUpsertData,
  buildMatchUpsertData,
  determineTargetEvents,
  extractFixtureStats,
} from "../lib/services/fplSync";
import type { FPLBootstrapData, FPLLiveElementExplain } from "@/types";

test("determineTargetEvents respects explicit overrides", () => {
  const bootstrap = createBootstrap({ currentEventId: 5 });
  const events = determineTargetEvents(bootstrap, [7, 2, 2, 1]);
  assert.deepEqual(events, [1, 2, 7]);
});

test("determineTargetEvents defaults to current event", () => {
  const bootstrap = createBootstrap({ currentEventId: 4 });
  const events = determineTargetEvents(bootstrap);
  assert.deepEqual(events, [1, 2, 3, 4]);
});

test("buildPlayerUpsertData maps FPL element to Prisma inputs", () => {
  const element = createBootstrap({}).elements[0];
  const upsert = buildPlayerUpsertData(element);
  assert.equal(upsert.fplId, element.id);
  assert.equal(upsert.create.webName, element.web_name);
  assert.equal(upsert.create.firstName, element.first_name);
  assert.equal(upsert.create.team.connect?.fplId, element.team);
  assert.equal(upsert.update.team.connect?.fplId, element.team);
  assert.equal(upsert.create.position, "DEFENDER");
});

test("buildMatchUpsertData throws when team mapping missing", () => {
  const fixture = {
    id: 10,
    code: 100,
    event: 1,
    finished: false,
    finished_provisional: false,
    kickoff_time: null,
    minutes: 0,
    provisional_start_time: false,
    started: false,
    team_a: 3,
    team_a_score: null,
    team_h: 4,
    team_h_score: null,
    stats: [],
    team_h_difficulty: 2,
    team_a_difficulty: 3,
    pulse_id: 999,
  };
  assert.throws(() => buildMatchUpsertData(fixture, new Map()), /Missing team mapping/);
});

test("extractFixtureStats aggregates points and values", () => {
  const explain: FPLLiveElementExplain = {
    fixture: 1,
    stats: [
      { identifier: "minutes", value: 90, points: 2, points_modification: 0 },
      { identifier: "goals_scored", value: 1, points: 4, points_modification: 0 },
      { identifier: "bonus", value: 3, points: 3, points_modification: 0 },
    ],
  };
  const snapshot = extractFixtureStats(explain, {
    minutes: 90,
    goals_scored: 1,
    assists: 0,
    clean_sheets: 0,
    goals_conceded: 0,
    own_goals: 0,
    penalties_saved: 0,
    penalties_missed: 0,
    yellow_cards: 0,
    red_cards: 0,
    saves: 0,
    bonus: 3,
    bps: 25,
    influence: "25.0",
    creativity: "10.0",
    threat: "15.0",
    ict_index: "50.0",
    starts: 1,
    expected_goals: "0.3",
    expected_assists: "0.1",
    expected_goal_involvements: "0.4",
    expected_goals_conceded: "1.0",
    total_points: 9,
  });
  assert.equal(snapshot.minutes, 90);
  assert.equal(snapshot.goals, 1);
  assert.equal(snapshot.bonus, 3);
  assert.equal(snapshot.totalPoints, 9);
});

function createBootstrap({ currentEventId = 1 }: { currentEventId?: number }): FPLBootstrapData {
  return {
    events: [
      { id: 1, name: "GW1", is_previous: true, is_current: currentEventId === 1, is_next: false } as any,
      { id: 2, name: "GW2", is_previous: true, is_current: currentEventId === 2, is_next: false } as any,
      { id: 3, name: "GW3", is_previous: true, is_current: currentEventId === 3, is_next: false } as any,
      { id: 4, name: "GW4", is_previous: currentEventId > 4, is_current: currentEventId === 4, is_next: false } as any,
      { id: 5, name: "GW5", is_previous: false, is_current: currentEventId === 5, is_next: currentEventId < 5 } as any,
    ],
    teams: [
      {
        id: 1,
        name: "Arsenal",
        short_name: "ARS",
      } as any,
    ],
    elements: [
      {
        id: 101,
        code: 1234,
        web_name: "Defender",
        first_name: "Test",
        second_name: "Player",
        team: 1,
        element_type: 2,
        now_cost: 50,
        selected_by_percent: "12.5",
        total_points: 100,
        points_per_game: "5.0",
        form: "3.2",
        status: "a",
        news: "",
        news_added: null,
        chance_of_playing_next_round: 100,
      } as any,
    ],
    element_types: [
      { id: 2, singular_name: "Defender", plural_name: "Defenders" } as any,
    ],
    element_stats: [],
    chips: [],
    game_settings: {} as any,
    game_config: {} as any,
    phases: [],
    total_players: 0,
  } as unknown as FPLBootstrapData;
}


