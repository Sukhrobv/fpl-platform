# 🟦 Advanced Prediction Engine Roadmap

**Версия:** 2.0  
**Статус:** In Development  
**Цель:** Создать production-ready модель с полным учётом контекстных факторов FPL, включая DEFCON, и подготовить основу для ML-моделей.

> [!IMPORTANT]
> **Advanced = Heuristic Engine 2.0 + Full Feature Pipeline + ML-ready Datasets + DEFCON Integration**

> [!CAUTION]
> **Advanced roadmap is paused.** The active authorized stage is `D0 Reliable Data Foundation` in `data-foundation-roadmap.md`. No A1–A8 work may resume until D0 passes its Definition of Done and the user explicitly approves the transition.

## 2026 data-source recovery decision

- Use official per-fixture FPL fields for DEFCON: CBI, tackles, recoveries and defensive contribution.
- Use cumulative snapshots from the public Premier League PulseLive JSON backend for touches, key passes and carries.
- Map PulseLive to FPL by exact Opta id (`owner.altIds.opta` ↔ FPL `opta_code`).
- Keep Understat only as optional xGChain/xGBuildup enrichment.
- Do not fabricate missing metrics or silently convert missing source data to zero.

---

## 📊 Карта этапов

| Этап | Название                    | Критичность | Статус |
| ---- | --------------------------- | ----------- | ------ |
| A1   | Full Feature Stack          | 🔴 Critical | [ ]    |
| A2   | Minutes Model v3.0          | 🟡 High     | [ ]    |
| A3   | Attack Model v3.0           | 🟡 High     | [ ]    |
| A4   | Defense Model v2.0 (DEFCON) | 🔴 Critical | [ ]    |
| A5   | Points Model v2.5           | 🟡 High     | [ ]    |
| A6   | ML Dataset Generation       | 🟢 Medium   | [ ]    |
| A7   | ML Integration Layer        | 🟢 Medium   | [ ]    |
| A8   | Simulation Layer v2.0       | 🟢 Medium   | [ ]    |

---

## A1. Full Feature Stack (расширение признаков)

**Цель:** Расширить feature pipeline для ML и DEFCON интеграции.

### A1.1 Player-level Enriched Features

#### Defensive Features (для DEFCON)

- [x] `tackles` — отборы
- [x] `interceptions` — перехваты
- [x] `blocks` — блоки
- [x] `clearances` — выносы
- [x] `ball_recoveries` — возвраты мяча
- [x] `aerial_duels_won` — выигранные воздушные дуэли
- [x] `challenges_won` — выигранные единоборства

#### Offensive Flow Features

- [ ] `xThreat` — expected threat
- [ ] `xGChain` — xG chain involvement
- [ ] `xBuildup` — xG buildup contribution

#### Positional Role Detection

- [ ] Inverted full-back detection
- [ ] Wing-back classification
- [ ] DM / AM / False 9 roles (из heatmaps или позиционных данных)

**Deliverable:** `lib/services/prediction/features/playerEnriched.ts`

---

### A1.2 Team-level Enriched Features

- [ ] Team DEFCON environment (aggregate defensive actions)
- [ ] Game state tendencies:
  - [ ] Minutes leading / drawing / trailing
- [ ] Tempo / PPDA classification
- [ ] Deep zones conceded and created

**Deliverable:** `lib/services/prediction/features/teamEnriched.ts`

---

### A1.3 Fixtures / Schedule Features 2.0

- [ ] Travel distance calculation
- [ ] Time of day factor
- [ ] Opponent fatigue index
- [ ] Opponent injury depth

**Deliverable:** `lib/services/prediction/features/scheduleAdvanced.ts`

---

## A2. Minutes Model v3.0 (Semi-ML / Enhanced Heuristic)

**Цель:** Добавить rotation patterns и улучшенное моделирование травм.

### A2.1 Staff Patterns

- [ ] Rotation fingerprints тренеров (Pep, Klopp, De Zerbi, Arteta, Postecoglou)
- [ ] Probability-of-start кластеризация по прошлым сезонам
- [ ] Manager-specific rotation rules

**Deliverable:** `lib/services/prediction/minutes/rotationPatterns.ts`

---

### A2.2 Enhanced Injury Modelling

- [ ] Minutes trajectory after long-term injury (data-based curves)
- [ ] Recurrence risk modelling (эвристика + исторические данные)
- [ ] Recovery phase detection

**Deliverable:** `lib/services/prediction/minutes/injuryModelling.ts`

---

### A2.3 Combination Model

```
expected_minutes = base_minutes_estimate
  × role_modifier
  × rotation_modifier
  × fatigue_modifier
  + return_from_injury_curve
```

- [ ] Implement combination formula
- [ ] Add configurable weights
- [ ] Backtest against historical data

