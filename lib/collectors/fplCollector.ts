import { z, ZodError } from "zod";
import type {
  FPLBootstrapData,
  FPLEventLiveResponse,
  FPLFixture,
  FPLPlayerSummary,
} from "../../types";
import { env } from "../env";
import { logger as defaultLogger } from "../logger";

const ONE_MINUTE = 60_000;

const bootstrapSchema = z
  .object({
    events: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
          is_current: z.boolean().optional(),
          is_next: z.boolean().optional(),
          is_previous: z.boolean().optional(),
        })
        .passthrough(),
    ),
    teams: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
          short_name: z.string(),
        })
        .passthrough(),
    ),
    elements: z.array(
      z
        .object({
          id: z.number(),
          web_name: z.string(),
          team: z.number(),
          element_type: z.number(),
          now_cost: z.number(),
          status: z.string(),
        })
        .passthrough(),
    ),
    element_types: z.array(
      z
        .object({
          id: z.number(),
          singular_name: z.string(),
          plural_name: z.string(),
        })
        .passthrough(),
    ),
    element_stats: z.array(
      z
        .object({
          name: z.string(),
          label: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const fixtureStatEntrySchema = z
  .object({
    element: z.number(),
    value: z.number(),
  })
  .passthrough();

const fixtureSchema = z
  .object({
    id: z.number(),
    code: z.number(),
    event: z.number().nullable(),
    finished: z.boolean(),
    finished_provisional: z.boolean(),
    kickoff_time: z.string().nullable(),
    minutes: z.number(),
    provisional_start_time: z.boolean(),
    started: z.boolean(),
    team_a: z.number(),
    team_a_score: z.number().nullable(),
    team_h: z.number(),
    team_h_score: z.number().nullable(),
    stats: z.array(
      z
        .object({
          identifier: z.string(),
          a: z.array(fixtureStatEntrySchema),
          h: z.array(fixtureStatEntrySchema),
        })
        .passthrough(),
    ),
    team_h_difficulty: z.number(),
    team_a_difficulty: z.number(),
    pulse_id: z.number(),
  })
  .passthrough();

const fixturesSchema = z.array(fixtureSchema);

const playerSummarySchema = z
  .object({
    fixtures: z.array(
      z
        .object({
          id: z.number(),
          code: z.number(),
          event: z.number().nullable(),
          kickoff_time: z.string().nullable(),
          team_h: z.number(),
          team_a: z.number(),
          is_home: z.boolean(),
          difficulty: z.number(),
          finished: z.boolean(),
          minutes: z.number(),
        })
        .passthrough(),
    ),
    history: z.array(
      z
        .object({
          element: z.number(),
          fixture: z.number(),
          opponent_team: z.number(),
          total_points: z.number(),
          was_home: z.boolean(),
          kickoff_time: z.string(),
          team_h_score: z.number(),
          team_a_score: z.number(),
          round: z.number(),
          minutes: z.number(),
          goals_scored: z.number(),
          assists: z.number(),
          clean_sheets: z.number(),
          goals_conceded: z.number(),
          own_goals: z.number(),
          penalties_saved: z.number(),
          penalties_missed: z.number(),
          yellow_cards: z.number(),
          red_cards: z.number(),
          saves: z.number(),
          bonus: z.number(),
          bps: z.number(),
          influence: z.string(),
          creativity: z.string(),
          threat: z.string(),
          ict_index: z.string(),
          starts: z.number(),
          expected_goals: z.string(),
          expected_assists: z.string(),
          expected_goal_involvements: z.string(),
          expected_goals_conceded: z.string(),
          value: z.number(),
          transfers_balance: z.number(),
          selected: z.number(),
          transfers_in: z.number(),
          transfers_out: z.number(),
        })
        .passthrough(),
    ),
    history_past: z.array(
      z
        .object({
          season_name: z.string(),
          element_code: z.number(),
          start_cost: z.number(),
          end_cost: z.number(),
          total_points: z.number(),
          minutes: z.number(),
          goals_scored: z.number(),
          assists: z.number(),
          clean_sheets: z.number(),
          goals_conceded: z.number(),
          own_goals: z.number(),
          penalties_saved: z.number(),
          penalties_missed: z.number(),
          yellow_cards: z.number(),
          red_cards: z.number(),
          saves: z.number(),
          bonus: z.number(),
          bps: z.number(),
          influence: z.string(),
          creativity: z.string(),
          threat: z.string(),
          ict_index: z.string(),
          starts: z.number(),
          expected_goals: z.string(),
          expected_assists: z.string(),
          expected_goal_involvements: z.string(),
          expected_goals_conceded: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const eventLiveSchema = z
  .object({
    elements: z.array(
      z
        .object({
          id: z.number(),
          stats: z
            .object({
              minutes: z.number(),
              goals_scored: z.number(),
              assists: z.number(),
              clean_sheets: z.number(),
              goals_conceded: z.number(),
              own_goals: z.number(),
              penalties_saved: z.number(),
              penalties_missed: z.number(),
              yellow_cards: z.number(),
              red_cards: z.number(),
              saves: z.number(),
              bonus: z.number(),
              bps: z.number(),
              influence: z.string(),
              creativity: z.string(),
              threat: z.string(),
              ict_index: z.string(),
              starts: z.number(),
              expected_goals: z.string(),
              expected_assists: z.string(),
              expected_goal_involvements: z.string(),
              expected_goals_conceded: z.string(),
              total_points: z.number(),
            })
            .passthrough(),
          explain: z.array(
            z
              .object({
                fixture: z.number(),
                stats: z.array(
                  z
                    .object({
                      identifier: z.string(),
                      points: z.number(),
                      value: z.number(),
                      points_modification: z.number(),
                    })
                    .passthrough(),
                ),
              })
              .passthrough(),
          ),
          modified: z.boolean(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type LogAdapter = Pick<typeof defaultLogger, "debug" | "info" | "warn" | "error">;

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  jitterMs: number;
}

async function withRetry<T>(task: () => Promise<T>, config: RetryConfig, log: LogAdapter): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= config.maxRetries) {
        throw error;
      }
      const backoff = config.baseDelayMs * 2 ** attempt;
      const jitter = config.jitterMs > 0 ? Math.floor(Math.random() * config.jitterMs) : 0;
      const waitMs = backoff + jitter;
      log.warn(
        `FPL request failed (attempt ${attempt + 1}/${config.maxRetries}). Retrying in ${waitMs}ms`,
        error,
      );
      await delay(waitMs);
      attempt += 1;
    }
  }
}

class RateLimiterQueue {
  private readonly queue: Array<() => void> = [];

  private running = 0;

  private timestamps: number[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly requestsPerInterval: number,
    private readonly intervalMs: number,
  ) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrapped = () => {
        this.runTask(task, resolve, reject);
      };
      this.queue.push(wrapped);
      this.dequeue();
    });
  }

  private dequeue(): void {
    if (this.running >= this.concurrency) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }
    this.running += 1;
    job();
  }

  private async runTask<T>(task: () => Promise<T>, resolve: (value: T) => void, reject: (reason: unknown) => void): Promise<void> {
    try {
      await this.waitForRateSlot();
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running -= 1;
      this.dequeue();
    }
  }

  private async waitForRateSlot(): Promise<void> {
    if (this.requestsPerInterval <= 0) {
      return;
    }
    while (true) {
      const now = Date.now();
      const windowStart = now - this.intervalMs;
      this.timestamps = this.timestamps.filter((timestamp) => timestamp > windowStart);
      if (this.timestamps.length < this.requestsPerInterval) {
        this.timestamps.push(now);
        return;
      }
      const earliest = this.timestamps[0];
      const wait = this.intervalMs - (now - earliest);
      await delay(wait > 0 ? wait : 0);
    }
  }
}

export interface FPLCollectorOptions {
  baseUrl?: string;
  requestsPerMinute?: number;
  concurrency?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryJitterMs?: number;
}

export interface FPLCollectorDependencies {
  fetch?: typeof fetch;
  logger?: LogAdapter;
}

export class FPLCollectorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "FPLCollectorError";
  }
}

export class FPLCollector {
  private readonly baseUrl: string;

  private readonly fetchImpl: typeof fetch;

  private readonly retryConfig: RetryConfig;

  private readonly log: LogAdapter;

  private readonly queue: RateLimiterQueue;

  constructor(options: FPLCollectorOptions = {}, deps: FPLCollectorDependencies = {}) {
    this.baseUrl = (options.baseUrl ?? env.FPL_API_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = deps.fetch ?? fetch;
    this.log = deps.logger ?? defaultLogger;
    const requestedRpm = options.requestsPerMinute ?? 45;
    const requestsPerMinute = requestedRpm <= 0 ? 0 : requestedRpm;
    const concurrency = Math.max(1, options.concurrency ?? 4);
    this.queue = new RateLimiterQueue(concurrency, requestsPerMinute, ONE_MINUTE);
    this.retryConfig = {
      maxRetries: options.maxRetries ?? 3,
      baseDelayMs: options.retryBaseDelayMs ?? 500,
      jitterMs: options.retryJitterMs ?? 200,
    };
  }

  async getBootstrap(): Promise<FPLBootstrapData> {
    return this.request<FPLBootstrapData>("/bootstrap-static/", bootstrapSchema);
  }

  async getFixtures(eventId?: number): Promise<FPLFixture[]> {
    const query = eventId != null ? `?event=${eventId}` : "";
    return this.request<FPLFixture[]>(`/fixtures/${query}`, fixturesSchema);
  }

  async getEventLive(eventId: number): Promise<FPLEventLiveResponse> {
    return this.request<FPLEventLiveResponse>(`/event/${eventId}/live/`, eventLiveSchema);
  }

  async getPlayerSummary(elementId: number): Promise<FPLPlayerSummary> {
    return this.request<FPLPlayerSummary>(`/element-summary/${elementId}/`, playerSummarySchema);
  }

  async getPlayerSummaries(elementIds: number[]): Promise<Record<number, FPLPlayerSummary>> {
    const results = await Promise.all(
      elementIds.map(async (id) => {
        const summary = await this.getPlayerSummary(id);
        return [id, summary] as const;
      }),
    );
    return Object.fromEntries(results);
  }

  private async request<T>(path: string, schema: z.ZodTypeAny): Promise<T> {
    const task = async () => {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`);
      if (!response.ok) {
        throw new Error(`FPL API responded with ${response.status} ${response.statusText}`);
      }
      return (await response.json()) as unknown;
    };
    try {
      const raw = await this.queue.schedule(() => withRetry(task, this.retryConfig, this.log));
      return schema.parse(raw) as T;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new FPLCollectorError(`Failed to validate payload from ${path}`, error);
      }
      throw new FPLCollectorError(`Failed to fetch ${path}`, error);
    }
  }
}

