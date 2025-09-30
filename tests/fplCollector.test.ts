process.env.SKIP_ENV_VALIDATION = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/testdb";
import { strict as assert } from "node:assert";
import test from "node:test";

const collectorModulePromise = import("../lib/collectors/fplCollector");

const headers = { "Content-Type": "application/json" };

const bootstrapPayload = {
  events: [{ id: 1, name: "Gameweek 1", is_current: true }],
  teams: [{ id: 1, name: "Arsenal", short_name: "ARS" }],
  elements: [
    {
      id: 1,
      web_name: "Player One",
      team: 1,
      element_type: 2,
      now_cost: 50,
      status: "a",
    },
  ],
  element_types: [{ id: 2, singular_name: "Defender", plural_name: "Defenders" }],
  element_stats: [{ name: "goals_scored", label: "Goals" }],
};

const playerSummaryPayload = {
  fixtures: [
    {
      id: 1,
      code: 1001,
      event: 1,
      kickoff_time: "2025-08-12T12:00:00Z",
      team_h: 1,
      team_a: 2,
      is_home: true,
      difficulty: 2,
      finished: false,
      minutes: 0,
    },
  ],
  history: [
    {
      element: 1,
      fixture: 1,
      opponent_team: 2,
      total_points: 5,
      was_home: true,
      kickoff_time: "2025-08-12T12:00:00Z",
      team_h_score: 2,
      team_a_score: 0,
      round: 1,
      minutes: 90,
      goals_scored: 0,
      assists: 0,
      clean_sheets: 1,
      goals_conceded: 0,
      own_goals: 0,
      penalties_saved: 0,
      penalties_missed: 0,
      yellow_cards: 0,
      red_cards: 0,
      saves: 0,
      bonus: 1,
      bps: 20,
      influence: "10.0",
      creativity: "5.0",
      threat: "2.0",
      ict_index: "17.0",
      starts: 1,
      expected_goals: "0.05",
      expected_assists: "0.01",
      expected_goal_involvements: "0.06",
      expected_goals_conceded: "0.80",
      value: 50,
      transfers_balance: 0,
      selected: 1000,
      transfers_in: 0,
      transfers_out: 0,
    },
  ],
  history_past: [
    {
      season_name: "2023/24",
      element_code: 12345,
      start_cost: 45,
      end_cost: 46,
      total_points: 120,
      minutes: 3000,
      goals_scored: 5,
      assists: 3,
      clean_sheets: 12,
      goals_conceded: 25,
      own_goals: 0,
      penalties_saved: 0,
      penalties_missed: 0,
      yellow_cards: 1,
      red_cards: 0,
      saves: 0,
      bonus: 8,
      bps: 500,
      influence: "120.0",
      creativity: "75.0",
      threat: "30.0",
      ict_index: "225.0",
      starts: 32,
      expected_goals: "4.2",
      expected_assists: "3.5",
      expected_goal_involvements: "7.7",
      expected_goals_conceded: "28.0",
    },
  ],
};

const noopLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

const toJsonResponse = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), { ...init, headers });

test("FPLCollector retries transient failures and succeeds", async () => {
  const { FPLCollector } = await collectorModulePromise;
  const responses: Response[] = [
    new Response("fail", { status: 503, statusText: "Service Unavailable" }),
    new Response("fail", { status: 500, statusText: "Server Error" }),
    toJsonResponse(bootstrapPayload, { status: 200 }),
  ];
  let callCount = 0;
  const warnings: unknown[] = [];
  const fetchStub: typeof fetch = async () => {
    callCount += 1;
    const next = responses.shift();
    if (!next) {
      throw new Error("No more responses");
    }
    return next;
  };
  const collector = new FPLCollector(
    { baseUrl: "https://fantasy.premierleague.com/api", requestsPerMinute: 0, maxRetries: 4, retryBaseDelayMs: 5, retryJitterMs: 0 },
    {
      fetch: fetchStub,
      logger: {
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: (...args) => {
          warnings.push(args);
        },
      },
    },
  );

  const data = await collector.getBootstrap();
  assert.equal(callCount, 3, "collector should retry until success");
  assert.equal(data.teams[0].id, 1);
  assert.ok(warnings.length >= 2, "logger.warn should be called for retries");
});

test("FPLCollector throws when payload fails validation", async () => {
  const { FPLCollector, FPLCollectorError } = await collectorModulePromise;
  const fetchStub: typeof fetch = async () => toJsonResponse({ invalid: true }, { status: 200 });
  const collector = new FPLCollector(
    { baseUrl: "https://fantasy.premierleague.com/api", requestsPerMinute: 0, maxRetries: 0 },
    { fetch: fetchStub, logger: noopLogger },
  );
  await assert.rejects(
    collector.getBootstrap(),
    (error: unknown) => {
      assert.ok(error instanceof FPLCollectorError);
      assert.match(error.message, /validate/i);
      return true;
    },
  );
});

test("FPLCollector fetches summaries for multiple players", async () => {
  const { FPLCollector } = await collectorModulePromise;
  const fetchStub: typeof fetch = async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(input.toString());
    if (url.pathname.endsWith("/element-summary/1/")) {
      return toJsonResponse(playerSummaryPayload, { status: 200 });
    }
    if (url.pathname.endsWith("/element-summary/2/")) {
      return toJsonResponse(playerSummaryPayload, { status: 200 });
    }
    throw new Error(`Unexpected URL ${url.pathname}`);
  };
  const collector = new FPLCollector(
    { baseUrl: "https://fantasy.premierleague.com/api", requestsPerMinute: 0, maxRetries: 0 },
    { fetch: fetchStub, logger: noopLogger },
  );
  const summaries = await collector.getPlayerSummaries([1, 2]);
  assert.equal(Object.keys(summaries).length, 2);
  assert.equal(summaries[1].history.length, 1);
  assert.equal(summaries[2].fixtures[0].id, 1);
});

