import axios from 'axios';

export interface UnderstatPlayer {
  id: string;
  player_name: string;
  games: string;
  time: string;
  goals: string;
  xG: string;
  assists: string;
  xA: string;
  shots: string;
  key_passes: string;
  yellow_cards: string;
  red_cards: string;
  position: string;
  team_title: string;
  npg: string;
  npxG: string;
  xGChain: string;
  xGBuildup: string;
}

export interface UnderstatTeam {
  id: string;
  title: string;
  history: {
    h_a: string;
    xG: number;
    xGA: number;
    npxG: number;
    npxGA: number;
    ppda: { att: number; def: number };
    ppda_allowed: { att: number; def: number };
    deep: number;
    deep_allowed: number;
    scored: number;
    missed: number;
    xpts: number;
    result: string;
    date: string;
    wins: number;
    draws: number;
    loses: number;
    pts: number;
    npxGD: number;
  }[];
}

export class UnderstatCollector {
  private baseUrl = 'https://understat.com';
  /**
   * Fetches player data for a specific league and season.
   * @param league League name (e.g., 'EPL')
   * @param year Season start year (e.g., 2024 for 24/25)
   */
  async getLeaguePlayers(league: string = 'EPL', year: number = 2024): Promise<UnderstatPlayer[]> {
    // For current season (2024/25), Understat uses the base URL without year
    const url = year === 2024 
      ? `${this.baseUrl}/league/${league}`
      : `${this.baseUrl}/league/${league}/${year}`;
      
    console.log(`[UnderstatCollector] Fetching ${url}...`);

    try {
      const response = await axios.get(url);
      const html = response.data;
      return this.extractVariable<UnderstatPlayer[]>(html, 'playersData');
    } catch (error) {
      console.error('[UnderstatCollector] Error fetching players:', error);
      throw error;
    }
  }

  /**
   * Fetches team data for a specific league and season.
   */
  async getLeagueTeams(league: string = 'EPL', year: number = 2024): Promise<Record<string, UnderstatTeam>> {
    const url = year === 2024
      ? `${this.baseUrl}/league/${league}`
      : `${this.baseUrl}/league/${league}/${year}`;
    try {
      const response = await axios.get(url);
      const html = response.data;
      return this.extractVariable<Record<string, UnderstatTeam>>(html, 'teamsData');
    } catch (error) {
      console.error('[UnderstatCollector] Error fetching teams:', error);
      throw error;
    }
  }

  /**
   * Extracts a JSON variable from Understat HTML.
   */
  private extractVariable<T>(html: string, variableName: string): T {
    const regex = new RegExp(`var\\s+${variableName}\\s*=\\s*JSON\\.parse\\('([^']+)'\\)`);
    const match = html.match(regex);

    if (!match) {
      throw new Error(`Could not find variable ${variableName} in HTML`);
    }

    const encodedJson = match[1];
    
    // Decode hex escapes (e.g. \x7B -> {)
    const decodedJson = encodedJson.replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    return JSON.parse(decodedJson) as T;
  }
}
