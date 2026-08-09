# D0 — Reliable Data Foundation

**Status:** Authorized / In Progress  
**Priority:** P0 — blocks all further Advanced Prediction Engine work  
**Goal:** rebuild the live data foundation after the loss of the previous advanced-data feed, without rolling back the product or prediction UI.

## Architecture decision

1. **FPL API is canonical** for the selectable player pool, teams, fixtures, availability, prices, xG/xA/xGC and official defensive contributions.
2. **Premier League PulseLive JSON is the primary free enrichment source** for touches, key passes and carries.
3. **Understat is optional enrichment**, not a runtime dependency.
4. **Retired source code, mappings and caches must be removed.** Production predictions may use only active source contracts.
5. Every source is isolated behind an adapter, persisted as a raw snapshot and checked before transformed data is published.

## Source contract

| Domain            | Primary source                                    | Raw fields                                                                           | Mapping key                     | Fallback                               |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------- |
| FPL player pool   | FPL `/bootstrap-static/`                          | `id`, `code`, `opta_code`, names, team, position, status                             | FPL id per season + `opta_code` | last valid snapshot                    |
| Fixtures          | FPL `/fixtures/`                                  | fixture id, GW, teams, kickoff, status                                               | FPL fixture id                  | last valid snapshot                    |
| Match/FPL output  | FPL `/element-summary/{id}/`, `/event/{gw}/live/` | minutes, xG/xA/xGC, points                                                           | player + fixture                | retry/cache                            |
| DEFCON            | FPL history/live                                  | `clearances_blocks_interceptions`, `tackles`, `recoveries`, `defensive_contribution` | player + fixture                | explicit missing state                 |
| Touches           | PL PulseLive                                      | `touches`, `touches_in_opp_box`                                                      | `owner.altIds.opta`             | previous cumulative snapshot           |
| Key passes        | PL PulseLive                                      | `total_att_assist`                                                                   | `owner.altIds.opta`             | Understat `key_passes`                 |
| Carries           | PL PulseLive                                      | `carries`, `progressive_carries`                                                     | `owner.altIds.opta`             | Sofascore adapter, disabled by default |
| xGChain/xGBuildup | Understat                                         | `xGChain`, `xGBuildup`                                                               | source mapping                  | unavailable, no zero fabrication       |

PulseLive is a public but undocumented backend of the official Premier League site. It is free and provides exact Opta identifiers, but has no public SLA. The collector must therefore use conservative throttling, retries, raw snapshots, schema monitoring and a kill switch.

## D0.1 — Data contracts and storage

- [ ] Introduce source-specific raw snapshot metadata: source, season, fetched_at, checksum, validity and error.
- [x] Store official FPL match statistics at `player_id + fixture_id` grain, never only `player_id + gameweek`.
- [x] Add nullable truthful defensive fields: `cbi`, `tackles`, `recoveries`, `defensiveContribution`.
- [x] Do not split aggregate CBI into invented clearances/blocks/interceptions.
- [x] Represent missing defensive data separately from numeric zero.
- [ ] Add season-aware source identities and mapping audit fields.

## D0.2 — Canonical FPL roster sync

- [x] Persist the complete raw `/bootstrap-static/` response before transformation.
- [x] Reject incomplete snapshots: not 20 teams, implausible player count, missing ids/team/position, empty payload.
- [x] Upsert players; never delete from one incomplete response.
- [x] Track `first_seen_at`, `last_seen_at`, `active` and season.
- [x] Keep the last valid snapshot available during FPL maintenance.
- [x] Produce roster coverage and duplicate identity reports.

Coverage audit (2026-07-13): the canonical roster contains 841 players and all 380 fixtures, but per-fixture history is incomplete. Rows exist for GW1–7, only 63 players in GW8, GW14, and no players in GW9–13 or GW15–38. The database has 2,491 played rows for 437 players, while the exact PulseLive minutes dataset proves that at least 537 mapped players appeared. D0.2 ingestion hardening is therefore reopened before rollout.

Repair update (2026-07-13): event history writes are now batched, resumable through explicit `--events`, and fail closed when a completed GW has implausibly few player-fixture rows. GW8–38 were restored in 35 seconds. Coverage is now 380/380 fixtures, all 38 GWs, 11,492 played rows and 537 unique played players; zero PulseLive players with minutes are missing FPL history.