---

### A2.4 ML-ready Minutes Dataset

- [ ] Export features: schedule, role, trend, DEFCON activity, coach patterns
- [ ] Export targets: `y_start`, `y_60`
- [ ] Validation split strategy

**Deliverable:** `ml/data/minutes_v3_dataset.csv`

---

## A3. Attack Model v3.0

**Цель:** Расширить involvement model и добавить opponent defensive style.

### A3.1 Enhanced Involvement Model

- [ ] Integrate xThreat into `involvementScore`
- [ ] Add xGChain contribution
- [ ] Include box touches and carries

**Formula:**

```
involvement_v3 = w1*xG + w2*xA + w3*xThreat + w4*xGChain + w5*touches_in_box + w6*carries
```

**Deliverable:** `lib/services/prediction/attack/involvementV3.ts`

---

### A3.2 Opponent Defensive Style Classifier

- [ ] High press classifier
- [ ] Mid block classifier
- [ ] Low block classifier
- [ ] Style impact on xA/xG probabilities

**Deliverable:** `lib/services/prediction/attack/opponentStyle.ts`

---

### A3.3 Volatility Registration

- [ ] Calculate player variance (high vs low variance attackers)
- [ ] Haaland/Darwin = high variance profile
- [ ] Saka/Odegaard = low variance profile
- [ ] Variance adjustment for Poisson λ

**Deliverable:** `lib/services/prediction/attack/volatility.ts`

---

## A4. Defense Model v2.0 (DEFCON Integration)

**Цель:** Полная интеграция DEFCON как 4-го компонента xPts.

> [!IMPORTANT]
> Это ключевой апгрейд Advanced-уровня!

### A4.1 DEFCON Points Model

На основе официальных правил FPL 25/26:

- **DEF:** 10 CBIT = 2 pts; **GK:** not eligible
- **MID/FWD:** 12 CBIRT = 2 pts
- Max 2 pts per match

```typescript
expected_defensive_actions = weighted_sum(
  tackles, interceptions, blocks, clearances,
  recoveries, pressures, aerial_duels_won
)

defcon_points = expected_defensive_actions × conversion_rate
```

- [ ] Finalize DEFCON calculation formula
- [ ] Position-specific thresholds
- [ ] Points conversion rates

**Deliverable:** `lib/services/prediction/defense/defconPoints.ts`

### A4.3 Individual DEFCON Profile

Для каждого игрока рассчитывается:

- [x] `baseline_defensive_actions_per_90`
- [x] `variability_σ`
- [x] `role_multiplier` (full-back vs CB)
- [x] `opponent_multiplier`

**Deliverable:** `lib/services/prediction/defense/defconProfile.ts`

---

### A4.4 xPts Integration

После DEFCON integration:

```
xPts = appearance + attack + defense(CS/GC) + DEFCON + bonus
```

- [ ] Update PointsCalculator with DEFCON component
- [ ] Add DEFCON to simulation model
- [ ] Update UI to display DEFCON contribution

---

## A5. Points Model v2.5

**Цель:** Расширить Poisson model с DEFCON distribution.

### A5.1 DEFCON Distribution

DEFCON points распределены (не линейно!):

```
def_actions ~ Poisson(λ_def_actions)
defcon_points = k × points_per_action
```

- [ ] Implement DEFCON Poisson sampling
- [ ] Add to points distribution calculation
- [ ] Validate against historical data

---

### A5.2 Bonus Points Model v2.0

- [ ] Include DEFCON contribution in BPS
- [ ] Add possession / passing networks factor
- [ ] Improve bonus probability estimation

**Deliverable:** `lib/services/prediction/points/bonusV2.ts`

---

## A6. ML Dataset Generation

**Цель:** Экспорт обогащённых датасетов для 3 ML-моделей.

### A6.1 Minutes Dataset v3

| Feature Type | Examples                                                         |
| ------------ | ---------------------------------------------------------------- |
| Schedule     | rotation, DEFCON activity, travel distance, schedule engineering |
| Targets      | `y_start`, `y_60`                                                |

- [ ] Export script: `ml/scripts/prepare_minutes_v3.ts`
- [ ] Validation set separation
- [ ] Feature normalization

---

### A6.2 Attack Dataset v3

| Feature Type | Examples                                        |
| ------------ | ----------------------------------------------- |
| Offensive    | xThreat, xGChain, box touches, involvementScore |
| Context      | opponent block type                             |
| Targets      | `y_goals`, `y_assists`, `y_xG`, `y_xA`          |

- [ ] Export script: `ml/scripts/prepare_attack_v3.ts`

---

### A6.3 Defense Dataset (NEW!)

| Feature Type | Examples                                          |
| ------------ | ------------------------------------------------- |
| Context      | opponent style, role, zone, fatigue, possession % |
| Targets      | `y_defensive_actions`                             |

