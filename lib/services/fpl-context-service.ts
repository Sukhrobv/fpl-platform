import { getEntryPicks } from "../fplClient";
import { env } from "../env";

// Simple in-memory cache for MVP
// In production, use Redis or database
let eliteOwnershipCache: { [gameweek: number]: { [playerId: number]: number } } = {};
let lastCacheUpdate: { [gameweek: number]: number } = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export class FPLContextService {
  /**
   * Fetches the top 100 managers and calculates ownership % for all players.
   */
  async getEliteOwnership(gameweek: number): Promise<{ [playerId: number]: number }> {
    const now = Date.now();
    
    // Return cached if valid
    if (eliteOwnershipCache[gameweek] && (now - (lastCacheUpdate[gameweek] || 0) < CACHE_DURATION)) {
      return eliteOwnershipCache[gameweek];
    }

    console.log(`Fetching Elite EO for GW ${gameweek}...`);

    try {
      // 1. Fetch Top 100 Managers from Overall League (ID 314)
      // Page 1 (1-50)
      const page1 = await this.fetchLeagueStandings(314, 1);
      // Page 2 (51-100)
      const page2 = await this.fetchLeagueStandings(314, 2);

      const top100Entries = [...page1.standings.results, ...page2.standings.results];
      
      // 2. Fetch Picks for each manager
      // We need to be careful with rate limits here. 100 requests is a lot.
      // We'll do them in batches.
      const ownershipCounts: { [playerId: number]: number } = {};
      const totalManagers = top100Entries.length;

      // Batch size of 5 to be safe
      const batchSize = 5;
      for (let i = 0; i < totalManagers; i += batchSize) {
        const batch = top100Entries.slice(i, i + batchSize);
        await Promise.all(batch.map(async (entry: any) => {
          try {
            const picksData = await getEntryPicks(entry.entry, gameweek);
            picksData.picks.forEach((pick: any) => {
              ownershipCounts[pick.element] = (ownershipCounts[pick.element] || 0) + 1;
            });
          } catch (e) {
            console.error(`Failed to fetch picks for entry ${entry.entry}`, e);
          }
        }));
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // 3. Convert to percentages
      const ownershipPercentages: { [playerId: number]: number } = {};
      for (const [playerId, count] of Object.entries(ownershipCounts)) {
        ownershipPercentages[parseInt(playerId)] = (count / totalManagers) * 100;
      }

      // Update Cache
      eliteOwnershipCache[gameweek] = ownershipPercentages;
      lastCacheUpdate[gameweek] = now;

      return ownershipPercentages;

    } catch (error) {
      console.error("Error calculating Elite EO:", error);
      return {};
    }
  }

  private async fetchLeagueStandings(leagueId: number, page: number) {
    const url = `${env.FPL_API_BASE_URL.replace(/\/$/, "")}/leagues-classic/${leagueId}/standings/?page_new_entries=1&page_standings=${page}&phase=1`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch standings: ${res.status}`);
    }
    return await res.json();
  }
}
