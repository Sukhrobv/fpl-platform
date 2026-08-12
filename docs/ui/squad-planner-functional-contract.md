# Squad Planner Functional Contract

**Status:** approved product contract.  
**Scope:** defines behaviour for the future Squad workspace. It does not yet
authorise a database migration, FPL execution, publication or prediction-model
changes.

## Purpose

Squad Planner replaces the separation between "My Team" and "GW1 Builder".
It is one desktop workspace for creating, importing, comparing and saving FPL
squad plans across the next five gameweeks.

The Planner helps a user make decisions in this product. It never submits a
transfer, chip, lineup or captaincy choice to Fantasy Premier League.

## Entry States

### Manual plan

A user can start immediately without an FPL ID. They select players, build a
legal 15-player squad and save named variants.

### Optional FPL ID import

Entering an FPL ID is optional and has no account-login or OAuth requirement.
The import reads the public FPL squad and creates or refreshes one distinct
saved variant named `Imported FPL squad`.

- Importing never deletes, resets or overwrites manual variants.
- A user who has already experimented manually can import later and compare the
  imported squad with that work.
- Refreshing an existing imported variant updates that variant only. Before any
  differing player selections replace the saved version, the user sees a clear
  confirmation and may cancel.
- The imported variant retains its FPL ID as provenance and shows when it was
  last refreshed.
- A failed import leaves every existing saved variant unchanged and explains the
  failure at the import control.

## Saved Variants

A variant is an internal, saveable squad plan. It includes:

- 15 selected players and remaining bank;
- source: `Manual` or `Imported FPL squad`;
- optional FPL ID and refresh timestamp for imported variants;
- gameweek-specific lineup overrides; and
- a name chosen by the user.

The user can create, duplicate, rename, switch and delete variants. Saving is
quiet and visible through a small saved state, not a blocking workflow.

Variants are independent. Editing a manual variant cannot change an imported
variant, and refreshing the imported variant cannot change manual work.

## Gameweek Context

The Planner always works in a selected gameweek context.

- The control shows the next five eligible gameweeks. Before the season this is
  GW1-GW5; during the season it begins with the next relevant gameweek.
- The selected gameweek drives the pitch, player forecast, fixture labels,
  captaincy recommendation and all squad-level totals.
- A blank gameweek is shown truthfully as no fixture and zero forecast rather
  than copied data. A double gameweek sums its two fixtures.
- Switching gameweeks does not modify the 15-player squad.

## Automatic XI and Captaincy

For every selected gameweek, the Planner calculates a recommended lineup from
the variant's existing 15 players.

### Objective

The primary objective is to maximise expected FPL points for the selected
gameweek. This is the agreed decision rule.

- Players marked unavailable are excluded from the recommended starting XI.
- The XI is always FPL-legal: one goalkeeper; 3-5 defenders; 2-5 midfielders;
  1-3 forwards; and eleven starters in total.
- The recommendation uses the selected gameweek's fixture-specific forecast,
  including the truthful blank/double-gameweek representation.
- The captain is the eligible starter with the highest selected-GW expected
  points. The vice-captain is the next eligible starter by the same rule.
- If values are tied, the result must be deterministic and inspectable. The UI
  may expose the tie-break only when it affects the result.
- The remaining four players form the bench. Their order is a recommendation,
  not an FPL submission.

### Manual overrides

The recommendation is a starting point, never a hidden mutation.

- A user may select a different legal XI, bench order, captain or vice-captain
  for a specific gameweek.
- The manual choice is saved as an override for that variant and gameweek.
- A visible `Use best XI` action discards only that gameweek's override and
  restores the current automatic recommendation after confirmation.
- An override affects no other gameweek and does not change the 15-player
  squad.

## Player Changes and Future Transfer Planning

Adding or replacing a player changes the internal saved variant only. The
Planner may show the effect on budget, selected-GW points and future gameweeks,
but it does not execute a real-world FPL transfer.

Transfer planning remains a future internal feature. When added, it must create
or update a saved variant rather than mutate the imported FPL squad silently.

## Required UX States

The future implementation must make these states obvious with compact visual
signals:

- manual plan or imported FPL source;
- currently selected gameweek;
- automatic recommendation or manual gameweek override;
- saved, saving or failed-to-save state;
- FPL import freshness or import failure; and
- unavailable players and missing forecast evidence.

Methodology and evidence details belong in contextual disclosure, not in a
permanent explanatory paragraph above the workspace.

## Acceptance Scenarios

1. A user builds and saves a manual squad, imports an FPL ID, and still has the
   original manual variant unchanged.
2. A user selects GW3 and sees the maximum-xPts legal XI, captain and vice from
   the same 15 players; no player transfer occurs.
3. A user manually changes the GW3 captain. GW1, GW2 and GW4-GW5 remain
   automatic and unchanged.
4. A user refreshes the imported FPL squad, rejects the confirmation, and the
   saved imported squad remains unchanged.
5. A user selects a double gameweek and the recommended XI uses that GW's
   summed fixture forecasts; a blank-gameweek player is not presented as having
   an invented fixture forecast.