Roster hardening update (2026-07-13): D0.2 is complete. A validated immutable GW38 bootstrap snapshot contains 841 players; 841 are active in the canonical roster, with zero duplicate FPL IDs or codes. Player and fixture writes are batched. A repeatable roster-only sync now completes in 11 seconds instead of 4.5 minutes.

## D0.3 — Official FPL match and DEFCON pipeline

- [x] Extend TypeScript/Zod contracts for the 2025/26 defensive fields.
- [x] Backfill per-fixture FPL history with controlled concurrency and resumable progress.
- [x] Calculate DEF DC actions as `CBI + tackles`.
- [x] Calculate MID/FWD DC actions as `CBI + tackles + recoveries`.
- [x] Exclude goalkeepers from defensive-contribution points.
- [x] Retain official `defensive_contribution` for reconciliation.
- [x] Validate calculated action totals against official FPL values.

Implementation update (2026-07-13): D0.3 is globally complete after the D0.2 history repair. Official fields are populated for 11,492/11,492 played player-fixture rows (100%), covering 537 players and all 38 GWs, with zero missing rows, reconciliation mismatches or goalkeeper violations.

## D0.4 — Free PL enrichment collector

Public endpoints used by `premierleague.com`:

- Competition seasons: `footballapi.pulselive.com/football/competitions/1/compseasons`
- Players endpoint: discovery only; it has a server-side result-window cap and is not a roster source.
- Player totals: `footballapi.pulselive.com/football/stats/player/{playerId}`
- Ranked batch stats: `footballapi.pulselive.com/football/stats/ranked/players/{stat}`

Required raw stat names:

- `touches`
- `touches_in_opp_box`
- `total_att_assist` (Opta shot assists / key passes)
- `carries`
- `progressive_carries`
- `mins_played` as denominator

Implementation rules:

- [ ] Map PulseLive `owner.altIds.opta` directly to FPL `opta_code`.
- [x] Fetch season totals after a GW is settled and store immutable cumulative snapshots.
- [x] Derive per-GW values as deltas between consecutive valid cumulative snapshots.
- [x] Use a conservative page size (20 after live stability testing), serial requests and exponential backoff.
- [x] Treat an empty page with non-zero expected coverage as a failed response.
- [x] Keep a lookup for the previous valid snapshot and reject incomplete batches.
- [x] Add a fail-closed publication feature flag before mapped enrichment reaches predictions (D0.7).
- [x] Never call PulseLive from the user-facing predictions request.

The canonical roster remains FPL. Ranked-stat rows already contain the full player `owner` and exact Opta ID, so production snapshots do not depend on the capped `/players` pagination.

Implementation update (2026-07-13): D0.4 is complete. The first valid GW38 batch contains all six datasets (3,021 rows), has immutable checksums and passed coverage validation. Future runs require explicit season and GW metadata; cumulative totals are converted to per-GW deltas by exact Opta ID, and decreasing counters fail closed.

## D0.5 — Identity mapping

Mapping order:

1. existing source id;
2. exact Opta id;
3. stable FPL `code` across seasons;
4. date of birth + team + position;
5. normalized full name + team;
6. manual review.

- [x] Record method, confidence, verified_at and preserve manual overrides.
- [x] Report unmapped, duplicate and conflicting identities.
- [x] Require 99%+ exact mapping for players present in the enrichment source before rollout.

Implementation update (2026-07-13): D0.5 is complete. All 537 players in the valid PulseLive snapshot map exactly to FPL `code` (100%), with zero unmatched source players and zero identity conflicts. The audit also exposed 100 mapped players with PulseLive minutes but no FPL history rows; this is an ingestion gap, not a mapping gap.

## D0.6 — Season rollover 2025/26 → 2026/27

**Status:** Authorized / In Progress  
**Rule:** do not run a transforming 2026/27 sync until D0.6.1–D0.6.2 are complete. Raw snapshots may be captured, but current-season tables must not be overwritten.

### D0.6.1 — Season-aware storage

- [x] Add a canonical `Season` entity and mark exactly one season as current.
- [x] Keep `Player` as the stable person identity keyed by FPL `code` / Opta ID.
- [x] Add `SeasonPlayer` for season-specific FPL element ID, club, position, price, status and ownership.
- [x] Make fixture identity unique by `season + FPL fixture ID`.
- [x] Make FPL and external player statistics season-aware.
- [x] Add season-aware mapping audit records without destroying stable exact Opta mappings.
- [x] Backfill all existing rows into season `2025/26` and verify counts before enabling writes.

