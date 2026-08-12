# AI Design Prompt: Squad Planner Wireframe

Copy the prompt below into UX Pilot, Google Stitch or Figma AI. Attach the
current product screenshots only as structural references, not as colour or
branding instructions.

```text
Act as a senior product and UX designer. Create a desktop-first, low-fidelity
wireframe for a Fantasy Premier League planning web application called FPL
Index. Do not write code. Do not design a marketing landing page.

The product is a clear personal FPL assistant with analytical depth. Its
primary screen is called Squad. It combines an existing "My Team" area and a
preseason squad builder into one workspace for building, importing, saving and
evaluating a 15-player squad across the next five gameweeks. The application
never submits transfers, chips, captaincy or lineup changes to FPL.

Create one 1600 x 1000 desktop application frame, still workable at 1440 px
wide. Start with neutral grayscale wireframe styling. Do not choose a final
colour palette, gradients, hero image, marketing slogan or mobile layout.

The layout must use the full desktop width:

1. A compact, collapsible left navigation. Expanded labels: Squad, Players,
   Fixtures, Assistant, Settings. Collapsed state is a narrow icon rail with
   tooltips.
2. A compact top app bar with product mark, season and small source/freshness
   status.
3. A single 48-64 px Squad control row. Include a saved squad-variant selector
   such as "My draft", optional "Import FPL ID" command, GW1-GW5 segmented
   control, source state (Manual or Imported), bank and quiet saved indicator.
   Do not use a big title or explanatory text block.
4. Main body is a stable two-column workspace: 55-60% left football pitch,
   40-45% right player-selection table. Both columns align to the top and use
   available height without artificial empty gutters.

Pitch requirements:
- Understated football markings on a neutral surface, not a green stadium.
- Eleven starters positioned by formation using compact club-coloured shirt
  markers. Each marker shows name, selected-GW expected points and fixture
  (opponent plus home/away). Show concise captain and vice markers.
- Four bench players in a distinct connected horizontal rail.
- The selected player or empty slot has a clear focus state. Empty slots use a
  plus sign with the same stable dimensions as filled slots.
- Do not show persistent GK/DEF/MID/FWD labels on the pitch.
- Show only a compact bottom summary: 15/15, spend and bank.

Player-picker requirements:
- It is a dense, smooth full-roster table, not a card grid.
- Header controls: search, position, team, min price, max price and selected
  metric. Price and club identity are prominent.
- Default columns: club mark, player name, price, selected-GW xPts and compact
  fixture. Do not expose every advanced metric by default.
- When the user selects a pitch slot, compatible-position rows are filtered and
  the slot context is obvious visually.
- Make row heights, table header and scroll behaviour feel stable and fast.

Gameweek behaviour:
- Selected GW changes the shown fixture and forecast context.
- For the selected GW, the system recommends the legal XI, captain and vice
  from the same 15-player squad by maximum expected FPL points.
- A manual lineup or captain override is local to that GW. When an override is
  active, show a compact "Use best XI" command. It does not change the 15
  players.
- Blank and double gameweeks have compact truthful state markers.

Use progressive disclosure. Keep risk distribution charts, detailed scorecards,
whole-squad upgrade suggestions, model methodology, H2H, minutes and DEFCON
explanations collapsed into a lower panel, side drawer or contextual info
control. Do not place paragraphs explaining the model above the workspace.

Also provide three small state variants beside or below the main frame:
1. GW2 automatic best XI with captain and vice.
2. Defender slot selected; the table filters to compatible defenders.
3. Manual captain or lineup override active; "Use best XI" is visible.

Prioritise visual comprehension, compact controls, wide-screen productivity and
fast player selection. Colour may support states but must not be the only
signal. The screen should feel like a serious but approachable personal FPL
decision tool, not a generic SaaS dashboard.
```

## What to Bring Back for Review

Provide one editable Figma frame or export PNGs of:

1. the main automatic-GW state;
2. selected-slot/player-picker state; and
3. manual-override state.

The next review checks information hierarchy, desktop width use, state clarity
and decision flow before any visual palette or production implementation.
