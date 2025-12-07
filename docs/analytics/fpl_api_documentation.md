# FPL API Documentation (Stage 2.1)

## Overview
- Base URL: `https://fantasy.premierleague.com/api`
- Transport: HTTPS, JSON payloads, gzip compression enabled by default.
- Authentication: public GET endpoints are unauthenticated; manager specific endpoints require an authenticated session cookie (`pl_profile`) obtained via the FPL web login. No API keys exist.
- Versioning: there is no version header. Backwards incompatible changes occur at the start of new FPL seasons. Monitor payload shape during pre-season updates.

## Rate Limiting and Access Notes
- The public API enforces soft throttling. Community testing shows 50 to 60 requests per minute from a single IP starts returning HTTP 429. Keep burst rate under 10 rps and average below 30 rpm.
- Some endpoints (for example `/event/{event_id}/live/`) become temporarily unavailable during gameweek updates and return HTTP 503. Implement retries with exponential backoff.
- Responses do not include `ETag` or `Last-Modified`. Consumers must implement their own caching fingerprints (for example hashing the payload) to avoid redundant writes.
- All numeric metrics inside `bootstrap-static` and `element-summary` are delivered as strings. Convert to numbers explicitly before storing them.

## Endpoint Catalogue
| Category | Endpoint | Method | Auth | Key Entities | Notes |
| --- | --- | --- | --- | --- | --- |
| Reference | `/bootstrap-static/` | GET | None | Teams, players, events, element types, global config | Primary snapshot used to seed the local database. Updated multiple times per day during live gameweeks.
| Reference | `/event-status/` | GET | None | Current event processing status | Indicates when bonus and standings are processed. Useful before running nightly jobs.
| Fixtures | `/fixtures/` | GET | None | Fixture list with per fixture stats | Supports `?event={gw}` and `?future=1`. Includes BPS stats once a match finishes.
| Live stats | `/event/{event_id}/live/` | GET | None | Real time player stats for a single gameweek | Contains per player aggregates plus explain breakdown per fixture.
| Player detail | `/element-summary/{element_id}/` | GET | None | Upcoming fixtures and historical stats for one player | Expensive fan-out call. Cache aggressively.
| Highlights | `/dream-team/{event_id}/` | GET | None | Team of the week info | Used for content and leaderboards only.
| Manager profile | `/entry/{entry_id}/` | GET | None | Manager metadata, leagues joined | Exposure limited to public information.
| Manager history | `/entry/{entry_id}/history/` | GET | None | Gameweek history, chip usage, past seasons | Combine with picks to reconstruct season progress.
| Manager picks | `/entry/{entry_id}/event/{event_id}/picks/` | GET | None | Squad picks, automatic subs, event summary | Does not expose opponents; element ids map to `/bootstrap-static` players.
| Manager transfers | `/entry/{entry_id}/transfers/` | GET | None | Transfer log for an entry | Returns empty array until the manager makes transfers.
| League standings | `/leagues-classic/{league_id}/standings/` | GET | None | Classic league table, pagination info | Supports `?page_standings=` and `?page_new_entries=`.
| League standings | `/leagues-h2h/{league_id}/standings/` | GET | None | Head to head league table | Combine with matches endpoint for fixtures (requires auth if private).
| Auth only | `/my-team/{entry_id}/` | GET | Session cookie | Current squad, bank, chip state | Requires logged in cookies; needed for the owner of the entry.
| Auth only | `/transfers/` | POST | Session cookie | Submit transfer actions | Not required for analytics, but useful to understand write surface.

## Endpoint Deep Dive
### `/bootstrap-static/`
- Sections: `events`, `teams`, `elements`, `element_types`, `element_stats`, `game_settings`, `game_config`, `chips`, `phases`, `total_players`.
- Provides season to date cumulative stats. Fields such as `points_per_game`, `selected_by_percent`, `form`, `expected_goals` arrive as strings and must be cast.
- Update frequency: at least once per hour when matches are active; otherwise a few times per day. Polling every 30 minutes is sufficient outside live fixtures.

### `/fixtures/`
- Returns one row per fixture with nested `stats` arrays containing identifiers (`goals_scored`, `bonus`, `bps`, etc.).
- Includes kickoff time, finished flag, BPS metrics, and team difficulty ratings. When `?event={gw}` is supplied the list filters to that gameweek.
- Recommend syncing full list daily, then refetch the active gameweek every 15 minutes while matches are in progress.

