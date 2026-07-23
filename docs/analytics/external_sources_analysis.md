# External Data Sources Analysis

## 2026 Decision Summary

Decision record: FBref advanced data was retired after its provider terminated the feed in January 2026. All related runtime code, mappings and caches were removed. The project now uses this hierarchy:

1. FPL API for the canonical roster, fixtures, official match output and DEFCON.
2. Premier League PulseLive JSON for free touches, key passes and carries enrichment.
3. Understat for optional xGChain/xGBuildup enrichment.
4. Sofascore only as a disabled fallback experiment for match-level carries/maps.
5. Paid providers only if the free enrichment fails its coverage or stability gates.

## Premier League PulseLive (Primary Free Enrichment)

### Validation result (2026-07-13)

The public JSON backend used by `premierleague.com` was verified against Premier League season id `777` (2025/26). A player response contained:

- `touches`
- `touches_in_opp_box`
- `total_att_assist` (Opta shot assists / key passes)
- `carries`
- `progressive_carries`
- `mins_played`
- `owner.altIds.opta`

This provides the three required feature families for free and maps directly to FPL `opta_code` without name matching.

### Access pattern

- Competition seasons: `https://footballapi.pulselive.com/football/competitions/1/compseasons`
- Season players: `https://footballapi.pulselive.com/football/players?compSeasons={seasonId}`
- One player totals: `https://footballapi.pulselive.com/football/stats/player/{playerId}?comps=1&compSeasons={seasonId}`
- Ranked stat pages: `https://footballapi.pulselive.com/football/stats/ranked/players/{stat}`

Required request headers include the Premier League origin/referer and a normal browser user agent. This backend is public but undocumented and has no contractual SLA.

### Collection strategy

1. Fetch and retain immutable cumulative snapshots after each settled gameweek.
2. Calculate per-GW values by subtracting the previous valid cumulative snapshot.
3. Use exact Opta ids for mapping.
4. Limit page size to 50, use low concurrency, retries and jitter.
5. Reject unexpectedly empty responses rather than publishing zeros.
6. Serve predictions only from the local database/cache.

### Free fallbacks

- **Understat:** season key passes plus xGChain/xGBuildup; no touches or carries.
- **API-Football Free:** 100 requests/day and documented `passes.key`; does not document the required touches/carries fields.
- **Sofascore private JSON:** exposes match player statistics and ball-carry event maps, but has weaker identity mapping and no public API contract. Keep disabled unless PulseLive is unavailable.

### Risk assessment

- PulseLive and Sofascore are not documented public developer APIs and may change without notice.
- Raw snapshots, adapters, schema validation and source kill switches are mandatory.
- Check the source terms before any public/commercial deployment.

## 1. Understat Integration Analysis

### Overview

Understat provides advanced football statistics (xG, xA, xPoints) which are essential for the "predictive" aspect of our FPL platform. Since there is no official API, we must scrape the data from their website.

### Data Access Method

- **Method**: HTTP GET request + HTML Parsing.
- **Target URL**: `https://understat.com/league/EPL/{year}` (e.g., 2024 for the 24/25 season).
- **Data Location**: Embedded in `<script>` tags as JSON strings.
- **Variables**:
  - `playersData`: Array of player stats for the season.
  - `teamsData`: Dictionary of team stats.
  - `datesData`: Fixtures and results.

### Data Schema (Player)

Based on our test script, the player object contains:

```typescript
interface UnderstatPlayer {
  id: string; // Unique Understat ID (e.g., "1250")
  player_name: string; // Name (e.g., "Mohamed Salah")
  team_title: string; // Team Name (e.g., "Liverpool")
  games: string; // Matches played
  time: string; // Minutes played
  goals: string; // Actual goals
  xG: string; // Expected goals (Float as string)
  assists: string; // Actual assists
  xA: string; // Expected assists (Float as string)
  shots: string; // Total shots
  key_passes: string; // Key passes
  npg: string; // Non-penalty goals
  npxG: string; // Non-penalty xG
  xGChain: string; // xG Chain
  xGBuildup: string; // xG Buildup
}
```

### Integration Strategy

1.  **Collector**: Create `UnderstatCollector` class in `lib/collectors`.
2.  **Parsing**: Use the regex/JSON.parse method validated in `scripts/test-understat.ts`.
3.  **Storage**:
    - Create `UnderstatStats` table in Prisma.
    - Store `xG`, `xA`, `xGChain`, `xGBuildup` as Floats.
    - Link to `FplPlayer` via `PlayerMapping` table.

### Challenges & Mitigation

- **Player Name Mismatch**: "Son Heung-Min" (FPL) vs "Son Heung-min" (Understat).
  - _Solution_: Fuzzy matching (Levenshtein distance) + Manual override table.
- **Team Name Mismatch**: "Man Utd" (FPL) vs "Manchester United" (Understat).
  - _Solution_: Static team mapping dictionary.

## 2. Other Sources (Brief)

- **Sofascore**: Free private JSON and useful match-level maps, but less stable and harder to map than PulseLive. Fallback only.
- **Opta direct**: Paid enterprise access. Not required while FPL and PulseLive pass coverage gates.
