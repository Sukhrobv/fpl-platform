import { z } from "zod";

const BASE_URL = "https://footballapi.pulselive.com/football";
const DEFAULT_PAGE_SIZE = 20;

const pageInfoSchema = z.object({
  page: z.number(),
  numPages: z.number(),
  pageSize: z.number(),
  numEntries: z.number(),
});

const seasonSchema = z
  .object({
    id: z.number(),
    label: z.string(),
  })
  .passthrough();

const playerSchema = z
  .object({
    id: z.number(),
    playerId: z.number().optional(),
    name: z
      .object({
        display: z.string(),
        first: z.string().optional(),
        last: z.string().optional(),
      })
      .passthrough(),
    altIds: z.object({ opta: z.string().optional() }).passthrough().optional(),
    info: z
      .object({ position: z.string().optional() })
      .passthrough()
      .optional(),
    currentTeam: z
      .object({
        id: z.number(),
        name: z.string(),
        altIds: z
          .object({ opta: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const rankedStatSchema = z
  .object({
    owner: playerSchema,
    rank: z.number(),
    name: z.string(),
    value: z.number(),
  })
  .passthrough();

const seasonsResponseSchema = z.object({
  pageInfo: pageInfoSchema,
  content: z.array(seasonSchema),
});

const playersResponseSchema = z.object({
  pageInfo: pageInfoSchema,
  content: z.array(playerSchema),
});

const rankedStatsResponseSchema = z.object({
  entity: z.string(),
  stats: z.object({
    pageInfo: pageInfoSchema,
    content: z.array(rankedStatSchema),
  }),
});

const playerStatSchema = z
  .object({
    name: z.string(),
    value: z.number(),
  })
  .passthrough();

const playerStatsResponseSchema = z.object({
  entity: playerSchema,
  stats: z.array(playerStatSchema),
});

export const PULSELIVE_METRICS = [
  "touches",
  "touches_in_opp_box",
  "total_att_assist",
  "carries",
  "progressive_carries",
  "mins_played",
] as const;

export type PulseLiveMetric = (typeof PULSELIVE_METRICS)[number];
export type PulseLiveSeason = z.infer<typeof seasonSchema>;
export type PulseLivePlayer = z.infer<typeof playerSchema>;
export type PulseLiveRankedStat = z.infer<typeof rankedStatSchema>;
export type PulseLivePlayerStats = z.infer<typeof playerStatsResponseSchema>;

export interface PulseLivePage<T> {
  pageInfo: z.infer<typeof pageInfoSchema>;
  content: T[];
}

export interface PulseLiveCollectorOptions {
  baseUrl?: string;
  pageSize?: number;
  minRequestIntervalMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  requestTimeoutMs?: number;
}

export interface PulseLiveCollectorDependencies {
  fetch?: typeof fetch;
  delay?: (ms: number) => Promise<void>;
}

export class PulseLiveCollectorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PulseLiveCollectorError";
  }
}

export class PulseLiveCollector {
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly minRequestIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly delayImpl: (ms: number) => Promise<void>;
  private lastRequestAt = 0;

  constructor(
    options: PulseLiveCollectorOptions = {},
    dependencies: PulseLiveCollectorDependencies = {},
  ) {
    this.baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/$/, "");
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 1_500;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.delayImpl =
      dependencies.delay ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async getCompetitionSeasons(): Promise<PulseLivePage<PulseLiveSeason>> {
    return this.requestPaged(
      "/competitions/1/compseasons",
      { page: "0", pageSize: "100" },
      seasonsResponseSchema,
    );
  }

  async getAllPlayers(
    seasonId: number,
  ): Promise<PulseLivePage<PulseLivePlayer>> {
    return this.collectAllPages(async (page) =>
      this.requestPaged(
        "/players",
        {
          comp: "1",
          compSeasons: String(seasonId),
          compCodeForSort: "PL",
          altIds: "true",
          page: String(page),
          pageSize: String(this.pageSize),
        },
        playersResponseSchema,
      ),
    );
  }

  async getAllRankedStats(
    seasonId: number,
    metric: PulseLiveMetric,
  ): Promise<PulseLivePage<PulseLiveRankedStat>> {
    return this.collectAllPages(async (page) => {
      const response = await this.request(
        `/stats/ranked/players/${metric}`,
        {
          comps: "1",
          comp: "1",
          compSeasons: String(seasonId),
          compsCodeForSort: "PL",
          compCodeForSort: "PL",
          altIds: "true",
          page: String(page),
          pageSize: String(this.pageSize),
        },
        rankedStatsResponseSchema,
      );
      if (response.entity !== metric) {
        throw new PulseLiveCollectorError(
          `PulseLive returned entity '${response.entity}' for requested metric '${metric}'`,
        );
      }
      return response.stats;
    });
  }

  async getPlayerStats(
    seasonId: number,
    playerId: number,
  ): Promise<PulseLivePlayerStats> {
    return this.request(
      `/stats/player/${playerId}`,
      {
        comps: "1",
        compSeasons: String(seasonId),
        compsCodeForSort: "PL",
        altIds: "true",
      },
      playerStatsResponseSchema,
    );
  }

  private async collectAllPages<T>(
    fetchPage: (page: number) => Promise<PulseLivePage<T>>,
  ): Promise<PulseLivePage<T>> {
    const first = await fetchPage(0);
    this.validatePage(first, 0);
    const content = [...first.content];
    for (let page = 1; page < first.pageInfo.numPages; page += 1) {
      const next = await fetchPage(page);
      this.validatePage(next, page);
      content.push(...next.content);
    }
    if (content.length !== first.pageInfo.numEntries) {
      throw new PulseLiveCollectorError(
        `PulseLive coverage mismatch: expected ${first.pageInfo.numEntries}, received ${content.length}`,
      );
    }
    return { pageInfo: first.pageInfo, content };
  }

  private validatePage<T>(page: PulseLivePage<T>, expectedPage: number): void {
    if (page.pageInfo.page !== expectedPage) {
      throw new PulseLiveCollectorError(
        `PulseLive page mismatch: expected ${expectedPage}, received ${page.pageInfo.page}`,
      );
    }
    if (page.pageInfo.numEntries > 0 && page.content.length === 0) {
      throw new PulseLiveCollectorError(
        `PulseLive returned an empty page ${expectedPage} with ${page.pageInfo.numEntries} expected entries`,
      );
    }
  }

  private async requestPaged<T extends z.ZodTypeAny>(
    path: string,
    query: Record<string, string>,
    schema: T,
  ): Promise<z.infer<T>> {
    return this.request(path, query, schema);
  }

  private async request<T extends z.ZodTypeAny>(
    path: string,
    query: Record<string, string>,
    schema: T,
  ): Promise<z.infer<T>> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.throttle();
        const url = new URL(`${this.baseUrl}${path}`);
        for (const [key, value] of Object.entries(query))
          url.searchParams.set(key, value);
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          headers: {
            Origin: "https://www.premierleague.com",
            Referer: "https://www.premierleague.com/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const payload = await response.json();
        return schema.parse(payload);
      } catch (error) {
        lastError = error;
        if (attempt >= this.maxRetries) break;
        await this.delayImpl(this.retryBaseDelayMs * 2 ** attempt);
      }
    }
    const page = query.page != null ? ` page ${query.page}` : "";
    throw new PulseLiveCollectorError(
      `PulseLive request failed for ${path}${page}`,
      lastError,
    );
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minRequestIntervalMs - Date.now();
    if (wait > 0) await this.delayImpl(wait);
    this.lastRequestAt = Date.now();
  }
}