### `/event/{event_id}/live/`
- Contains two keys: `elements` (per player stats) and `explain` (breakdown by fixture IDs and scoring events).
- Values such as `expected_goals` and `ict_index` remain strings. `total_points` is numeric.
- The endpoint is the cheapest way to refresh live scores without calling `element-summary` for every player.

### `/element-summary/{element_id}/`
- Returns `fixtures` (upcoming matches with difficulty), `history` (current season events with detailed stats), and `history_past` (previous seasons summary).
- Use sparingly: hitting all 700 players back to back will breach the throttle. Suggested strategy is to refresh only impacted players (e.g. ones flagged as injured or transferred) and schedule a nightly sweep with small delay between calls.

### Manager and League endpoints
- `/entry/{entry_id}/` exposes public metadata (region, favourite club, leagues). There is no PII beyond what managers share publicly.
- `/entry/{entry_id}/event/{event_id}/picks/` contains `entry_history` (points, rank) and `picks` (15 players with captaincy flags). Combine with `bootstrap-static.elements` to derive names.
- `/entry/{entry_id}/history/` provides `chips`, `current` (per gameweek summary), and `past` (historical season results). Ideal for trend analysis.
- `/entry/{entry_id}/transfers/` lists transfer actions with purchase and sale prices. Not paginated; returns the full history for the entry.
- `/leagues-classic/{league_id}/standings/` and `/leagues-h2h/{league_id}/standings/` require pagination parameters for leagues with >50 entries. Standings payloads include `last_updated_data` timestamp that can be used to avoid redundant pulls.
- `/my-team/{entry_id}/` is only available with the manager's authenticated session cookie. It returns the same structure as the in-game Team page (current squad, selling values, bank). Treat as opt-in because it exposes private data.

### Other useful endpoints
- `/dream-team/{event_id}/` publishes the official gameweek dream team and top scoring player. Handy for content modules.
- `/fixtures/?future=1` filters the fixture list to unfinished matches only, reducing payload size for real time dashboards.
- `/event-status/` should be polled after the final fixture each day; once `points` switches from `r` (review) to `s` (settled) bonus points are locked.

## Data Overlap and Differences
- `bootstrap-static.elements` and `event/{event_id}/live/` both expose the same stat families. Use `bootstrap-static` for season aggregates and `event/live` for live deltas to avoid recomputing totals.
- `fixtures.stats` provides per fixture contributions, while `event/live` aggregates by player. Joining them allows building player-by-player per fixture dashboards.
- `element-summary.history` duplicates gameweek stats already available in `event/live` but adds opponent short name, venue (`was_home`), and fixture difficulty. Store only the enriched fields to minimise duplication.
- Manager endpoints (`picks`, `history`, `transfers`) repeat some identifiers from `bootstrap-static` (player ids, fixture ids). Always rely on numeric ids as primary keys and enrich via local tables to keep payload size down.

## Data Loading Priorities
1. **Foundation (critical, daily baseline):** `/bootstrap-static/`, `/event-status/`. Required before any downstream sync. Schedule hourly during active gameweeks.
2. **Match context (high, during gameweeks):** `/fixtures/` (active gw only), `/event/{event_id}/live/`, `/dream-team/{event_id}/`. Poll every 5 to 15 minutes while fixtures play, otherwise once per day.
3. **Player deep dives (medium, batched):** `/element-summary/{element_id}/` for impacted players (injuries, high transfers). Run nightly batches with throttling and cache results.
4. **Manager insights (conditional):** `/entry/{entry_id}/`, `/history/`, `/picks/`, `/transfers/`. Fetch only for opted-in users or featured public managers. Respect rate limits by staggering manager calls.
5. **Authenticated endpoints (optional future work):** `/my-team/{entry_id}/`, transfer POST actions. Require secure credential storage and CSRF handling; defer until user auth flow is prioritised.

## Known Gaps and Follow Up Actions
- Verify whether `leagues-h2h-matches` endpoints remain restricted; if needed, capture authenticated responses during stage 2.2 testing.
- Validate rate limiting empirically once the async collector is implemented (stage 2.2) and tune concurrency backoff values.
- Monitor pre-season payload changes (new fields, renamed stats) and update TypeScript types in `types/index.ts` accordingly.
- Consider persisting raw JSON snapshots for `/bootstrap-static/` and `/event/{event_id}/live/` to simplify future auditing.
