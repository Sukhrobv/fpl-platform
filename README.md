# FPL Analytics Platform

Internal Fantasy Premier League analytics workspace. It ingests official FPL
data, enriches it with saved preseason-minutes evidence and produces
fixture-by-fixture internal forecasts for the next five gameweeks.

The 2026/27 prediction surface is internal. It does not publish forecasts,
activate a season, or submit FPL actions.

## Requirements

- Node.js 20+
- PostgreSQL database configured through `DATABASE_URL`

## Start

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run type-check
npm run format:check
```

## Data commands

```bash
npm run sync:fpl
npm run sync:preseason-minutes -- --season=2026/27
npm run sync:h2h-history -- --season=2025/26
npm run preview:rolling -- --season=2026/27
```

`sync:fpl` rebuilds the internal rolling preview after a successful official
sync. The preseason tracker is a saved evidence source: positive friendly
minutes can only cap expected minutes for the first upcoming fixture.

## Documentation

Current delivery status: `status.yaml`.

Current authorised roadmap:
[`docs/analytics/data-foundation-roadmap.md`](docs/analytics/data-foundation-roadmap.md).

Historical planning material lives in [`docs/archive`](docs/archive).
