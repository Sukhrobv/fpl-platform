# ML Datasets

Скрипты для подготовки обучающих выборок.

## Minutes Dataset

```bash
npx tsx ml/data/prepare_minutes_dataset.ts
```

Генерирует `minutes_dataset.csv` с features:

- Schedule: rest_days, has_europe_before/after
- Injury: days_out, games_missed, game_index_since_return
- Role: perStart_xG, perSub_xG, perSub_ratio
- History: season/recent avg minutes

Targets: `y_start` (0/1), `y_60` (0/1)

## Attack Dataset

```bash
npx tsx ml/data/prepare_attack_dataset.ts
```

Генерирует `attack_dataset.csv` с features:

- Per90: xG90, xA90, shots90, keyPasses90
- Trends: slope_xG_5, rolling_avg_xG_5
- Context: is_home, start_probability

Targets: `y_goals`, `y_assists`, `y_xG`, `y_xA`
