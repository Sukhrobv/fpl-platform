# Prediction Engine Refactor Roadmap

Версия: 1.0  
Цель: сделать Prediction Engine прозрачным, расширяемым и готовым к ML/Monte Carlo: упорядочить модули, добавить недостающие признаки, усилить евристики, подготовить датасеты и ввести флаги для переключения между heuristic и ML-пайплайнами.

## Карта этапов

- B1. Архитектурная уборка и слои
- B2. Feature Expansion (MVP)
- B3. Minutes Model 2.0
- B4. Attack Model 2.0
- B5. Points Model Upgrade
- B6. Датасеты для ML
- B7. Интеграция ML моделей
- B8. Monte Carlo Simulation
- DoD: уровни готовности (MVP → Advanced → Elite)

---

## B1. Архитектурная уборка и слои

**Цель:** разложить Prediction Engine на предсказуемые доменные модули и интерфейсы.

- Структура `/services/prediction/`:
  - `features/`
  - `minutes/`
  - `attack/`
  - `points/`
  - `utils/`
- Ответственности модулей:

| Компонент    | Файл                          | Ответственность                                                           |
| ------------ | ----------------------------- | ------------------------------------------------------------------------- |
| Features     | `features/buildFeatures.ts`   | `safePer90`, `aggregateStats`, `buildPlayerFeatures`, `buildTeamFeatures` |
| Minutes      | `minutes/minutesHeuristic.ts` | `predictMinutesAndProbability`                                            |
| Attack       | `attack/attackHeuristic.ts`   | `lambdaAttack`, `lambdaDefense`, расчет xG/xA                             |
| Points       | `points/pointsCalculator.ts`  | appearance, goals, assists, CS, bonus                                     |
| Orchestrator | `PredictionService.ts`        | собирает пайплайн и оркестрирует вызовы                                   |

- Доменные типы/артефакты:
  - `MinutesFeatures`, `AttackFeatures`
  - `MinutesPrediction`, `AttackPrediction`
  - `PointsPrediction`
- Результат: чистый пайплайн и единые интерфейсы для последующих блоков.

---

### B1 Implementation Notes (2025-12-09)

- Created modular scaffold under `lib/services/prediction/` (`types`, `utils`, `minutes`, `attack`, `points`, `engine`, `index`).
- Refactored `FPLPredictionService` to consume the new engine/helpers and re-exported via `lib/services/predictionService.ts` for compatibility.
- Next: add Feature Expansion modules for B2 (schedule/injury/role/trend/team strength), plan ML toggle/dataset scaffolds (B6/B7), and Monte Carlo placeholder (B8).

---

## B2. Feature Expansion (MVP)

**Цель:** добавить контекстные признаки без ML, чтобы поднять качество базовых евристик.\*\*

- Schedule (`/features/scheduleFeatures.ts`): `rest_days`, `has_midweek_europe_before`, `has_midweek_europe_after`.
- Injury (`/features/injuryFeatures.ts`): `days_out`, `games_missed`, `game_index_since_return`.
- Role (`/features/roleFeatures.ts`): `perStart_xG`, `perSub_xG`, `perStart_xA`, `perSub_xA`.
- Trends (`/features/trendFeatures.ts`): rolling slope (xG, xA), rolling variance, rolling averages (3/5/10 games).
- Team strength: `points_per_game`, `xG_diff`, `attack_rank`, `defense_rank`.

### B2 Implementation Notes (2025-12-09)

- Added feature calculators under `lib/services/prediction/features/` (schedule, injury, role, trends, team strength) with safe defaults.
- Wired feature outputs into `FPLPredictionService` context (non-breaking, informational only) to prep for later model upgrades.
- Schedule features now derive `rest_days` from recent matches; Europe flags/points-per-game still pending.
- FBRef collector now parses fixtures/table rows via `data-stat` attributes (`lib/collectors/fbrefCollector.ts`) with heuristic parsing; Europe mapping remains TODO/placeholder-sensitive to FBRef markup.
- Pending: integrate richer schedule data (fixture dates/europe flags), add points_per_game sourcing, and plug features into ML toggles (B6/B7) and simulations (B8).

---

## B3. Minutes Model 2.0

**Цель:** учесть календарь, травмы и роль игрока в расчетах минут.\*\*

