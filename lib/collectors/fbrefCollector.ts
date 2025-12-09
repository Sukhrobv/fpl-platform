import axios from "axios";

/**
 * FBRef collector
 * NOTE: parsing is heuristic; if FBRef markup changes, adjust selectors/regexes. Placeholders remain for competition mapping.
 */

export interface FbrefFixture {
  home: string;
  away: string;
  kickoff: string | null;
  competition: string | null;
  isEurope: boolean;
  season: string;
}

export interface FbrefTableEntry {
  team: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  competition: string;
  season: string;
}

export class FbrefCollector {
  private baseUrl = "https://fbref.com";

  constructor(private leagueCode: string = "9") {} // 9 = Premier League on FBRef

  /**
   * Fetch fixtures page HTML for a season.
   * @param season eg "2024-2025"
   */
  async fetchFixturesPage(season: string): Promise<string> {
    const url = `${this.baseUrl}/en/comps/${this.leagueCode}/schedule/${season}-Premier-League-Scores-and-Fixtures`;
    const res = await axios.get(url);
    return res.data as string;
  }

  /**
   * Fetch league table page HTML for a season.
   * @param season eg "2024-2025"
   */
  async fetchTablePage(season: string): Promise<string> {
    const url = `${this.baseUrl}/en/comps/${this.leagueCode}/${season}-Premier-League-Stats`;
    const res = await axios.get(url);
    return res.data as string;
  }

  /**
   * Parse fixtures using data-stat attributes from FBRef schedule table.
   * NOTE: heuristic parsing; adjust if FBRef markup changes.
   */
  parseFixtures(html: string, season: string): FbrefFixture[] {
    if (!html) return [];
    const rows = html.match(/<tr[^>]*?>[\\s\\S]*?<\\/tr>/g) || [];
    const fixtures: FbrefFixture[] = [];

    for (const row of rows) {
      const home = this.extractDataStat(row, "home_team");
      const away = this.extractDataStat(row, "away_team");
      const date = this.extractDataStat(row, "date");
      const comp = this.extractDataStat(row, "comp");

      if (!home || !away) continue;
      const isEurope = this.isEuropeanCompetition(comp);

      fixtures.push({
        home,
        away,
        kickoff: date || null,
        competition: comp || null,
        isEurope,
        season,
      });
    }

    return fixtures;
  }

  /**
   * Parse league table entries from FBRef stats page.
   */
  parseLeagueTable(html: string, season: string): FbrefTableEntry[] {
    if (!html) return [];
    const rows = html.match(/<tr[^>]*?>[\\s\\S]*?<\\/tr>/g) || [];
    const table: FbrefTableEntry[] = [];

    for (const row of rows) {
      const team = this.extractDataStat(row, "team");
      if (!team) continue;
      const played = this.toNumber(this.extractDataStat(row, "games")) || this.toNumber(this.extractDataStat(row, "mp"));
      const points = this.toNumber(this.extractDataStat(row, "points")) || this.toNumber(this.extractDataStat(row, "pts"));
      const gf = this.toNumber(this.extractDataStat(row, "goals_for")) || this.toNumber(this.extractDataStat(row, "gf"));
      const ga = this.toNumber(this.extractDataStat(row, "goals_against")) || this.toNumber(this.extractDataStat(row, "ga"));

      table.push({
        team,
        played,
        points,
        goalsFor: gf,
        goalsAgainst: ga,
        competition: "league",
        season,
      });
    }

    return table;
  }

  /**
   * Fetch fixtures for a season.
   */
  async getFixtures(season: string): Promise<FbrefFixture[]> {
    const html = await this.fetchFixturesPage(season);
    return this.parseFixtures(html, season);
  }

  /**
   * Fetch league table for a season.
   */
  async getLeagueTable(season: string): Promise<FbrefTableEntry[]> {
    const html = await this.fetchTablePage(season);
    return this.parseLeagueTable(html, season);
  }

  private extractDataStat(row: string, stat: string): string | null {
    const regex = new RegExp(`<[^>]*data-stat="${stat}"[^>]*>([\\s\\S]*?)<\\/t[dh]>`, "i");
    const match = row.match(regex);
    if (!match) return null;
    return this.stripTags(match[1]).trim() || null;
  }

  private stripTags(text: string): string {
    return text.replace(/<[^>]*?>/g, "").replace(/&nbsp;/g, " ").trim();
  }

  private toNumber(val: string | null): number {
    if (!val) return 0;
    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
  }

  private isEuropeanCompetition(comp: string | null): boolean {
    if (!comp) return false;
    const name = comp.toLowerCase();
    return (
      name.includes("champions league") ||
      name.includes("europa league") ||
      name.includes("conference league")
    );
  }
}