Completion note (2026-07-13): migration and live invariant audit passed. Season `2025/26` contains 20 teams, 841 registrations, 380 fixtures, 29,747 FPL fixture-stat rows, 5,033 external player-stat rows, 926 external team-stat rows and 1,045 mapping audit rows. Type-check is clean and all 96 tests pass. Transitional global FPL-ID uniqueness remains only until D0.6.2 converts every writer to season-scoped keys.

### D0.6.2 — Safe rollover ingestion

- [x] Detect the season from FPL event deadlines and reject a season change unless rollover mode is explicit.
- [x] Capture and validate the complete 2026/27 bootstrap before transformation.
- [x] Upsert the new roster into `SeasonPlayer`; never overwrite the 2025/26 season registration.
- [x] Map returning players by stable FPL `code` / exact Opta ID.
- [x] Report transfers, promoted/relegated clubs, new players, missing identities and conflicts.
- [x] Require 20 teams, 38 events, plausible roster size and zero identity conflicts before marking 2026/27 current.

Implementation note (2026-07-14): migration `20260713_remove_cross_season_unique_constraints` was applied successfully to Neon. The post-migration audit preserved all 2025/26 invariants: 20 teams, 841 registrations, 380 fixtures, 29,747 FPL stat rows, 5,033 external player rows, 926 external team rows and 1,045 mappings. The official FPL bootstrap still identifies itself as 2025/26 (20 teams, 38 events, 841 players), so the only remaining D0.6.2 item is the real 2026/27 capture/validation when FPL publishes it. Transforming rollover remains fail-closed until then.

Live capture note (2026-07-23): the official 2026/27 bootstrap and fixtures were ingested with explicit `--rollover --roster-only`. Two valid immutable source snapshots contain 555 player records and 380 fixtures. The seasonal audit passed with 20 active `SeasonTeam` rows, 555 active `SeasonPlayer` rows, 38 gameweeks, 453 returning players, 102 new players, 28 transfers, zero missing Opta IDs and zero identity conflicts. The code now requires a separate `--activate` flag before a validated rollover can change the current season; this run kept 2026/27 `UPCOMING` and 2025/26 current.

### D0.6.3 — Start-of-season priors

- [x] Freeze immutable 2025/26 raw snapshots, derived features and quality reports.
- [x] Version the prediction configuration and the 2025/26 calibration/backtest result.
- [x] Build `PlayerSeasonPrior` from minutes, starts, xG/xA, touches, key passes, carries and DEFCON per 90.
- [x] Shrink small samples toward position/team priors; never fabricate missing values as zero.
- [x] Increase uncertainty for transfers, position changes, promoted players, new managers and players without PL history.
- [x] Blend prior and current-season rates by effective sample size; update minutes/role faster than stable event rates.

Completion note (2026-07-14): immutable `gw1-prior-v5` contains 841 priors for target season 2026/27, with 293 high-, 135 medium- and 413 low-confidence records. All 537 players with PL minutes have xG/xA, and all 497 eligible outfield players have truthful touches, key passes, carries and DEFCON coverage. Ranked PulseLive gaps were completed through 66 individual public player-total responses; absent stats became confirmed zero only when the same response contained positive `mins_played`. The freeze stores source checksums plus a digest of every calculated prior and is idempotent (`reused=true`). Calibration/backtest is versioned honestly as `NOT_RUN`: the project does not yet possess complete historical pre-deadline feature snapshots required for a leakage-free retrospective backtest, so no synthetic result is claimed.

### D0.6.4 — New-season enrichment boundary

- [x] Resolve and store the PulseLive competition-season ID for 2026/27.
- [x] Never calculate a delta across the 2025/26 → 2026/27 boundary.
- [x] Treat the first settled 2026/27 cumulative snapshot as GW1 against an explicit logical zero baseline.
- [x] Starting with GW2, derive deltas only from the previous valid snapshot in the same season.
- [x] Keep the publication feature flag disabled until mapping, coverage and freshness gates pass.

Completion note (2026-07-14): canonical `SeasonSourceBinding` records now bind PulseLive 2025/26 → `777` and 2026/27 → `841`. The new season exists only as `UPCOMING` and is not current. Every new PulseLive snapshot carries the canonical season ID; delta derivation verifies that binding and selects predecessors by canonical season, source-season and gameweek. GW1 persists per-metric logical-zero baselines, while GW2+ fails closed without a complete earlier batch in the same season. The Neon migration is applied, `pulselive_enrichment_enabled` remains `false`, TypeScript is clean and all 110 tests pass. No synthetic 2026/27 match snapshot was collected before the season starts.