- `rest_days` penalty: если `rest_days <= 3` → `p_start *= 0.85`, `expected_minutes -= 5–10`.
- Europe penalty: если матчи до/после в пределах 2–3 дней → `p_start *= 0.9`, `p_60 *= 0.9`.
- Injury processing: `days_out > 20` → таргет `expected_minutes ≈ 35`; `days_out > 40` → таргет `≈ 20`.
- Role adjustment: высокий `perSub/perStart` → понижаем вероятность старта и трактуем как impact sub.

### B3 Implementation Notes (2025-12-09)

- ✅ Added `MinutesContext` interface to `minutes.ts` with all context fields.
- ✅ Implemented all penalties in `predictMinutesAndProbability()`:
  - Rest days: `rest_days <= 3` → `pStartPenalty *= 0.85`, `expectedMinutes -= 5`
  - Europe: midweek Europe → `pStartPenalty *= 0.9`, `prob60Penalty *= 0.9`
  - Injury: `days_out > 40` → cap ~25 min, `days_out > 20` → cap ~40 min
  - First game back: `game_index_since_return === 0` → `pStartPenalty *= 0.7`
  - Impact sub: `perSub_ratio > 1.3` → `pStartPenalty *= 0.6`, cap ~35 min
- ✅ Updated `fpl-prediction-service.ts` to pass context from features into minutes prediction.
- ✅ Fixed pre-existing regex bug in `fbrefCollector.ts`.
- ✅ Created 7 unit tests in `tests/prediction/minutes.test.ts` (all passing).

---

## B4. Attack Model 2.0

**Цель:** добавить контекст и улучшить вовлеченность.\*\*

- Strength split: home/away, rolling `team xG` trend, rolling `opponent xGA` trend.
- Goal involvement 2.0: `xG`, `xA`, `key_passes`, `touches_in_box` → `involvement_score`.
- Assist model upgrade: веса для `expected_key_passes`, `pass_to_shoot_ratio`, регрессия к среднему для `xA`.

### B4 Implementation Notes (2025-12-09)

- ✅ Added `AttackContext` interface with trend and involvement metrics.
- ✅ Implemented `calculateInvolvementScore()` combining xG, xA, key_passes, touches_in_box.
- ✅ Implemented `calculateAssistBoost()` with xA regression and key_passes analysis.
- ✅ Updated `lambdaAttack()` to accept `AttackContext` and apply trend adjustments.
- ✅ Updated `engine.ts` with `EngineContext`, involvement multiplier (+15% for central players), assist boost.
- ✅ Added `touchesInBox90_season/recent` to `PlayerInput` type.
- ✅ Created 9 unit tests in `tests/prediction/attack.test.ts` (all passing).

### B4.5 — Defensive Contributions (DEFCON) Integration

- Собрать публичные правила `DEFCON` (Defensive contributions)
- Определить список `required defensive stats`
- Настроить `data-pipeline` для `сбора defensive stats`
- Добавить `defensive features` + `builder`
- Реализовать `defconPoints` в `points model`
- Написать тесты и провести бек-тест

### B4.5 Implementation Notes (2025-12-10)

**Official FPL 2025/26 Rules:**

- DEF/GK: 10 CBIT (Clearances, Blocks, Interceptions, Tackles) = 2 pts
- MID/FWD: 12 CBIRT (CBIT + Ball Recoveries) = 2 pts
- Max 2 pts per match

**Implementation:**

- ✅ `defenseFeatures.ts` — `buildDefenseFeatures()`, CBIT/CBIRT per-90, `prob_defcon`
- ✅ `points.ts` — `calculateDefconPoints()`, `calculateExpectedDefconPoints()`
- ✅ `defcon.test.ts` — 10 unit tests (all passing)

---

## B5. Points Model Upgrade

**Цель:** перейти от средних xG/xA к распределениям очков.\*\*

- Голы: Пуассон на основе xG
  - `P(0) = e^-xG`
  - `P(1) = xG * e^-xG`
  - `P(2) = xG^2 * e^-xG / 2!` (и далее по Пуассону)
- Ассисты: аналогично, через дискретизацию по xA.
- Финальный расчет:  
  `xPts = Σ(P(k) * points_for_k_goals) + Σ(P(j) * points_for_j_assists) + CS + bonus`

