import { z } from "zod";

export const PRESEASON_MINUTES_TRACKER_SOURCE = "google_sheets";
export const PRESEASON_MINUTES_TRACKER_DATASET = "preseason-minutes-tracker";
export const PRESEASON_MINUTES_TRACKER_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxLUOCYma3wQTzz7r8rliQgktSmMzgeeWS2eG3KYnEdFPQwbArhGaN3I2vz2Nr8lD_omwqrCjPsAmb/pubhtml?widget=true&headers=false";

const trackerPlayerSchema = z.object({
  playerName: z.string().min(1),
  position: z.string().min(1),
  matchMinutes: z.array(z.number().int().min(0).max(90)),
  totalMinutes: z.number().int().min(0),
  possibleMinutes: z.number().int().nonnegative(),
  participationRate: z.number().min(0).max(1),
});

const trackerTeamSchema = z.object({
  teamCode: z.string().regex(/^[A-Z]{3}$/),
  gid: z.string().regex(/^-?\d+$/),
  players: z.array(trackerPlayerSchema).min(1),
});

export const preseasonMinutesTrackerCollectionSchema = z.object({
  schemaVersion: z.literal(1),
  sourceUrl: z.string().url(),
  teams: z.array(trackerTeamSchema).length(20),
});

export type PreseasonMinutesTrackerCollection = z.infer<
  typeof preseasonMinutesTrackerCollectionSchema
>;
export type PreseasonMinutesTrackerPlayer = z.infer<typeof trackerPlayerSchema>;

export class PreseasonMinutesTrackerCollectorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PreseasonMinutesTrackerCollectorError";
  }
}

export interface PreseasonMinutesTrackerCollectorDependencies {
  fetch?: typeof fetch;
}

function parseInteger(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new PreseasonMinutesTrackerCollectorError(
      `Invalid ${label} value '${value}'`,
    );
  }
  return Number(normalized);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted)
    throw new PreseasonMinutesTrackerCollectorError("Unterminated CSV field");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export function parseTrackerNavigation(html: string): Array<{
  teamCode: string;
  gid: string;
}> {
  const tabs = [
    ...html.matchAll(
      /items\.push\(\{name:\s*"([A-Z]{3})"[\s\S]*?gid:\s*"(-?\d+)"/g,
    ),
  ].map(([, teamCode, gid]) => ({ teamCode, gid }));
  const unique = new Map(tabs.map((tab) => [tab.teamCode, tab]));
  if (unique.size !== 20 || tabs.length !== unique.size) {
    throw new PreseasonMinutesTrackerCollectorError(
      `Expected 20 unique tracker tabs, received ${unique.size}`,
    );
  }
  return [...unique.values()];
}

export function parseTrackerTeamCsv(input: {
  teamCode: string;
  gid: string;
  csv: string;
}): PreseasonMinutesTrackerCollection["teams"][number] {
  const rows = parseCsv(input.csv);
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => value.trim().toLowerCase() === "name"),
  );
  if (headerIndex < 0) {
    throw new PreseasonMinutesTrackerCollectorError(
      `Tracker tab ${input.teamCode} has no player header`,
    );
  }
  const header = rows[headerIndex].map((value) => value.trim());
  const nameIndex = header.findIndex((value) => value.toLowerCase() === "name");
  const positionIndex = header.findIndex(
    (value) => value.toLowerCase() === "position",
  );
  const totalIndex = header.findIndex(
    (value) => value.toUpperCase() === "TOTAL",
  );
  if (nameIndex < 0 || positionIndex < 0 || totalIndex <= positionIndex) {
    throw new PreseasonMinutesTrackerCollectorError(
      `Tracker tab ${input.teamCode} has an unsupported header`,
    );
  }
  const minuteIndexes = header
    .map((value, index) => ({ value, index }))
    .filter(
      ({ value, index }) =>
        index > positionIndex && index < totalIndex && value.length > 0,
    )
    .map(({ index }) => index);
  const possibleMinutes = minuteIndexes.length * 90;
  const players = rows
    .slice(headerIndex + 1)
    .map((row) => {
      const playerName = (row[nameIndex] ?? "").trim();
      const position = (row[positionIndex] ?? "").trim();
      if (!playerName || !position) return null;
      const matchMinutes = minuteIndexes.map((index) => {
        const value = (row[index] ?? "").trim();
        return value ? parseInteger(value, `${playerName} minutes`) : 0;
      });
      if (matchMinutes.some((minutes) => minutes > 90)) {
        throw new PreseasonMinutesTrackerCollectorError(
          `Tracker tab ${input.teamCode} has a minute value above 90 for ${playerName}`,
        );
      }
      const totalMinutes = parseInteger(
        row[totalIndex] ?? "",
        `${playerName} total minutes`,
      );
      const calculatedTotal = matchMinutes.reduce(
        (sum, minutes) => sum + minutes,
        0,
      );
      if (totalMinutes !== calculatedTotal || totalMinutes > possibleMinutes) {
        throw new PreseasonMinutesTrackerCollectorError(
          `Tracker tab ${input.teamCode} has inconsistent total minutes for ${playerName}`,
        );
      }
      return {
        playerName,
        position,
        matchMinutes,
        totalMinutes,
        possibleMinutes,
        participationRate:
          possibleMinutes === 0
            ? 0
            : Number((totalMinutes / possibleMinutes).toFixed(4)),
      };
    })
    .filter(
      (player): player is PreseasonMinutesTrackerPlayer => player != null,
    );
  if (players.length === 0) {
    throw new PreseasonMinutesTrackerCollectorError(
      `Tracker tab ${input.teamCode} contains no player rows`,
    );
  }
  return trackerTeamSchema.parse({
    teamCode: input.teamCode,
    gid: input.gid,
    players,
  });
}

function csvUrl(gid: string): string {
  const url = new URL(
    PRESEASON_MINUTES_TRACKER_URL.replace("/pubhtml", "/pub"),
  );
  url.search = "";
  url.searchParams.set("gid", gid);
  url.searchParams.set("single", "true");
  url.searchParams.set("output", "csv");
  return url.toString();
}

export class PreseasonMinutesTrackerCollector {
  private readonly fetchImpl: typeof fetch;

  constructor(dependencies: PreseasonMinutesTrackerCollectorDependencies = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch;
  }

  async collect(): Promise<PreseasonMinutesTrackerCollection> {
    const response = await this.fetchImpl(PRESEASON_MINUTES_TRACKER_URL, {
      headers: { "User-Agent": "FPL Platform preseason tracker sync" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new PreseasonMinutesTrackerCollectorError(
        `Could not read tracker navigation: HTTP ${response.status}`,
      );
    }
    const tabs = parseTrackerNavigation(await response.text());
    const teams = [];
    for (const tab of tabs) {
      const csvResponse = await this.fetchImpl(csvUrl(tab.gid), {
        headers: { "User-Agent": "FPL Platform preseason tracker sync" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!csvResponse.ok) {
        throw new PreseasonMinutesTrackerCollectorError(
          `Could not read tracker tab ${tab.teamCode}: HTTP ${csvResponse.status}`,
        );
      }
      teams.push(
        parseTrackerTeamCsv({ ...tab, csv: await csvResponse.text() }),
      );
    }
    return preseasonMinutesTrackerCollectionSchema.parse({
      schemaVersion: 1,
      sourceUrl: PRESEASON_MINUTES_TRACKER_URL,
      teams,
    });
  }
}