### D0.6.5 — GW1 readiness gate

- [x] New roster, teams, prices, positions, statuses and fixtures come only from validated 2026/27 FPL data.
- [x] The non-published GW1 input package combines versioned 2025/26 priors with each player’s 2026/27 fixture and availability; current form is not invented.
- [x] Returning, transferred, promoted and no-history players have explicit confidence/uncertainty states.
- [x] Roster, identity, fixture and prior coverage reports pass before any user-facing publication.
- [x] Build a season-scoped, non-user-facing GW1 preview only from the validated readiness snapshot; preserve evidence and limitations with every estimate.
- [x] Add a transparent preseason decision layer: player reliability is separate from potential, while squad resilience exposes bench cover, concentration, bank liquidity and captain backup.
- [x] Add a repeatable GW1 audit that fails closed until all fixtures and official player-fixture rows are present; it reports error only and never calibrates or activates.
- [x] Make Player Explorer read only the season-scoped GW1 preview for 2026/27; expose a five-GW fixture plan with per-GW detail, £m/point value for both realised and expected points, a bounded indicative range, input breakdown and explicit omissions instead of legacy five-GW projections.
- [~] Add a season-scoped manual preseason evidence layer in player details: storage, reversibility, source URL, GW expiry and caps on availability/start/minutes are complete; Explorer-wide visibility, filtering and a clear per-forecast explanation of its effect remain pending.
- [ ] User explicitly approves activating 2026/27 predictions/enrichment.

Readiness note (2026-07-23): internal snapshot `gw1-readiness` is valid for 2026/27 and deliberately has `publicationReady=false` and `activationRequested=false`. It contains 555 player profiles, each with price, position, availability, GW1 opponent/home-away context, prior provenance and confidence. Coverage passed: 20 teams, 555/555 roster records, 380/380 fixtures across 38 gameweeks, complete GW1 (10 fixtures / 20 teams / 0 players without a GW1 fixture), 841/841 source priors and 0 unknown availability states. Confidence is explicit for every profile (231 high, 105 medium, 219 low); uncertainty includes 28 transfers, 10 position changes, 82 promoted-team profiles and 151 no-PL-history profiles. Snapshot 20 also carries prior appearances so start-rate evidence is inspectable. This is a validated input artifact, not a published points projection or activation.

Preview and audit note (2026-08-01): `gw1-preseason-projection-preview` snapshot 22 contains all 555 season-scoped GW1 estimates and remains internal (`publicationReady=false`, `publicationEnabled=false`, `activationRequested=false`). The `gw1-preseason-v2` methodology uses availability, 2025/26 player priors and home/away only. It deliberately excludes current-season form, current team/opponent strength, clean-sheet and bonus components; missing xG/xA is labelled `PARTIAL`, while ruled-out players are `UNAVAILABLE`. 146 profiles are partial and 23 unavailable. Each profile also exposes reliability from `P(≥60)`, role continuity and evidence quality, plus a bounded indicative (not calibrated) range. Player Explorer reads this frozen, season-scoped source rather than the retired global predictor, and shows the evidence, calculation components and £m/point value for realised and expected points; it does not invent five identical fixture forecasts. The local `/gw1-squad` screen consumes the same frozen preview through a read-only API, exposes a 15-player draft and its scorecard, and is visibly labelled `Internal preview`; it has no persistence, FPL execution, publication or activation path. The companion `audit-gw1-preseason-preview.ts` requires 10/10 finished GW1 fixtures and at least 200 official player-fixture rows before comparing predicted xPts with official FPL points; its test run stopped correctly at 0/10 fixtures. It does not alter the prior configuration, enable publication or activate the season.

## D0.7 — Rollout and observability

- [x] Unit tests for source schemas and transformations.
- [x] Fixture tests from saved FPL/PulseLive JSON.
- [ ] Coverage dashboard by source/stat/GW.
- [ ] Freshness and schema-drift alerts.
- [x] Reconcile official FPL DEFCON across all played rows.
- [x] Remove the retired source runtime, mappings and local caches.