### B5 Implementation Notes (2025-12-09)

- ✅ Added `poissonPmf()` function with factorial memoization for Poisson distribution.
- ✅ Implemented `calculatePoissonGoalPoints()` with position-based scoring (FWD=4, MID=5, DEF/GK=6).
- ✅ Implemented `calculatePoissonAssistPoints()` with 3 pts per assist.
- ✅ Added `calculatePoissonAttackPoints()` combining goals and assists with distributions.
- ✅ Updated `calculateSmartBonus()` to use Poisson probabilities for bonus estimation.
- ✅ Created 12 unit tests in `tests/prediction/points.test.ts` (all passing).

---

## B6. Датасеты для ML

**Цель:** подготовить обучающие выборки и пайплайны препроцессинга.\*\*

- Хранилище данных: `/ml/data/`.
- Minutes dataset (CSV): `MinutesFeatures`, `y_start` (0/1), `y_60` (0/1).
- Attack dataset (CSV): `AttackFeatures`, `y_goals`, `y_assists`.
- Скрипты подготовки: `prepare_minutes_dataset.ts`, `prepare_attack_dataset.ts` (в `/ml/data/`).

### B6 Implementation Notes (2025-12-09)

- ✅ Created `/ml/data/` directory for ML datasets.
- ✅ Implemented `prepare_minutes_dataset.ts` with Schedule, Injury, Role features and y_start/y_60 targets.
- ✅ Implemented `prepare_attack_dataset.ts` with Per90, Trend features and y_goals/y_assists/y_xG/y_xA targets.
- ✅ Added README.md with usage instructions.

---

## B7. Интеграция ML моделей

**Цель:** дать опцию переключения heuristic ⇆ ML.\*\*

- MinutesModel v1: Logistic Regression.
- AttackModel v1: XGBoost или LightGBM.
- Контур:  
  `if (USE_ML) return evaluateMLModel(features)`  
  `else return evaluateHeuristic(features)`
- Флаг: `USE_ML` в `.env` (по умолчанию выключен).

### B7 Implementation Notes (2025-12-09)

- ✅ Created `/lib/services/prediction/ml/` module with full infrastructure.
- ✅ `config.ts`: USE_ML, USE_ML_MINUTES, USE_ML_ATTACK toggles, FALLBACK_ON_ERROR.
- ✅ `types.ts`: MinutesMLInput/Output, AttackMLInput/Output interfaces.
- ✅ `loader.ts`: Placeholder ML models with heuristic-based predictions.
- ✅ `minutesWrapper.ts`: `predictMinutesWithML()` with automatic heuristic ⇆ ML toggle.
- ✅ Ready for actual trained models (replace PlaceholderMinutesModel/AttackModel).

---

## B8. Monte Carlo Simulation

**Цель:** превратить распределения в сценарии для планирования.\*\*

- Папка: `/services/prediction/simulation/`.
- Функция: `simulateGame(playerPrediction, N = 1000)` → distribution of points.
- Источники распределений: minutes model, xG/xA distributions, CS distribution.

### B8 Implementation Notes (2025-12-10)

- ✅ Created `/lib/services/prediction/simulation/` module.
- ✅ `types.ts`: SimulationInput, SimulationResult, SimulationStats, SimulationOutput.
- ✅ `sampling.ts`: samplePoisson, sampleMinutes, sampleGoals, sampleAssists, sampleCleanSheet, sampleDefcon, sampleBonus.
- ✅ `simulator.ts`: `simulateGame(N=1000)`, `quickSimulate(N=100)`, points calculation, stats aggregation.
- ✅ Output: mean, median, stdDev, percentiles, distribution histogram, haul_probability, blank_probability.
- ✅ 9 unit tests in `tests/prediction/simulation.test.ts` (all passing).

---

## Definition of Done / уровни готовности

- **MVP:** чистая архитектура, новые признаки, Minutes 2.0, Attack 2.0, Points distribution v1.
- **Advanced:** ML minutes model, ML attack model, переключатель heuristic/ML, пайплайн обогащен фичами.
- **Elite:** Monte Carlo, ML bonus model, полный distribution planner (включая бонус/CS сценарии).
