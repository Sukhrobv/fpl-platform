import { strict as assert } from "node:assert";
import test from "node:test";
import {
  PulseLiveCollector,
  PulseLiveCollectorError,
} from "../lib/collectors/pulseLiveCollector";

const headers = { "Content-Type": "application/json" };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });

const player = (id: number) => ({
  id,
  playerId: id + 1000,
  name: { display: `Player ${id}`, first: "Player", last: String(id) },
  altIds: { opta: `p${id}` },
  info: { position: "M" },
});

test("PulseLiveCollector collects every player page", async () => {
  const fetchStub: typeof fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(input.toString());
    const page = Number(url.searchParams.get("page"));
    return json({
      pageInfo: { page, numPages: 2, pageSize: 2, numEntries: 3 },
      content: page === 0 ? [player(1), player(2)] : [player(3)],
    });
  };
  const collector = new PulseLiveCollector(
    { pageSize: 2, minRequestIntervalMs: 0, maxRetries: 0 },
    { fetch: fetchStub },
  );

  const result = await collector.getAllPlayers(777);
  assert.equal(result.content.length, 3);
  assert.equal(result.content[2].altIds?.opta, "p3");
});

test("PulseLiveCollector rejects an empty page with expected coverage", async () => {
  const fetchStub: typeof fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(input.toString());
    const page = Number(url.searchParams.get("page"));
    return json({
      pageInfo: { page, numPages: 2, pageSize: 2, numEntries: 3 },
      content: page === 0 ? [player(1), player(2)] : [],
    });
  };
  const collector = new PulseLiveCollector(
    { pageSize: 2, minRequestIntervalMs: 0, maxRetries: 0 },
    { fetch: fetchStub },
  );

  await assert.rejects(
    collector.getAllPlayers(777),
    (error: unknown) =>
      error instanceof PulseLiveCollectorError &&
      /empty page/i.test(error.message),
  );
});

test("PulseLiveCollector retries a transient response", async () => {
  let calls = 0;
  const fetchStub: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("temporary", { status: 503 });
    return json({
      pageInfo: { page: 0, numPages: 1, pageSize: 100, numEntries: 1 },
      content: [{ id: 777, label: "English Premier League Season 2025/2026" }],
    });
  };
  const collector = new PulseLiveCollector(
    { minRequestIntervalMs: 0, maxRetries: 1, retryBaseDelayMs: 1 },
    { fetch: fetchStub, delay: async () => undefined },
  );

  const result = await collector.getCompetitionSeasons();
  assert.equal(calls, 2);
  assert.equal(result.content[0].id, 777);
});

test("PulseLiveCollector validates ranked metric identity", async () => {
  const fetchStub: typeof fetch = async () =>
    json({
      entity: "carries",
      stats: {
        pageInfo: { page: 0, numPages: 1, pageSize: 50, numEntries: 1 },
        content: [{ owner: player(1), rank: 1, name: "carries", value: 10 }],
      },
    });
  const collector = new PulseLiveCollector(
    { minRequestIntervalMs: 0, maxRetries: 0 },
    { fetch: fetchStub },
  );

  await assert.rejects(
    collector.getAllRankedStats(777, "touches"),
    (error: unknown) =>
      error instanceof PulseLiveCollectorError && /entity/i.test(error.message),
  );
});

test("PulseLiveCollector parses individual player totals", async () => {
  const fetchStub: typeof fetch = async () =>
    json({
      entity: player(7),
      stats: [
        { name: "mins_played", value: 900 },
        { name: "total_att_assist", value: 12 },
      ],
    });
  const collector = new PulseLiveCollector(
    { minRequestIntervalMs: 0, maxRetries: 0 },
    { fetch: fetchStub },
  );
  const result = await collector.getPlayerStats(777, 7);
  assert.equal(result.entity.altIds?.opta, "p7");
  assert.equal(result.stats[1].value, 12);
});