Release-gate update (2026-07-13): 96 tests pass and `tsc --noEmit` is clean. PulseLive publication remains disabled by the database-backed `pulselive_enrichment_enabled=false` flag. Next.js production compilation succeeds, but the build is still blocked by pre-existing ESLint debt (`no-explicit-any` and a few `prefer-const` errors) outside the new data pipeline.

Contract-fixture update (2026-08-02): a single compact saved-source fixture covers the FPL bootstrap contract and PulseLive ranked-touches contract. Existing collector tests now parse it through the production schemas alongside retry, pagination and invalid-payload paths; no production data is written or published.

Historical-prior update (2026-08-02): the leakage-free `historical-walk-forward-v1` evaluation uses only GW `< N` player rows and completed team scores when scoring GW `N`. Across 25,262 eligible 2025/26 player-fixture rows, the bounded opponent defensive prior reduced MAE from 1.0586 to 1.0542. This is a directional benchmark rather than calibration: the internal-only `gw1-preseason-v3` snapshot 23 applies it only to the attacking xG/xA component, displays its source and multiplier, and uses a neutral factor for 60 profiles facing new/unmatched teams. It does not add current-season team strength, clean-sheet or bonus assumptions.

GW1 preview v4 update (2026-08-02): a complete, validated 2025/26 PulseLive batch now includes `total_clearance` (488 ranked rows with Opta IDs). `gw1-prior-v6` stores raw and shrunk clearances per 90 for defenders, plus the official FPL DEFCON-action rate. Clearances are never added again to CBI: they only make the observed DEFCON rate of a clearance-heavy defender modestly less shrunk to the positional/team baseline. Snapshot 39 (`gw1-preseason-v4`) remains internal and inactive, and decomposes every GW1 estimate into appearance, attack, clean sheet, goals-conceded penalty and DEFCON. Attack uses bounded historical own-team attack and opponent-defence priors; defensive expectation uses bounded historical opponent attack and own-team defensive vulnerability. The DEFCON estimate is `2 × P(Poisson(action-rate × expected-minutes × bounded exposure) ≥ official threshold)` and intentionally has no separate 60-minute gate. Bonus and save effects remain excluded. The prior is not calibrated: verified historical facts are the 11,492/11,492 official DEFCON reconciliations, while empirical predictive calibration remains blocked until GW1 results exist.

GW1 preview v5 update (2026-08-02): snapshot 40 (`gw1-preseason-v5`) adds a small manual preseason-evidence layer. Each 2026/27 season player may have one active, reversible override shown in Player Explorer, with a required reason and optional source URL. `LATE_RETURN`, `MANAGED_MINUTES`, `UNAVAILABLE` and `SELECTION_RISK` only cap availability, start probability and/or expected minutes; `CONFIRMED_STARTER` is retained as provenance only and cannot increase the prior estimate. An override expires automatically after its selected GW and its save/clear action rebuilds an immutable, still-internal preview snapshot. It cannot publish estimates, activate the season or alter historical snapshots.

Manual-override UX follow-up (2026-08-02): the persistence and projection safety layer is complete, but the interface remains intentionally incomplete. Before calling this workflow finished, Player Explorer still needs an active-override indicator/filter and a concise per-GW statement of the applied cap and its impact. This follow-up is separate from the GW1 Builder work and does not block the safe use of existing caps.

GW1 Builder update (2026-08-02): the draft surface uses the fixed FPL squad shape in one rectangular board: 2 goalkeepers, 5 defenders, 5 midfielders and 3 forwards. The improvement panel tests one valid same-position replacement per line (GK/DEF/MID/FWD) and exposes the direct reasons for a suggestion: GW1 xPts, prior reliability, price and, where both players have it, historical DEFCON-actions-per-90 evidence. Auto-pick remains deliberately deferred until its selection principles and trade-offs are agreed; it must not be an opaque ranking button.

Balanced auto-pick v1 update (2026-08-03): the GW1 Builder now has an explicit, local `Balanced` auto-build. It starts from a cheap legal 15-player shell and repeatedly accepts only the best valid marginal upgrade across the whole squad. The objective is starting-XI GW1 xPts plus captain bonus and a small bench contribution, with a small residual role/evidence adjustment and soft concentration penalties; it does not reward price directly or count minutes risk twice. Budget, 2/5/5/3, max-three-per-team, a valid FPL formation, captaincy and non-zero availability are hard gates. It shows spend/bank, allocation by line, captain bonus, teams used and concentration penalty. It was verified against snapshot 40: a valid 15-player £100.0m squad uses 12 teams. This is a deterministic first-pass optimiser, not a calibrated recommendation or an FPL submission path.

