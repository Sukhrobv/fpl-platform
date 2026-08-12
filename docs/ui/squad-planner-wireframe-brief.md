# Squad Planner Wireframe Brief

**Use:** source brief for a Figma designer or an AI design tool.  
**Deliverable:** desktop wireframe before visual styling.  
**Reference contracts:** [Design Principles](design-principles.md) and
[Functional Contract](squad-planner-functional-contract.md).

## Design Goal

Create the primary desktop work surface for FPL Index: a personal FPL assistant
where a user builds, imports, saves and evaluates a 15-player squad across the
next five gameweeks.

The screen must feel like a fast, understandable decision workspace. It is not
a landing page, generic SaaS dashboard or a simulation game. The user should
understand the current squad, selected gameweek, recommended XI, money left and
next action within a few seconds.

## Frame and Density

- Desktop only. Design the main frame at 1600 x 1000 px; it must still make
  sense at 1440 px wide.
- Use the complete viewport width. Do not centre a narrow fixed-width panel
  inside large unused margins.
- Use a compact top application bar and a collapsible left navigation rail.
- The main work surface begins near the top; do not use a hero, large marketing
  headline or introductory paragraph.
- Start in neutral grayscale wireframe form. Do not spend time on brand colour,
  gradients or decorative illustration in this pass.

## Information Architecture

### 1. Application shell

- Collapsible left navigation: `Squad`, `Players`, `Fixtures`, `Assistant`,
  `Settings`. Expanded state may show labels; collapsed state is a narrow icon
  rail with tooltips.
- Compact top bar: product mark, current season, source/freshness status and
  unobtrusive settings access.

### 2. Squad workspace header

Use one 48-64 px high control row, not a large title block.

- Page identity: `Squad`.
- Variant selector: for example `My draft` with create, duplicate, rename and
  delete actions in a compact menu.
- Optional `Import FPL ID` command. It is a starting-point import, not a login
  and not a transfer action.
- Segmented GW control: `GW1 | GW2 | GW3 | GW4 | GW5`. The selected GW is
  unmistakable. A blank/double GW can have a small adjacent state marker.
- Quiet status: saved state, source (`Manual` or imported) and available bank.
- A compact `Use best XI` action appears only when a manual lineup override is
  active.

### 3. Main split workspace

At 1600 px, use a stable two-column layout with a 55-60% pitch workspace on
the left and a 40-45% player selection table on the right. The columns align
to the same top edge and fill the available height.

#### Pitch workspace

- A clear football-pitch diagram with understated markings, not a green
  illustrative stadium.
- Eleven starters arranged by position, each as a compact club-coloured shirt
  or kit marker. Every starter shows: player name, selected-GW xPts and fixture
  (opponent plus home/away). Captain and vice have compact visual markers.
- Four bench players live in a distinct but connected horizontal bench rail.
- The selected player/slot has a strong but restrained focus state.
- An unavailable player or missing evidence has a compact state marker.
- Empty slots, when building manually, are clear `+` slots with the same stable
  dimensions as filled slots.
- Do not put persistent position labels over the pitch. Position is conveyed by
  placement and slot arrangement.
- Show one compact squad summary at the bottom of this surface: `15/15`, spend
  and bank. Do not add explanatory prose.

#### Player selection table

- This is a high-density, fast full-roster picker, not a list of oversized
  cards.
- Top controls: search, position filter, team filter, independent minimum and
  maximum price filters, and selected metric control.
- Player rows visibly contain club identity, player name, price and one primary
  selected-GW metric by default (`xPts`). A small fixture label is useful.
- When a pitch slot is selected, filter the list to compatible position and
  visually state the selected slot without repeating instructions in prose.
- A five-GW mini-column view may be accessible, but the default scan path is
  one selected-GW metric rather than every advanced metric at once.
- The table should look capable of scrolling thousands of pixels smoothly: row
  height is stable, headers remain visible and no card grid is used.

### 4. Progressive disclosure

Keep these secondary, collapsed or on-demand:

- squad distribution/risk chart;
- detailed scorecard and resilience breakdown;
- whole-squad improvement suggestions;
- methodology, H2H, minutes, DEFCON, bonus/save and source explanations.

They open from a compact lower panel, side drawer or contextual info control.
They must not reduce the main pitch and picker into a narrow central column.

## Required States

Design the main state plus small variants for these interactions:

1. `GW2` selected with automatic best XI, captain and vice shown.
2. A defender slot selected, so the player table is filtered for compatible
   defenders and replacing the player is visually obvious.
3. A manual captaincy or lineup override exists for this GW; `Use best XI`
   becomes available without implying that the 15-player squad changed.
4. An FPL ID import action has a compact entry/confirmation state. It must make
   clear that manual variants stay untouched.

## Content Rules

- Do not use marketing language or a prominent motivational slogan.
- Do not include paragraphs explaining that forecasts are fixture-by-fixture,
  internal, uncalibrated or not submitted to FPL. Use concise status chips and
  information disclosure instead.
- Do not create a mobile layout for this deliverable.
- Do not use oversized rounded cards, decorative gradients, bokeh or unused
  whitespace.
- Do not choose a final colour palette in the wireframe.

## Review Questions

The wireframe succeeds only if the answer to all of these is yes:

1. Can a user identify their selected GW and its best XI immediately?
2. Can they see where to select or replace a player without being told in a
   paragraph?
3. Does the layout make productive use of a 1440-1600 px desktop display?
4. Is the player picker visibly designed for fast full-roster scanning?
5. Are detailed explanations available without dominating the work surface?
6. Does nothing imply that the application will submit changes to FPL?
