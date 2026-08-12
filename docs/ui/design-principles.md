# FPL Index Design Principles

**Status:** active product and UI contract.  
**Scope:** desktop web application. This document directs future design work; it
does not authorise changes to prediction semantics, publication or FPL actions.

## Product Character

FPL Index is a clear personal FPL assistant with serious analytical depth. It
must help a user make and retain a considered squad plan, not imitate a generic
SaaS dashboard or a marketing site.

- Usability wins over decorative styling.
- Analytical detail is available when needed, not permanently competing for
  attention.
- Colour is a supporting signal, never the only way to communicate a result.
- The visual palette is deliberately not prescribed here. Structure, hierarchy
  and speed matter more than colour direction.

## One Squad Workspace

"My Team" and the preseason "GW1 Builder" are one product surface: **Squad**.

- A user may begin with a manually built squad or optionally import a public
  FPL squad by FPL ID.
- Importing a squad creates a starting point; it must not send transfers,
  chips or other actions to FPL.
- A squad contains 15 players and can have saved named variants.
- Gameweek selection is a first-class control. Selecting GW1 through GW5 shows
  the best legal XI, bench, captain and vice-captain from those 15 players for
  that specific gameweek.
- Automatic XI selection never silently changes the 15-player squad. Manual
  lineup choices must remain possible and visibly override the suggestion.
- Future transfer planning is an internal, saveable decision exercise. It is
  not FPL execution.

## Primary Decision Surfaces

### Squad

The Squad workspace is the primary home for building, inspecting and saving a
squad. On a wide display, the pitch and fast player-selection surface share the
screen without artificial gutters or unused columns.

- The gameweek selector, selected plan, budget and save state stay compact and
  close to the workspace header.
- The pitch makes selected players, their fixture and the relevant gameweek
  forecast immediately legible.
- The player picker is optimised for repeated selection: search, position,
  team and independent price filters; club identity and price are prominent.
- Side navigation can collapse to an icon rail to return width to the work.
- Secondary outputs such as distribution charts, scorecards and improvement
  ideas are collapsible panels or drawers, not permanent obstacles to building
  a squad.

### Players

The player table is the default comparison tool for the whole player pool.

- It must remain fluid at full-roster size; virtualisation and stable layout are
  product requirements, not optional polish.
- The default view shows one meaningful selected metric, price and the next
  five gameweeks. It must be easy to change the metric.
- A separate comparison mode supports up to five pinned players when a deeper
  side-by-side decision is needed.
- Full analytical breakdown belongs in player detail or an explicit expanded
  view, not in every table row by default.

### Fixtures

Fixtures are a dedicated, readable team matrix rather than a small auxiliary
widget.

- The user can switch between attack, defence and overall views.
- Each gameweek cell pairs a large numerical signal with the fixture label.
- Heatmap intensity follows the value, while sufficient contrast and visible
  numbers keep the matrix readable without colour alone.
- The matrix should use the available desktop width and support scanning across
  five gameweeks quickly.

## Information Hierarchy

Every visible element must answer one of three questions: what is my current
state, what can I do next, or why should I care? Otherwise it is a candidate
for removal, consolidation or progressive disclosure.

- Prefer a visual control, status mark, label or tooltip over a paragraph that
  explains how to operate the screen.
- Keep titles short and factual. Do not use large introductory blocks above a
  working tool.
- Repeated methodology disclaimers do not belong on every screen.
- Show a compact status such as `Pre-season` or `Internal estimate` where
  relevant. Put evidence, limitations and methodology behind an adjacent info
  control or a "How this is calculated" drawer.
- Warnings appear only when they materially affect the decision: unavailable
  player, missing source data, stale sync or unresolved forecast evidence.
- Do not hide uncertainty. Present it compactly through range, risk or evidence
  states, with full detail available on demand.

## Desktop Layout and Density

The application is desktop-first. Mobile layouts are not a current delivery
requirement.

- Use wide screens intentionally. Do not reserve large empty margins beside a
  narrow tool surface.
- Persistent navigation is useful, but it must be collapsible.
- Align headers, tables, controls and panels to a predictable grid.
- Preserve readable whitespace around groups and decisions, not accidental
  gaps caused by fixed-width containers.
- Controls used repeatedly need fixed, stable dimensions so filters, values and
  hover states do not shift the interface.

## Data and Trust

The interface must make the difference between a fact, an estimate and missing
evidence obvious without overexplaining it.

- Official FPL facts, forecast values and unavailable data use distinct labels
  and states.
- A gameweek forecast is fixture-specific. Blank and double gameweeks are
  represented truthfully.
- Information about H2H, minutes risk, DEFCON, bonus, saves and model evidence
  is accessible from the relevant player or fixture, not forced into the main
  scan path.
- No UI copy may imply that internal plans are submitted to or modify FPL.

## Interaction Principles

- Changing a gameweek updates the decision context immediately and visibly.
- Expensive calculations may load, but the interaction must retain its layout
  and clearly show the pending state.
- Search, filters, sorting, squad selection and table scrolling must feel
  immediate at the full 2026/27 roster size.
- Every automatic recommendation has an inspectable reason and can be
  overridden by the user.
- Saved state is visible but quiet: an unobtrusive saved indicator is enough.

## Design Review Checklist

Before accepting a UI change, check that it:

1. Supports a real FPL decision or removes friction from one.
2. Uses desktop width productively and avoids arbitrary empty space.
3. Does not add persistent explanatory prose where a visual affordance,
   tooltip or disclosure would work.
4. Keeps the current gameweek and its effect on forecasts unambiguous.
5. Preserves a fast, stable table and picker experience at full roster size.
6. Keeps facts, forecasts, uncertainty and missing evidence distinguishable.
7. Does not imply FPL account execution or publication that the product does
   not perform.
