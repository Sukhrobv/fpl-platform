# UI/UX modernization roadmap

## Context

The 2026/27 FPL bootstrap is not available yet, so D0.6.5 remains an external gate rather than being simulated. UI work proceeds as an independent track and must not activate unpublished data or change prediction semantics.

The adopted expert recommendation is preserved in `docs/ui/fpl-ui-stack-recommendation.md`.

## Adopted stack

- Base UI as the headless primitive layer for new components.
- shadcn CLI only as a source-code distribution and composition tool; its default visual style is not the product design.
- Tailwind CSS 4 and semantic CSS variables for the product-owned visual system.
- TanStack Table v8 and TanStack Virtual for Player Explorer.
- Recharts for standard charts; custom SVG/visx only for product-specific visuals.
- Lucide icons, React Hook Form and Zod where appropriate.

Decision update (2026-07-14): the user explicitly rejected a prolonged legacy/new coexistence period. UI0.2 removes the Radix component layer and temporary `v2` split, leaving one Base UI component surface. Business logic and routes remain intact while their visual redesign continues in later stages.

## Non-negotiable visual principles

- No slate/emerald/teal default dashboard palette or decorative blue-green gradients.
- Product-owned semantic tokens distinguish facts, forecasts, uncertainty, risk and data freshness.
- Colour is never the only carrier of meaning.
- Restrained radii, borders and typographic hierarchy replace card-heavy SaaS styling.
- Dense analytical views support compact and comfortable modes.
- Light and dark themes share the same semantic model.

## UI0.1 — Foundation (current task)

- [x] Preserve the expert recommendation in the repository.
- [x] Add the Base UI foundation without rewriting working legacy components.
- [x] Add semantic colour, typography, radius, density, motion and state tokens.
- [x] Establish a separate new-UI component surface for progressive migration.
- [x] Verify type safety and the production build boundary.

Completion gate: the project has a stable, visually neutral new-UI foundation while all existing screens continue to compile. Do not start the navigation shell before this gate is recorded.

Completion note (2026-07-14): Base UI 1.6 is installed and future registry additions target `components/v2/ui` with the `base-lyra` source preset. The scoped `.fpl-ui` contract provides separate light/dark values for facts, forecasts, uncertainty, risk, deltas and freshness, plus density, tabular-number and reduced-motion rules. Legacy `components/ui` remains untouched. TypeScript and focused lint are clean, all 112 tests pass, and the Next.js production compiler succeeds; the final build continues to stop only at the previously recorded legacy ESLint debt outside UI0.1.

## UI0.2 — Navigation shell

- [x] Remove the legacy Radix component layer and dependencies.
- [x] Collapse the temporary `v2` split into one canonical UI component surface.
- [x] Responsive navigation, page header and season/gameweek context.
- [x] Light/dark theme switch using semantic tokens.
- [x] Data freshness/status affordance.
- [x] Keyboard, focus and reduced-motion verification.

Completion note (2026-07-14): all Radix packages, imports, the old Sidebar and the temporary `components/v2` tree are removed. `components/ui` is the single Base UI surface, product tokens are global, and the new AppShell provides responsive navigation, season context, data status, theme persistence, focus treatment and reduced-motion behaviour. TypeScript and focused lint are clean, all 114 tests pass, and the production compiler succeeds. The final build still stops at the separately tracked legacy ESLint debt in pre-existing feature code.

## UI0.3 — Player Explorer prototype

- [x] TanStack Table + TanStack Virtual on realistic 700–850-row data.
- [x] Semantic table markup, sticky header and two pinned columns.
- [x] Sorting, search, filters, column visibility and density modes.
- [x] Forecast cell popover, confidence state and accessible non-colour signals.
- [x] Performance measurement before the pattern is reused elsewhere.

Completion note (2026-07-14): the old PredictionsTable and its private dialogs/cards were removed and `/predictions` now hosts the canonical Player Explorer. It loads the complete roster independently from optional forecast data, keeps forecast cells empty when official fixtures are unavailable, virtualizes rows with TanStack Virtual and preserves semantic table markup with player/team pinned. Search, position/team/availability filters, sorting, column visibility, compact/comfortable density and text-plus-icon confidence states are implemented. The 841-row benchmark averaged 0.0413 ms per filter pass over 1,000 iterations; TypeScript and focused lint are clean, all 118 tests pass, and the production compiler succeeds. The final build still stops at separately tracked ESLint debt outside UI0.3.

## UI0.4 — My Team

- [x] Product-specific pitch visualisation.
- [x] Squad health, problems, captaincy and transfer entry points.
- [x] Responsive alternative to the desktop pitch.

Completion note (2026-07-14): the seven legacy `components/personal` UI files were removed and `/personal` now renders one typed My Team workspace. Desktop uses a product-specific tactical pitch with a separate bench; smaller screens use a grouped 15-player list. Captain and vice-captain have explicit labels, availability flags are not colour-only, and health, problems, elite-context counts, chip signal and the strongest transfer signal form one decision queue. A saved squad loads independently of a fresh FPL sync, so the off-season API gate does not erase the last valid squad. TypeScript and focused lint are clean, all 122 tests pass, and the production compiler succeeds. The final build still stops at separately tracked ESLint debt outside UI0.4.

## UI0.5 — Decision flows

- [x] Player details.
- [x] Multi-player comparison, limited to three players.
- [x] Transfer advisor with same-position validation and explicit missing-data states.
- [x] Reusable player, metric, confidence and freshness components.

Completion note (2026-07-14): Player Explorer now opens a detailed player evidence view, maintains a three-player decision set and compares the selected players in one aligned surface. Its transfer advisor evaluates same-position swaps, forecast and price deltas, and fails closed when forecast evidence is absent; it never executes a transfer. My Team deep-links its strongest recommendation into this evaluation flow. Shared player identity, metric, confidence and freshness primitives keep facts, forecasts and data state visually consistent. External Google font loading was removed in favour of local system stacks so production compilation no longer depends on network access. TypeScript and focused lint are clean, all 126 tests pass, and the production compiler succeeds; the final build still stops at separately tracked legacy ESLint debt outside UI0.5.

## UI0.6 — AI, onboarding and settings

- [x] Structured AI responses reusing established analytical components.
- [x] FPL ID onboarding and sync states.
- [x] Preferences, table settings and data-status surfaces.

Completion note (2026-07-14): the legacy blue-green chat and settings pages were replaced with product-owned workspaces. Assistant responses now separate interpretation from tool evidence, reuse metric and freshness primitives, expose lookup provenance and suppress the legacy xPts heuristic from the 2026/27 evidence surface while official fixtures are pending. Settings distinguish a locally saved public FPL ID, an available stored squad and a confirmed live sync; sync failure preserves the last valid squad. Device-local preferences now control interface density, assistant language and optional automatic sync attempts, and My Team honours the latter. The data-status surface keeps 2025/26 frozen evidence distinct from the pending 2026/27 feed. TypeScript and focused lint are clean, all 130 tests pass, and the production compiler succeeds; the final build still stops at separately tracked legacy ESLint debt outside UI0.6.

## Migration rule

Only one UI task is active at a time. From UI0.2 onward, legacy Radix components must not coexist with the canonical Base UI layer. Existing route business logic may remain while each screen is visually rebuilt in roadmap order.