GW1 Builder comparison update (2026-08-03): same-position swaps now present a visible `OUT → IN` comparison rather than compact, unexplained delta chips. Each suggestion shows both players' price, GW1 xPts and reliability, then separates `What you gain` from `What you give up` (bank, direct GW1 xPts, reliability and available historical DEFCON actions/90). A separate whole-squad row states changes to potential, starting-XI reliability and resilience. The comparison-score delta is deliberately labelled as an internal comparison aid, not as xPts; a cheaper player can therefore improve the score through bank liquidity/resilience while reducing individual GW1 xPts.

GW1 Builder global re-ranking update (2026-08-03): a point replacement is now evaluated against the complete current draft, not against a pre-truncated individual-player shortlist. For every selected player, the Builder checks every affordable, available same-position candidate, validates the resulting full squad against the budget and team cap, and recalculates the automatic XI, bench and captaincy exactly as it will after the click. It still retains one leading point change per line, but marks the best overall next move across all four lines. A previously changed player may legitimately reappear only if the current full squad makes that change the strongest one again.

## D0.8 — Rolling five-GW prediction loop

- [x] Produce a saved, fixture-by-fixture internal forecast for the next five gameweeks, including double and blank gameweeks.
- [x] Blend historical player priors with official current-season FPL minutes, xG/xA, DEFCON, bonus and saves as settled evidence accumulates.
- [x] Rebuild the rolling snapshot after a successful standard FPL sync without activating the season or publishing predictions.
- [x] Expose next-five total xPts and per-gameweek forecasts through Player Explorer's existing API contract.
- [x] Add a bounded player-versus-opponent xG/xA adjustment: use at most the two latest completed league fixtures, require meaningful player minutes, shrink the observed H2H residual to the player and opponent baseline, and cap its influence at 15%.
- [x] Expose the xG/xA composition in Player Explorer: historical/current player baseline, team-and-opponent context, H2H adjustment or explicit absence, and final fixture rate.
- [ ] Audit each settled gameweek against the forecast made before its deadline and calibrate only from those immutable pre-gameweek snapshots.

Rolling-preview update (2026-08-08): snapshot 43 (`rolling-next-5-v1`) contains 555 internal 2026/27 forecasts for GW1–GW5. Each fixture is scored separately; a double gameweek sums its fixtures and a blank remains zero. Historical rates are shrunk toward official current-season evidence as soon as settled rows exist, while current team scores gradually replace historic team strength. Expected saves use a Poisson save-threshold expectation and bonus uses a bounded observed-rate expectation. These components are transparent but are not yet empirically calibrated. `sync-fpl.ts` now attempts a rolling rebuild after a successful sync; inability to build the preview does not invalidate the official-data sync. Publication remains false and no season activation is implied.

Planning update (2026-08-08): player-versus-opponent history is an adjustment, never a stand-alone forecast. The model will compare the player's observed xG/xA in no more than two recent league fixtures with the same opponent against the player baseline already adjusted for the fixture. The small residual is shrunk for limited minutes and capped at 15%, so a single haul or blank cannot dominate season form or opponent strength. It will be shown separately in the Explorer before any empirical calibration is attempted.

Completion update (2026-08-08): imported 11,492 unique prior-season player-fixture xG/xA/G/A rows from the FPL-compatible historical archive and verified every played row against the stored official FPL fixture and minutes (0 unresolved rows and 0 minute mismatches; six source duplicates were identical and deduplicated). Rolling snapshot 51 applies the H2H residual only after at least 60 minutes, limits it to the two latest fixtures and caps its weight at 15%. Each GW card now exposes the opponent-specific source season, matches, minutes, actual xG/xA, goals, assists and the separate model weight, alongside the final fixture xG/xA per 90. The preview remains internal and uncalibrated.

## Definition of Done

- Production build and type-check pass.
- Full FPL player pool is repeatably synchronized without destructive gaps.
- Played players have per-fixture official match rows.
- DEFCON calculation agrees with the official FPL action total for all outfield test rows.
- Goalkeepers never receive DEFCON points.
- Touches, key passes and carries cover at least 95% of active outfield players with minutes.
- Missing enrichment is visible and does not silently become zero.
- User explicitly approves transition back to the Advanced roadmap.
