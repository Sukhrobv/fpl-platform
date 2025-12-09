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

| Компонент    | Файл                                | Ответственность                                                          |
|--------------|-------------------------------------|--------------------------------------------------------------------------|
| Features     | `features/buildFeatures.ts`         | `safePer90`, `aggregateStats`, `buildPlayerFeatures`, `buildTeamFeatures`|
| Minutes      | `minutes/minutesHeuristic.ts`       | `predictMinutesAndProbability`                                           |
| Attack       | `attack/attackHeuristic.ts`         | `lambdaAttack`, `lambdaDefense`, расчет xG/xA                            |
| Points       | `points/pointsCalculator.ts`        | appearance, goals, assists, CS, bonus                                    |
| Orchestrator | `PredictionService.ts`              | собирает пайплайн и оркестрирует вызовы                                  |

- Доменные типы/артефакты:
  - `MinutesFeatures`, `AttackFeatures`
  - `MinutesPrediction`, `AttackPrediction`
  - `PointsPrediction`
- Результат: чистый пайплайн и единые интерфейсы для последующих блоков.

---

## B2. Feature Expansion (MVP)
**Цель:** добавить контекстные признаки без ML, чтобы поднять качество базовых евристик.**

- Schedule (`/features/scheduleFeatures.ts`): `rest_days`, `has_midweek_europe_before`, `has_midweek_europe_after`.
- Injury (`/features/injuryFeatures.ts`): `days_out`, `games_missed`, `game_index_since_return`.
- Role (`/features/roleFeatures.ts`): `perStart_xG`, `perSub_xG`, `perStart_xA`, `perSub_xA`.
- Trends (`/features/trendFeatures.ts`): rolling slope (xG, xA), rolling variance, rolling averages (3/5/10 games).
- Team strength: `points_per_game`, `xG_diff`, `attack_rank`, `defense_rank`.

---

## B3. Minutes Model 2.0
**Цель:** учесть календарь, травмы и роль игрока в расчетах минут.**

- `rest_days` penalty: если `rest_days <= 3` → `p_start *= 0.85`, `expected_minutes -= 5–10`.
- Europe penalty: если матчи до/после в пределах 2–3 дней → `p_start *= 0.9`, `p_60 *= 0.9`.
- Injury processing: `days_out > 20` → таргет `expected_minutes ≈ 35`; `days_out > 40` → таргет `≈ 20`.
- Role adjustment: высокий `perSub/perStart` → понижаем вероятность старта и трактуем как impact sub.

---

## B4. Attack Model 2.0
**Цель:** добавить контекст и улучшить вовлеченность.**

- Strength split: home/away, rolling `team xG` trend, rolling `opponent xGA` trend.
- Goal involvement 2.0: `xG`, `xA`, `key_passes`, `touches_in_box` → `involvement_score`.
- Assist model upgrade: веса для `expected_key_passes`, `pass_to_shoot_ratio`, регрессия к среднему для `xA`.

---

## B5. Points Model Upgrade
**Цель:** перейти от средних xG/xA к распределениям очков.**

- Голы: Пуассон на основе xG  
  - `P(0) = e^-xG`  
  - `P(1) = xG * e^-xG`  
  - `P(2) = xG^2 * e^-xG / 2!` (и далее по Пуассону)
- Ассисты: аналогично, через дискретизацию по xA.
- Финальный расчет:  
  `xPts = Σ(P(k) * points_for_k_goals) + Σ(P(j) * points_for_j_assists) + CS + bonus`

---

## B6. Датасеты для ML
**Цель:** подготовить обучающие выборки и пайплайны препроцессинга.**

- Хранилище данных: `/ml/data/`.
- Minutes dataset (CSV): `MinutesFeatures`, `y_start` (0/1), `y_60` (0/1).
- Attack dataset (CSV): `AttackFeatures`, `y_goals`, `y_assists`.
- Скрипты подготовки: `prepare_minutes_dataset.ts`, `prepare_attack_dataset.ts` (в `/ml/data/`).

---

## B7. Интеграция ML моделей
**Цель:** дать опцию переключения heuristic ⇆ ML.**

- MinutesModel v1: Logistic Regression.
- AttackModel v1: XGBoost или LightGBM.
- Контур:  
  `if (USE_ML) return evaluateMLModel(features)`  
  `else return evaluateHeuristic(features)`
- Флаг: `USE_ML` в `.env` (по умолчанию выключен).

---

## B8. Monte Carlo Simulation
**Цель:** превратить распределения в сценарии для планирования.**

- Папка: `/services/prediction/simulation/`.
- Функция: `simulateGame(playerPrediction, N = 1000)` → distribution of points.
- Источники распределений: minutes model, xG/xA distributions, CS distribution.

---

## Definition of Done / уровни готовности
- **MVP:** чистая архитектура, новые признаки, Minutes 2.0, Attack 2.0, Points distribution v1.
- **Advanced:** ML minutes model, ML attack model, переключатель heuristic/ML, пайплайн обогащен фичами.
- **Elite:** Monte Carlo, ML bonus model, полный distribution planner (включая бонус/CS сценарии).
