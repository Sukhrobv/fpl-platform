# External Data Sources Analysis

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

- **Sofascore**: Harder to parse, anti-bot protection. Deprioritized for now.
- **Opta**: Paid only. Not feasible.