- [ ] Export script: `ml/scripts/prepare_defense_v1.ts`
- [ ] Create ML Defensive Contribution Model structure

---

## A7. ML Integration Layer (3-модульная структура)

**Цель:** Поддержка трёх ML-моделей с переключателем heuristic ⇆ ML.

### A7.1 MinutesModel

- [ ] Logistic Regression / LightGBM implementation
- [ ] Model training pipeline
- [ ] Model evaluation metrics

---

### A7.2 AttackModel

- [ ] XGBoost / LightGBM / Neural implementation
- [ ] Feature importance analysis
- [ ] Hyperparameter tuning

---

### A7.3 DefenseModel (NEW!)

- [ ] Predict expected defensive actions (λ_def_actions)
- [ ] Model architecture selection
- [ ] Integration with DEFCON calculator

---

### A7.4 Hybrid Engine Configuration

```typescript
if (USE_ML === true) {
  return useMLModels(features);
} else {
  return useHeuristicEngine(features);
}
```

- [ ] Per-model toggles: `USE_ML_MINUTES`, `USE_ML_ATTACK`, `USE_ML_DEFENSE`
- [ ] Fallback strategy on model failure
- [ ] A/B testing infrastructure

**Deliverable:** `lib/services/prediction/ml/hybridEngine.ts`

---

## A8. Simulation Layer v2.0 (Monte Carlo)

**Цель:** DEFCON integration в Monte Carlo симуляцию.

### A8.1 DEFCON in Monte Carlo

В симуляции (N = 10,000 сценариев):

- [ ] Minutes sampled
- [ ] xG/xA sampled (Poisson)
- [ ] **Defensive actions sampled (Poisson)** ← NEW
- [ ] Bonus rules sampled

---

### A8.2 Enhanced Output

- [ ] Distribution of points (mean, median, 95th percentile, floor)
- [ ] DEFCON contribution breakdown
- [ ] Haul probability with DEFCON
- [ ] Blank probability refined

**Deliverable:** `lib/services/prediction/simulation/simulatorV2.ts`

---

## 🎯 Definition of Done

### MVP Level (завершено)

- ✅ Clean architecture
- ✅ Basic features (trends, role, schedule)
- ✅ Minutes 2.0
- ✅ Attack 2.0
- ✅ Points Poisson v1

### Advanced Level (этот roadmap)

- [ ] DEFCON integration (ключевое изменение)
- [ ] Full defensive actions model
- [ ] Attack v3.0 (xThreat, xGChain, volatility)
- [ ] Minutes v3.0 (rotation fingerprint, injury trajectories)
- [ ] Full feature engineering pipeline
- [ ] Three ML models: minutes, attack, defense
- [ ] Configurable hybrid ML + heuristic engine
- [ ] Monte Carlo v2.0

### Elite Level (будущее)

- [ ] Full ML production models
- [ ] Real-time predictions
- [ ] Auto-retraining pipeline
- [ ] Multi-GW optimization

---

## 📁 Структура файлов (Target)

```
lib/services/prediction/
├── features/
│   ├── playerEnriched.ts      # A1.1
│   ├── teamEnriched.ts        # A1.2
│   └── scheduleAdvanced.ts    # A1.3
├── minutes/
│   ├── rotationPatterns.ts    # A2.1
│   └── injuryModelling.ts     # A2.2
├── attack/
│   ├── involvementV3.ts       # A3.1
│   ├── opponentStyle.ts       # A3.2
│   └── volatility.ts          # A3.3
├── defense/
│   ├── defconPoints.ts        # A4.1
│   ├── defensePredictor.ts    # A4.2
│   └── defconProfile.ts       # A4.3
├── points/
│   └── bonusV2.ts             # A5.2
├── simulation/
│   └── simulatorV2.ts         # A8
└── ml/
    ├── minutesModel.ts        # A7.1
    ├── attackModel.ts         # A7.2
    ├── defenseModel.ts        # A7.3
    └── hybridEngine.ts        # A7.4

ml/
├── data/
│   ├── minutes_v3_dataset.csv
│   ├── attack_v3_dataset.csv
│   └── defense_v1_dataset.csv
└── scripts/
    ├── prepare_minutes_v3.ts
    ├── prepare_attack_v3.ts
    └── prepare_defense_v1.ts
```

---

## 📅 Приоритеты реализации

1. **🔴 Critical:** A4 (DEFCON Integration) → A1.1 (Defensive Features)
2. **🟡 High:** A3 (Attack v3.0) → A2 (Minutes v3.0) → A5 (Points v2.5)
3. **🟢 Medium:** A6 (Datasets) → A7 (ML Integration) → A8 (Simulation v2.0)
