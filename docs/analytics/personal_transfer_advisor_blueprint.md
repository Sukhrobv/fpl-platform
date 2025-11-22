# FPL Personal Transfer Advisor Blueprint

Комплексная система персонализированных рекомендаций трансферов, интегрированная с вашим FPL аккаунтом. Эта система анализирует вашу текущую команду, предсказывает будущие очки, учитывает constraints (бюджет, структуру команды) и предлагает оптимальные трансферы.

## 0) Архитектура и источники данных

### 0.1 Персональные данные (из FPL API)

Endpoint: `/api/entry/{team_id}/`

- Current squad (15 игроков)
- Bank balance
- Free transfers available
- Active chips
- Total points, rank

Endpoint: `/api/entry/{team_id}/event/{gw}/picks/`

- Starting XI vs Bench
- Captain/Vice-captain
- Automatic subs
- Points per player

Endpoint: `/api/entry/{team_id}/transfers/`

- Transfer history
- In/Out prices
- Transfer costs

Endpoint: `/api/my-team/{team_id}/` (requires auth)

- Current selling prices
- Точный ITB (In The Bank)
- Chip availability

### 0.2 LiveFPL Integration

What LiveFPL provides:

- Live rank tracking during GW
- EO (Effective Ownership) в вашем ранге
- Template teams на вашем уровне
- Differential picks в топ-10k

Key metrics to extract:

```json
{
  "player_id": 123,
  "effective_ownership": {
    "overall": 45.2,
    "top_10k": 67.8,
    "your_rank_band": 52.3
  },
  "captaincy": {
    "overall_captain": 15.2,
    "top_10k_captain": 28.5
  },
  "transfer_trends": {
    "transfers_in_24h": 15234,
    "transfers_out_24h": 8921,
    "net_trend": +6313
  }
}
```

### 0.3 External Data (уже есть в системе)

- xPts predictions (из вашего blueprint)
- Understat metrics
- Fixture difficulty
- Team form

## 1) Squad State Analysis Module

### 1.1 Current Squad Representation

```python
@dataclass
class SquadState:
    players: List[PlayerInSquad]  # 15 игроков
    bank: float                    # ITB
    free_transfers: int            # 1 или 2
    team_value: float              # общая стоимость

    # Структурные constraints
    gk_count: int = 2
    def_count: int = 5
    mid_count: int = 5
    fwd_count: int = 3

    # Per-team limits
    team_player_counts: Dict[int, int]  # max 3 per team

    # Active chips
    wildcard_available: bool
    free_hit_available: bool
    bench_boost_available: bool
    triple_captain_available: bool

@dataclass
class PlayerInSquad:
    id: int
    name: str
    position: Position
    team_id: int

    # Financial
    current_price: float    # текущая цена в FPL
    purchase_price: float   # цена покупки
    selling_price: float    # цена продажи

    # Performance
    total_points: int
    form: float
    xPts_next: float        # из prediction engine
    xPts_next5: List[float] # следующие 5 GW

    # Ownership context
    ownership_overall: float
    ownership_top10k: float
    eo_your_rank: float     # effective ownership в вашем rank band

    # Status
    status: str            # 'a', 'd', 'i', 'u'
    chance_of_playing: Optional[int]
    news: Optional[str]
```

### 1.2 Squad Health Metrics

**Форма команды (последние 5 GW)**

```python
def calculate_squad_form(squad: SquadState, history: List[GWHistory]) -> SquadFormMetrics:
    """
    Анализ формы команды за последние 5 GW
    """
    last_5_gws = history[-5:]

    return SquadFormMetrics(
        avg_points_per_gw=mean([gw.total_points for gw in last_5_gws]),
        points_vs_average=squad_points - avg_manager_points,  # vs среднего менеджера

        # Bench performance (теряете ли очки на скамейке?)
        avg_bench_points=mean([gw.bench_points for gw in last_5_gws]),

        # Captain performance
        captain_hit_rate=sum([1 for gw in last_5_gws if gw.captain_returned]) / 5,
        captain_roi=sum([gw.captain_points for gw in last_5_gws]) / (5 * avg_captain_points),

        # Transfer efficiency
        transfer_roi=points_gained_from_transfers / points_lost_to_hits
    )
```

**Проблемные зоны (Problem Detection)**

```python
def detect_squad_problems(squad: SquadState) -> List[SquadProblem]:
    """
    Выявление проблем в составе
    """
    problems = []

    # 1. Dead wood (игроки не играющие)
    for p in squad.players:
        if p.status != 'a' or p.chance_of_playing < 50:
            problems.append(SquadProblem(
                type="UNAVAILABLE_PLAYER",
                player=p,
                severity="HIGH" if p in starting_xi else "MEDIUM",
                description=f"{p.name} вероятно не сыграет"
            ))

        # Низкая минутность (< 45 min avg last 5)
        if p.avg_minutes_last5 < 45 and p.status == 'a':
            problems.append(SquadProblem(
                type="LOW_MINUTES",
                player=p,
                severity="MEDIUM",
                description=f"{p.name} играет мало (avg {p.avg_minutes_last5}m)"
            ))

    # 2. Poor fixtures (bad run ahead)
    for p in squad.players:
        fixture_difficulty = mean([f.fdr for f in p.next_5_fixtures])
        if fixture_difficulty > 4.0:  # tough fixtures
            problems.append(SquadProblem(
                type="POOR_FIXTURES",
                player=p,
                severity="LOW",
                description=f"{p.name} имеет сложный календарь (FDR {fixture_difficulty:.1f})"
            ))

    # 3. Budget stuck in bench (дорогие игроки на скамейке)
    bench_value = sum([p.selling_price for p in squad.bench])
    if bench_value > 20.0:  # > £20m на скамейке
        problems.append(SquadProblem(
            type="EXPENSIVE_BENCH",
            severity="MEDIUM",
            description=f"£{bench_value}m застряло на скамейке"
        ))

    # 4. Ownership risks (сильно отличаетесь от шаблона в вашем ранге)
    template = get_template_team(your_rank_band)
    essential_missing = [
        p for p in template
        if p.eo_your_rank > 60 and p not in squad.players
    ]
    if essential_missing:
        problems.append(SquadProblem(
            type="MISSING_ESSENTIAL",
            severity="HIGH",
            description=f"Не хватает {len(essential_missing)} популярных игроков"
        ))

    return sorted(problems, key=lambda x: priority_score(x), reverse=True)
```

## 2) Transfer Optimization Engine
### 2.1 Constraints & Rules

```python
@dataclass
class TransferConstraints:
    # Budget
    max_cost: float  # selling_price + bank
    
    # Structure (must maintain 2-5-5-3)
    required_positions: Dict[Position, int]
    
    # Team limits (max 3 per team)
    current_team_counts: Dict[int, int]
    
    # Transfer limits
    free_transfers: int
    max_hits: int = 2  # разумный лимит на хиты (-4 за каждый доп. трансфер)
    
    # Special constraints
    must_keep: Set[int] = field(default_factory=set)  # players you want to keep
    must_remove: Set[int] = field(default_factory=set)  # flagged players
```

### 2.2 Transfer Scoring Function
Каждый potential transfer оценивается по нескольким критериям:
```python
def score_transfer(
    player_out: PlayerInSquad,
    player_in: PlayerCandidate,
    horizon: int = 5,  # оцениваем следующие 5 GW
    context: SquadContext
) -> TransferScore:
    """
    Комплексная оценка трансфера
    """
    
    # === 1. PERFORMANCE DELTA ===
    # Разница в predicted points (следующие N GW)
    xpts_delta = sum(player_in.xPts_next_n) - sum(player_out.xPts_next_n)
    
    # Adjust for transfer cost (-4 if using hit)
    if context.free_transfers == 0:
        xpts_delta -= 4
    
    # === 2. OWNERSHIP & DIFFERENTIAL STRATEGY ===
    ownership_context = calculate_ownership_impact(
        player_out, player_in, context.your_rank, context.strategy
    )
    
    # Strategy weights (зависит от вашей цели)
    if context.strategy == "TEMPLATE_SAFETY":
        # Минимизировать ownership risk
        ownership_score = (
            +2.0 * (player_in.eo_your_rank - 50) / 50  # reward template picks
            -1.5 * (player_out.eo_your_rank - 50) / 50 # punish selling template
        )
    
    elif context.strategy == "DIFFERENTIAL_CHASE":
        # Максимизировать differential upside
        ownership_score = (
            +3.0 * max(0, 30 - player_in.eo_your_rank) / 30  # reward low EO
            -0.5 * (50 - player_out.eo_your_rank) / 50       # ok to sell template if needed
        )
    
    else:  # BALANCED
        # Умеренный подход
        ownership_score = (
            +1.0 * (40 - abs(player_in.eo_your_rank - 40)) / 40
        )
    
    # === 3. FIXTURE SWING ===
    # Насколько улучшается календарь?
    fixture_delta = (
        calculate_fixture_difficulty(player_in.next_5_fixtures) -
        calculate_fixture_difficulty(player_out.next_5_fixtures)
    )
    fixture_score = -2.0 * fixture_delta  # negative FDR is good
    
    # === 4. TEAM BALANCE ===
    # Проверяем не создаём ли дисбаланс (например 3 игрока из одной команды)
    balance_penalty = 0.0
    if would_exceed_team_limit(player_in, context.squad):
        balance_penalty = -10.0  # жёсткий constraint
    
    # Penalty за излишнюю концентрацию в одной команде даже если в пределах 3
    team_concentration = calculate_team_concentration(context.squad, player_in)
    if team_concentration > 0.25:  # > 25% squad value в одной команде
        balance_penalty -= 2.0
    
    # === 5. PRICE CHANGE RISK ===
    # Учитываем вероятность price rise/fall
    price_momentum_score = (
        +1.5 * player_in.price_rise_probability    # reward likely risers
        -1.0 * player_out.price_fall_probability   # avoid selling before drop
    )
    
    # === 6. FORM & MOMENTUM ===
    # Recent form vs season average
    form_score = (
        +1.0 * (player_in.form_last5 - player_in.form_season) / player_in.form_season
        -0.8 * (player_out.form_last5 - player_out.form_season) / player_out.form_season
    )
    
    # === 7. FLEXIBILITY ===
    # Оставляем ли мы возможность для будущих трансферов?
    flexibility_score = calculate_squad_flexibility(
        context.squad, player_out, player_in
    )
    # Factors: budget left, positions covered, premium vs budget balance
    
    # === TOTAL SCORE ===
    total_score = (
        xpts_delta * 1.0 +           # главный фактор
        ownership_score * 0.8 +       # ownership context
        fixture_score * 0.5 +         # fixture swing
        balance_penalty +             # hard constraint
        price_momentum_score * 0.3 +  # price changes
        form_score * 0.4 +            # form momentum
        flexibility_score * 0.3       # squad flexibility
    )
    
    return TransferScore(
        total=total_score,
        xpts_delta=xpts_delta,
        ownership_impact=ownership_score,
        fixture_impact=fixture_score,
        balance_penalty=balance_penalty,
        price_impact=price_momentum_score,
        form_impact=form_score,
        flexibility=flexibility_score,
        
        # Confidence interval
        confidence=calculate_confidence(player_in, player_out),
        
        # Reasoning (для UI)
        explanation=generate_explanation(...)
    )
```

### 2.3 Multi-Transfer Optimization
Для планирования нескольких трансферов (например используя 2 FT или wildcard):

```python
def find_optimal_multi_transfer(
    squad: SquadState,
    num_transfers: int,
    horizon: int = 5,
    strategy: Strategy = "BALANCED"
) -> List[TransferPlan]:
    """
    Ищем оптимальную комбинацию из N трансферов
    """
    
    if num_transfers == 1:
        # Simple case: single best transfer
        return find_best_single_transfer(squad, horizon, strategy)
    
    # Multi-transfer: combinatorial optimization
    # Используем beam search чтобы не перебирать все комбинации
    
    beam_width = 50  # топ-50 кандидатов на каждом шаге
    
    # Start with current squad
    beam = [squad]
    
    for t in range(num_transfers):
        new_beam = []
        
        for squad_state in beam:
            # Generate all possible single transfers from this state
            candidates = generate_transfer_candidates(
                squad_state, 
                constraints=get_constraints(squad_state, t)
            )
            
            # Score each transfer
            scored = [
                (apply_transfer(squad_state, transfer), 
                 score_transfer(transfer, horizon, strategy))
                for transfer in candidates
            ]
            
            # Add top K to new beam
            new_beam.extend(sorted(scored, key=lambda x: x[1], reverse=True)[:beam_width])
        
        # Keep only top beam_width states
        beam = [s for s, score in sorted(new_beam, key=lambda x: x[1], reverse=True)[:beam_width]]
    
    # Return top N complete transfer plans
    return [
        TransferPlan(
            transfers=reconstruct_transfers(squad, final_squad),
            final_squad=final_squad,
            total_score=score,
            xpts_improvement=calculate_xpts_improvement(squad, final_squad, horizon),
            cost=calculate_cost(squad, final_squad)
        )
        for final_squad, score in sorted(beam, key=lambda x: x[1], reverse=True)[:10]
    ]
```

## 3) Персонализированные стратегии
### 3.1 Rank-Based Strategy Adjustment
Ваша стратегия должна меняться в зависимости от текущего ранга и целей:

```python
def determine_optimal_strategy(
    current_rank: int,
    target_rank: int,
    gameweeks_remaining: int
) -> StrategyProfile:
    """
    Определяем агрессивность стратегии
    """
    
    rank_gap = current_rank - target_rank
    
    if rank_gap > 100000 and gameweeks_remaining < 10:
        # Нужны дифференциалы
        return StrategyProfile(
            name="AGGRESSIVE_DIFFERENTIAL",
            ownership_threshold=30,      # ищем игроков с EO < 30%
            hit_tolerance=2,             # готовы взять -8
            fixture_weight=1.5,          # больше внимания на fixtures
            form_weight=1.2,             # hot hands bias
            risk_tolerance="HIGH"
        )
    
    elif current_rank < 100000:
        # Защищаем топ
        return StrategyProfile(
            name="TEMPLATE_SAFETY",
            ownership_threshold=60,      # держим template (EO > 60%)
            hit_tolerance=0.5,           # избегаем хитов
            fixture_weight=0.8,
            form_weight=1.0,
            risk_tolerance="LOW"
        )
    
    else:
        # Balanced approach
        return StrategyProfile(
            name="BALANCED",
            ownership_threshold=45,
            hit_tolerance=1,
            fixture_weight=1.0,
            form_weight=1.0,
            risk_tolerance="MEDIUM"
        )
```

### 3.2 Situational Recommendations

```python
@dataclass
class SituationalContext:
    """
    Контекст для специальных ситуаций
    """
    # Timing
    is_wildcard_week: bool
    is_dgw: bool           # double gameweek
    is_bgw: bool           # blank gameweek
    deadline_hours: float  # часов до дедлайна
    
    # Events
    price_changes_tonight: List[PriceChange]
    injury_news_today: List[InjuryUpdate]
    
    # Competition
    mini_league_rivals: List[RivalTeam]
    
def generate_situational_advice(
    squad: SquadState,
    context: SituationalContext
) -> List[Advice]:
    """
    Специфичные рекомендации под ситуацию
    """
    advice = []
    
    # === PRICE CHANGES ===
    if context.deadline_hours > 24:
        # Есть время среагировать на price changes
        for pc in context.price_changes_tonight:
            if pc.player in squad.players and pc.change == -0.1:
                # Ваш игрок упадёт в цене
                advice.append(Advice(
                    type="URGENT",
                    priority="HIGH",
                    message=f"⚠️ {pc.player.name} упадёт в цене сегодня вечером. "
                            f"Sell value: £{pc.player.selling_price}m → £{pc.player.selling_price - 0.1}m",
                    action="CONSIDER_SELLING",
                    player=pc.player
                ))
            
            if pc.change == +0.1 and pc.player.id in get_watchlist(squad):
                # Игрок из watchlist подорожает
                advice.append(Advice(
                    type="OPPORTUNITY",
                    priority="MEDIUM",
                    message=f"💰 {pc.player.name} подорожает сегодня. "
                            f"Купить сейчас за £{pc.player.current_price}m?",
                    action="CONSIDER_BUYING",
                    player=pc.player
                ))
    
    # === DOUBLE GAMEWEEK ===
    if context.is_dgw:
        dgw_enablers = find_dgw_players_not_in_squad(squad, context.dgw_teams)
        advice.append(Advice(
            type="STRATEGIC",
            priority="HIGH",
            message=f"🔄 DGW ahead! {len(dgw_enablers)} игроков с 2 матчами не в вашей команде",
            action="PLAN_DGW_TRANSFERS",
            suggestions=dgw_enablers[:5]
        ))
        
        # Chip recommendation
        if squad.bench_boost_available:
            bench_dgw_count = sum([1 for p in squad.bench if p.team_id in context.dgw_teams])
            if bench_dgw_count >= 3:
                advice.append(Advice(
                    type="CHIP",
                    priority="HIGH",
                    message=f"🎯 {bench_dgw_count} игроков на скамейке имеют DGW. "
                            f"Bench Boost может принести ~{estimate_bb_points()}pts",
                    action="CONSIDER_BENCH_BOOST"
                ))
    
    # === RIVAL TRACKING ===
    for rival in context.mini_league_rivals:
        differential = find_differentials_vs_rival(squad, rival.squad)
        if differential.risk_exposure > 10:  # > 10pts риск
            advice.append(Advice(
                type="COMPETITION",
                priority="MEDIUM",
                message=f"⚔️ У {rival.name} есть {differential.player.name} (EO {differential.player.eo}%), "
                        f"у вас нет. Риск: {differential.risk_exposure}pts",
                action="COVER_DIFFERENTIAL",
                player=differential.player
            ))
    
    # === INJURY NEWS ===
    for injury in context.injury_news_today:
        if injury.player in squad.players:
            advice.append(Advice(
                type="URGENT",
                priority="CRITICAL" if injury.severity == "ruled_out" else "HIGH",
                message=f"🚑 {injury.player.name}: {injury.news}",
                action="IMMEDIATE_TRANSFER" if injury.severity == "ruled_out" else "MONITOR",
                player=injury.player
            ))
    
    return sorted(advice, key=lambda a: priority_to_int(a.priority), reverse=True)
```

## 4) LiveFPL Integration Specifics

### 4.1 Data Points to Extract
```python
class LiveFPLIntegration:
    """
    Интеграция с LiveFPL для real-time контекста
    """
    
    def get_effective_ownership(self, player_id: int, rank_band: str) -> EOData:
        """
        EO в вашем rank band (например top-100k, 100k-500k, etc.)
        """
        return EOData(
            overall=self._fetch("player", player_id, "ownership", "overall"),
            top_10k=self._fetch("player", player_id, "ownership", "top_10k"),
            rank_band=self._fetch("player", player_id, "ownership", rank_band),
            
            # Тренды
            eo_change_24h=calculate_eo_trend(player_id, hours=24),
            eo_change_week=calculate_eo_trend(player_id, hours=168)
        )
    
    def get_template_comparison(self, your_squad: SquadState, rank: int) -> TemplateComparison:
        """
        Сравнение с template командой на вашем уровне
        """
        template = self._fetch_template(get_rank_band(rank))
        
        return TemplateComparison(
            template_players=template.players,
            
            # Ваши отличия
            players_you_have_template_lacks=[
                p for p in your_squad.players if p not in template.players
            ],
            template_players_you_lack=[
                p for p in template.players if p not in your_squad.players
            ],
            
            # Ownership risk score
            ownership_risk=calculate_ownership_risk(your_squad, template),
            
            # Differential potential
            differential_upside=calculate_differential_upside(your_squad, template)
        )
    
    def get_transfer_trends(self, horizon: str = "24h") -> List[TransferTrend]:
        """
        Trending transfers в вашем rank band
        """
        return [
            TransferTrend(
                player_in=player,
                net_transfers=player.transfers_in - player.transfers_out,
                velocity=calculate_velocity(player, horizon),
                
                # Почему trending?
                reasons=infer_reasons(player)  # e.g. ["good fixtures", "price rise", "form"]
            )
            for player in self._fetch_trending(rank_band, horizon)
        ]
    
    def get_captain_picks(self, gw: int, rank_band: str) -> CaptainStats:
        """
        Популярные капитаны в вашем rank band
        """
        return CaptainStats(
            top_5_captains=[
                (player, captaincy_percentage)
                for player, pct in self._fetch_captains(gw, rank_band)[:5]
            ],
            
            # Differential captains (< 5% but high xPts)
            differential_captains=find_differential_captains(gw, rank_band),
            
            # Your current captain comparison
            your_captain_eo=get_captain_eo(your_captain, rank_band)
        )
```

### 4.2 Using LiveFPL for Recommendations
```python
def enhance_transfer_recommendation_with_livefpl(
    base_recommendation: TransferPlan,
    livefpl: LiveFPLIntegration,
    your_rank: int
) -> EnhancedRecommendation:
    """
    Обогащаем рекомендацию данными LiveFPL
    """
    
    rank_band = get_rank_band(your_rank)
    
    for transfer in base_recommendation.transfers:
        player_in = transfer.player_in
        player_out = transfer.player_out
        
        # === OWNERSHIP CONTEXT ===
        eo_in = livefpl.get_effective_ownership(player_in.id, rank_band)
        eo_out = livefpl.get_effective_ownership(player_out.id, rank_band)
        
        transfer.ownership_context = OwnershipContext(
            player_in_eo=eo_in.rank_band,
            player_out_eo=eo_out.rank_band,
            
            # Интерпретация
            ownership_move=(
                "TEMPLATE" if eo_in.rank_band > 50 else
                "DIFFERENTIAL" if eo_in.rank_band < 20 else
                "BALANCED"
            ),
            
            # Momentum
            player_in_trending="UP" if eo_in.eo_change_24h > 2 else "DOWN" if eo_in.eo_change_24h < -2 else "STABLE",
            
            # Risk
            ownership_risk=abs(eo_in.rank_band - eo_out.rank_band) / 100  # normalized risk
        )
        
        # === TEMPLATE COMPARISON ===
        template = livefpl.get_template_comparison(your_squad, your_rank)
        
        if player_in in template.template_players_you_lack:
            transfer.template_flag = "FILLING_GAP"  # buying missing template player
        elif player_in not in template.template_players:
            transfer.template_flag = "DIFFERENTIAL"  # going against template
        
        # === CROWD WISDOM ===
        trends = livefpl.get_transfer_trends("24h")
        matching_trend = next((t for t in trends if t.player_in.id == player_in.id), None)
        
        if matching_trend:
            transfer.crowd_signal = CrowdSignal(
                is_trending=True,
                net_transfers=matching_trend.net_transfers,
                velocity=matching_trend.velocity,
                reasons=matching_trend.reasons,
                
                # Interpretation
                message=f"🔥 Trending: {matching_trend.net_transfers:+,} transfers in last 24h"
            )
    
    return EnhancedRecommendation(
        base_plan=base_recommendation,
        livefpl_context=...,
        confidence_adjustment=calculate_confidence_boost(...)
    )
```

## 5) UI/UX Recommendations Display
### 5.1 Recommendation Card Structure

```python
@dataclass
class TransferRecommendationCard:
    """
    Как показывать рекомендацию в UI
    """
    
    # === HEADER ===
    title: str  # e.g. "Suggested Transfer #1"
    priority: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    urgency: Optional[str]  # e.g. "Before price change tonight"
    
    # === THE TRANSFER ===
    player_out: PlayerDisplay
    player_in: PlayerDisplay
    cost: float  # -4 if hit, 0 if free
    
    # === REASONING (expandable sections) ===
    primary_reason: str  # main 1-sentence reason
    
    detailed_reasoning: DetailedReasoning = {
        "performance": {
            "label": "📈 Performance",
            "xpts_delta": +2.5,  # expected points gain over next 5 GW
            "explanation": "Salah projects 35.2 pts vs Sterling's 28.1 over next 5 GW"
        },
        "fixtures": {
            "label": "📅 Fixtures",
            "fdr_delta": -1.2,
            "explanation": "Liverpool: SOU(A), NEW(H), EVE(A) vs Man City: ARS(A), LIV(H), TOT(A)"
        },
        "ownership": {
            "label": "👥 Ownership",
            "eo_delta": +15.2,
            "explanation": "Salah 67% EO in top-100k vs Sterling 32% → reducing differential risk",
            "badge": "TEMPLATE" if eo_in > 50 else "DIFFERENTIAL"
        },
        "form": {
            "label": "🔥 Form",
            "form_delta": +1.8,
            "explanation": "Salah: 4 returns in last 5 vs Sterling: 1 return in last 5"
        },
        "price": {
            "label": "💰 Price",
            "price_change_risk": "Salah likely to rise (95% prob), Sterling stable",
            "budget_impact": "Uses £1.2m extra budget"
        }
    }
    
    # === CONFIDENCE ===
    confidence: float  # 0-100
    confidence_factors: List[str]  # ["High xPts gap", "Strong fixtures", "Template pick"]
    
    # === ALTERNATIVES ===
    alternatives: List[AlternativeTransfer]  # top 2-3 alternatives with similar score
    
    # === ACTION BUTTONS ===
    actions: List[Action] = [
        Action("ACCEPT", "Make this transfer"),
        Action("WATCHLIST", "Add to watchlist"),
        Action("ALTERNATIVES", "See alternatives"),
        Action("DISMISS", "Not interested")
    ]
```

### 5.2 Interactive Planning Tool

```python
class TransferPlannerUI:
    """
    Интерактивный планировщик трансферов
    """
    
    def show_planning_horizon(self, squad: SquadState, weeks: int = 5):
        """
        Показываем план на N недель вперёд
        """
        
        # Week-by-week view
        for gw in range(current_gw, current_gw + weeks):
            fixtures = get_fixtures(gw)
            
            display_gameweek_panel(
                gw=gw,
                
                # Current squad projected points
                current_squad_xpts=sum([p.xPts[gw] for p in squad.players]),
                
                # Potential with transfers
                with_transfers_xpts=calculate_after_transfers(squad, recommended_plan, gw),
                
                # Highlights
                best_fixtures=[p for p in squad if p.fixture_difficulty[gw] < 2.5],
                worst_fixtures=[p for p in squad if p.fixture_difficulty[gw] > 4.0],
                
                # Chips
                optimal_chip=suggest_chip_for_gw(gw, squad)
            )
    
    def show_what_if_tool(self, squad: SquadState):
        """
        "What if" анализ: что если сделать этот трансфер?
        """
        
        # User selects player to remove
        selected_out = ui.select_player(squad.players)
        
        # Show all valid replacements ranked
        candidates = find_valid_replacements(
            selected_out,
            budget=squad.bank + selected_out.selling_price,
            constraints=get_constraints(squad)
        )
        
        for candidate in candidates[:20]:
            display_comparison_card(
                player_out=selected_out,
                player_in=candidate,
                
                # Impact metrics
                xpts_impact=calculate_xpts_delta(selected_out, candidate, horizon=5),
                ownership_impact=calculate_ownership_delta(selected_out, candidate),
                fixture_impact=compare_fixtures(selected_out, candidate),
                
                # Overall recommendation
                score=score_transfer(selected_out, candidate),
                verdict="RECOMMENDED" if score > 5 else "NEUTRAL" if score > 0 else "NOT_RECOMMENDED"
            )
```

## 6) Advanced Features
### 6.1 Wildcard Optimizer

```python
def optimize_wildcard(
    current_squad: SquadState,
    budget: float,
    horizon: int = 10,  # optimize for next 10 GW
    strategy: Strategy = "BALANCED"
) -> WildcardPlan:
    """
    Полная оптимизация команды при активации wildcard
    """
    
    # Constraints
    constraints = WildcardConstraints(
        total_budget=budget,
        positions={"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
        max_per_team=3,
        
        # Strategy-specific constraints
        min_template_players=8 if strategy == "TEMPLATE_SAFETY" else 5,
        max_premium_players=5,  # players > £10m
        min_enablers=3,         # cheap players £4.5-5.5m
        
        # Must-haves (optional)
        locked_players=get_locked_players()  # players you definitely want
    )
    
    # Optimization objectives (weighted)
    objectives = [
        ("total_xpts", 1.0, sum([p.xPts_next_n for p in squad])),  # maximize total xPts
        ("balance", 0.3, calculate_squad_balance(squad)),          # balanced squad structure
        ("flexibility", 0.2, calculate_flexibility(squad)),        # future transfer options
        ("ownership_safety", 0.4 if strategy == "TEMPLATE_SAFETY" else 0.1, ...)  # template coverage
    ]
    
    # Use genetic algorithm or integer programming
    optimal_squad = run_optimization(
        search_space=all_available_players,
        constraints=constraints,
        objectives=objectives,
        algorithm="genetic",  # or "milp" for exact solution
        time_limit=30  # seconds
    )
    
    return WildcardPlan(
        new_squad=optimal_squad,
        transfers_out=current_squad.players,
        transfers_in=optimal_squad.players,
        
        # Analysis
        xpts_improvement=calculate_improvement(current_squad, optimal_squad, horizon),
        ownership_profile=analyze_ownership(optimal_squad),
        fixture_strength=analyze_fixtures(optimal_squad, horizon),
        flexibility_score=calculate_flexibility(optimal_squad),
        
        # Alternatives
        alternative_squads=get_top_n_squads(n=5)  # show top 5 different solutions
    )
```

### 6.2 Chip Strategy Planner

```python
def plan_chip_usage(
    squad: SquadState,
    remaining_gws: List[int],
    available_chips: List[Chip]
) -> ChipPlan:
    """
    Оптимальное планирование использования чипов
    """
    
    chip_opportunities = []
    
    for chip in available_chips:
        if chip == "WILDCARD":
            # Identify best GW for wildcard
            wc_scores = []
            for gw in remaining_gws:
                # Value = (potential team improvement) + (future fixture quality)
                value = (
                    calculate_wildcard_value(squad, gw) +
                    calculate_future_fixture_value(gw, horizon=10)
                )
                wc_scores.append((gw, value))
            
            best_gw, value = max(wc_scores, key=lambda x: x[1])
            chip_opportunities.append(ChipOpportunity(
                chip="WILDCARD",
                recommended_gw=best_gw,
                value=value,
                reasoning=f"Squad needs {identify_issues(squad)}. "
                         f"GW{best_gw} allows rebuilding before {identify_fixture_swing(best_gw)}"
            ))
        
        elif chip == "BENCH_BOOST":
            # Find DGW or GW where bench has good fixtures
            bb_scores = []
            for gw in remaining_gws:
                # Value = expected bench points in this GW
                bench_xpts = sum([p.xPts[gw] for p in squad.bench])
                
                # Bonus if DGW
                if is_dgw(gw):
                    dgw_count = sum([1 for p in squad.bench if p.has_dgw[gw]])
                    bench_xpts *= (1 + dgw_count * 0.5)
                
                bb_scores.append((gw, bench_xpts))
            
            best_gw, value = max(bb_scores, key=lambda x: x[1])
            chip_opportunities.append(ChipOpportunity(
                chip="BENCH_BOOST",
                recommended_gw=best_gw,
                value=value,
                reasoning=f"Bench projects {value:.1f} pts in GW{best_gw}"
            ))
        
        elif chip == "TRIPLE_CAPTAIN":
            # Find GW with best captain option (ideally DGW)
            tc_scores = []
            for gw in remaining_gws:
                # Best captain xPts this GW
                best_captain = max(squad.players, key=lambda p: p.xPts[gw])
                value = best_captain.xPts[gw]
                
                # Bonus for DGW
                if is_dgw(gw) and best_captain.has_dgw[gw]:
                    value *= 2.0  # roughly doubles value in DGW
                
                tc_scores.append((gw, value, best_captain))
            
            best_gw, value, player = max(tc_scores, key=lambda x: x[1])
            chip_opportunities.append(ChipOpportunity(
                chip="TRIPLE_CAPTAIN",
                recommended_gw=best_gw,
                value=value * 2,  # TC gives 2x multiplier
                reasoning=f"Captain {player.name} (xPts: {value:.1f}) in GW{best_gw}"
            ))
        
        elif chip == "FREE_HIT":
            # Find BGW or GW where many of your players blank
            fh_scores = []
            for gw in remaining_gws:
                # Value = (full squad potential) - (current squad potential)
                best_possible_11 = optimize_single_gw_team(gw, budget=100)  # unlimited budget
                current_11_xpts = sum([p.xPts[gw] for p in squad.starting_11])
                
                value = sum([p.xPts[gw] for p in best_possible_11]) - current_11_xpts
                
                fh_scores.append((gw, value))
            
            best_gw, value = max(fh_scores, key=lambda x: x[1])
            chip_opportunities.append(ChipOpportunity(
                chip="FREE_HIT",
                recommended_gw=best_gw,
                value=value,
                reasoning=f"Potential gain of {value:.1f} pts vs current squad in GW{best_gw}"
            ))
    
    return ChipPlan(
        opportunities=sorted(chip_opportunities, key=lambda x: x.value, reverse=True),
        
        # Recommended sequence
        optimal_sequence=determine_optimal_sequence(chip_opportunities),
        
        # Caveats
        warnings=generate_chip_warnings(chip_opportunities)
    )
```

### 6.3 Mini-League Analyzer
```python
def analyze_mini_league(
    your_squad: SquadState,
    league_id: int
) -> MiniLeagueInsights:
    """
    Анализ вашей мини-лиги для targeted strategy
    """
    
    # Fetch all teams in league
    rivals = fetch_league_teams(league_id)
    
    # Overall standings
    your_position = get_your_position(rivals, your_squad)
    
    # === DIFFERENTIAL ANALYSIS ===
    # Players you have that rivals don't
    your_differentials = []
    for player in your_squad.players:
        ownership_in_league = sum([1 for r in rivals if player in r.squad]) / len(rivals)
        if ownership_in_league < 0.3:  # < 30% in league
            your_differentials.append(DifferentialPlayer(
                player=player,
                league_ownership=ownership_in_league,
                global_ownership=player.ownership_overall,
                potential_gain=player.xPts_next5  # if he hauls, you gain on rivals
            ))
    
    # Players rivals have that you don't
    rival_template = build_league_template(rivals)
    missing_from_template = [
        p for p in rival_template 
        if p not in your_squad.players and p.league_ownership > 0.5
    ]
    
    # === HEAD-TO-HEAD PROJECTIONS ===
    h2h_projections = []
    for rival in rivals[:5]:  # top 5 closest rivals
        projection = project_head_to_head(
            your_squad, 
            rival.squad, 
            horizon=5
        )
        h2h_projections.append(H2HProjection(
            rival=rival,
            expected_points_delta=projection.your_xpts - projection.rival_xpts,
            key_differentials=identify_key_differentials(your_squad, rival.squad),
            recommendation="ATTACK" if projection.your_xpts > projection.rival_xpts else "DEFEND"
        ))
    
    # === STRATEGIC RECOMMENDATIONS ===
    if your_position <= 3:
        strategy = "DEFEND_LEAD"
        recommendations = [
            "✅ Stick to template to minimize risk",
            "✅ Avoid hits unless emergency",
            "✅ Cover high-ownership players from rivals"
        ]
    elif your_position > len(rivals) * 0.7:
        strategy = "CHASE_PACK"
        recommendations = [
            "🎯 Go for differentials with high ceiling",
            "🎯 Consider hits for explosive picks",
            "🎯 Target players rivals are missing"
        ]
    else:
        strategy = "BALANCED"
        recommendations = [
            "⚖️ Mix of template safety + selective differentials",
            "⚖️ Take calculated risks on form players"
        ]
    
    return MiniLeagueInsights(
        your_position=your_position,
        total_teams=len(rivals),
        points_to_leader=calculate_gap_to_leader(your_squad, rivals),
        
        your_differentials=your_differentials,
        missing_template_players=missing_from_template,
        
        h2h_projections=h2h_projections,
        
        strategy=strategy,
        recommendations=recommendations,
        
        # Visualizations
        ownership_comparison_chart=generate_ownership_chart(your_squad, rival_template),
        points_projection_chart=generate_projection_chart(your_squad, rivals, horizon=5)
    )
```

## 7) Implementation Pseudocode
### 7.1 Main Pipeline

```python
async def generate_personal_recommendations(user_id: int) -> PersonalRecommendations:
    """
    Main entry point для персональных рекомендаций
    """
    
    # === 1. FETCH PERSONAL DATA ===
    squad_state = await fetch_squad_state(user_id)
    fpl_history = await fetch_fpl_history(user_id)
    current_rank = await fetch_current_rank(user_id)
    
    # === 2. FETCH EXTERNAL CONTEXT ===
    livefpl = LiveFPLIntegration()
    template = await livefpl.get_template_comparison(squad_state, current_rank)
    transfer_trends = await livefpl.get_transfer_trends(get_rank_band(current_rank))
    
    # === 3. ANALYZE SQUAD ===
    squad_health = calculate_squad_health(squad_state, fpl_history)
    problems = detect_squad_problems(squad_state)
    
    # === 4. DETERMINE STRATEGY ===
    target_rank = get_user_target_rank(user_id)  # user setting
    gws_remaining = 38 - current_gameweek()
    strategy = determine_optimal_strategy(current_rank, target_rank, gws_remaining)
    
    # === 5. GENERATE TRANSFER OPTIONS ===
    horizon = 5  # next 5 gameweeks
    
    # Single transfer options
    single_transfers = find_optimal_multi_transfer(
        squad=squad_state,
        num_transfers=1,
        horizon=horizon,
        strategy=strategy
    )
    
    # If have 2 FT, also consider double transfers
    double_transfers = []
    if squad_state.free_transfers >= 2:
        double_transfers = find_optimal_multi_transfer(
            squad=squad_state,
            num_transfers=2,
            horizon=horizon,
            strategy=strategy
        )
    
    # === 6. ENHANCE WITH LIVEFPL DATA ===
    enhanced_single = [
        enhance_transfer_recommendation_with_livefpl(t, livefpl, current_rank)
        for t in single_transfers[:5]
    ]
    
    enhanced_double = [
        enhance_transfer_recommendation_with_livefpl(t, livefpl, current_rank)
        for t in double_transfers[:3]
    ]
    
    # === 7. SITUATIONAL ADVICE ===
    situational_context = SituationalContext(
        is_wildcard_week=False,
        is_dgw=check_if_dgw(current_gameweek() + 1),
        deadline_hours=calculate_hours_to_deadline(),
        price_changes_tonight=fetch_predicted_price_changes(),
        injury_news_today=fetch_today_injury_news()
    )
    
    situational_advice = generate_situational_advice(squad_state, situational_context)
    
    # === 8. CHIP PLANNING ===
    available_chips = get_available_chips(user_id)
    chip_plan = plan_chip_usage(
        squad_state,
        remaining_gws=list(range(current_gameweek(), 39)),
        available_chips=available_chips
    )
    
    # === 9. MINI-LEAGUE ANALYSIS (if user has leagues) ===
    mini_league_insights = []
    user_leagues = fetch_user_leagues(user_id)
    for league in user_leagues[:3]:  # top 3 leagues
        insights = analyze_mini_league(squad_state, league.id)
        mini_league_insights.append(insights)
    
    # === 10. ASSEMBLE RESPONSE ===
    return PersonalRecommendations(
        # Squad analysis
        squad_health=squad_health,
        problems=problems,
        
        # Strategy
        current_strategy=strategy,
        
        # Transfer recommendations
        single_transfer_options=enhanced_single,
        double_transfer_options=enhanced_double,
        # Situational advice
        urgent_advice=situational_advice,
        
        # Chip strategy
        chip_recommendations=chip_plan,
        
        # Competition context
        mini_league_insights=mini_league_insights,
        template_comparison=template,
        
        # Planning tools
        planning_horizon=generate_planning_horizon(squad_state, horizon=5),
        
        # Meta
        generated_at=datetime.now(),
        confidence=calculate_overall_confidence(enhanced_single, squad_health),
        next_update=calculate_next_deadline()
    )
```

### 7.2 Real-time Monitoring Service
```python
class PersonalMonitoringService:
    """
    Background service для мониторинга важных событий
    """
    
    async def monitor_user_squad(self, user_id: int):
        """
        Непрерывный мониторинг команды пользователя
        """
        
        while True:
            squad = await fetch_squad_state(user_id)
            
            # === PRICE CHANGE MONITORING ===
            await self.check_price_changes(squad, user_id)
            
            # === INJURY/NEWS MONITORING ===
            await self.check_injury_news(squad, user_id)
            
            # === OWNERSHIP SHIFTS ===
            await self.check_ownership_shifts(squad, user_id)
            
            # === RIVAL ACTIVITY ===
            await self.check_rival_activity(squad, user_id)
            
            # Sleep until next check (e.g., every 30 minutes)
            await asyncio.sleep(1800)
    
    async def check_price_changes(self, squad: SquadState, user_id: int):
        """
        Отслеживание price changes влияющих на команду
        """
        
        predictions = fetch_price_change_predictions()
        
        for player in squad.players:
            prediction = predictions.get(player.id)
            
            if not prediction:
                continue
            
            # Player will drop tonight
            if prediction.change == -0.1 and prediction.probability > 0.95:
                await send_notification(user_id, Notification(
                    type="PRICE_DROP",
                    priority="HIGH",
                    title=f"⚠️ {player.name} падает в цене сегодня",
                    message=f"Ваша цена продажи: £{player.selling_price}m → £{player.selling_price - 0.1}m. "
                            f"Рассмотрите продажу до {prediction.deadline_time}.",
                    actions=[
                        {"label": "Найти замену", "action": "find_replacement", "player_id": player.id},
                        {"label": "Игнорировать", "action": "dismiss"}
                    ]
                ))
            
            # Player will rise tonight
            if prediction.change == +0.1 and prediction.probability > 0.95:
                # Check if on watchlist
                watchlist = await get_user_watchlist(user_id)
                if player.id in watchlist:
                    await send_notification(user_id, Notification(
                        type="PRICE_RISE",
                        priority="MEDIUM",
                        title=f"💰 {player.name} (watchlist) подорожает",
                        message=f"Цена: £{player.current_price}m → £{player.current_price + 0.1}m. "
                                f"Купить сейчас?",
                        actions=[
                            {"label": "Сделать трансфер", "action": "make_transfer", "player_id": player.id},
                            {"label": "Подождать", "action": "dismiss"}
                        ]
                    ))
    
    async def check_injury_news(self, squad: SquadState, user_id: int):
        """
        Мониторинг injury news для игроков в команде
        """
        
        # Fetch latest news (from FPL API)
        latest_news = await fetch_latest_player_news()
        
        for player in squad.players:
            news = latest_news.get(player.id)
            
            if not news or news.timestamp <= player.last_news_check:
                continue  # no new news
            
            # Parse severity
            severity = parse_injury_severity(news.text, news.chance_of_playing)
            
            if severity == "RULED_OUT":
                # Critical: player definitely not playing
                await send_notification(user_id, Notification(
                    type="INJURY_CRITICAL",
                    priority="CRITICAL",
                    title=f"🚑 {player.name} не сыграет!",
                    message=news.text,
                    actions=[
                        {"label": "Срочная замена", "action": "emergency_transfer", "player_id": player.id},
                        {"label": "Подробнее", "action": "view_details"}
                    ]
                ))
            
            elif severity == "DOUBTFUL":
                # Medium: might not play
                await send_notification(user_id, Notification(
                    type="INJURY_WARNING",
                    priority="HIGH",
                    title=f"⚠️ {player.name} под вопросом",
                    message=f"{news.text}. Шанс игры: {news.chance_of_playing}%",
                    actions=[
                        {"label": "Найти backup", "action": "find_backup", "player_id": player.id},
                        {"label": "Следить", "action": "monitor"}
                    ]
                ))
    
    async def check_ownership_shifts(self, squad: SquadState, user_id: int):
        """
        Значительные изменения в ownership (EO swings)
        """
        
        livefpl = LiveFPLIntegration()
        rank = await fetch_current_rank(user_id)
        rank_band = get_rank_band(rank)
        
        for player in squad.players:
            current_eo = await livefpl.get_effective_ownership(player.id, rank_band)
            cached_eo = await get_cached_eo(user_id, player.id)
            
            if not cached_eo:
                await cache_eo(user_id, player.id, current_eo)
                continue
            
            eo_change = current_eo.rank_band - cached_eo.rank_band
            
            # Significant drop in your player's EO (people selling)
            if eo_change < -10:  # > 10% drop
                await send_notification(user_id, Notification(
                    type="OWNERSHIP_SHIFT",
                    priority="MEDIUM",
                    title=f"📉 {player.name}: падение EO",
                    message=f"EO в вашем ранге: {cached_eo.rank_band:.1f}% → {current_eo.rank_band:.1f}%. "
                            f"Многие продают.",
                    actions=[
                        {"label": "Узнать почему", "action": "analyze_trend"},
                        {"label": "Держать", "action": "dismiss"}
                    ]
                ))
            
            # Your differential becoming template
            if cached_eo.rank_band < 30 and current_eo.rank_band > 50:
                await send_notification(user_id, Notification(
                    type="DIFFERENTIAL_LOST",
                    priority="LOW",
                    title=f"👥 {player.name}: стал template",
                    message=f"EO вырос с {cached_eo.rank_band:.1f}% до {current_eo.rank_band:.1f}%. "
                            f"Больше не differential.",
                    actions=[
                        {"label": "OK", "action": "dismiss"}
                    ]
                ))
            
            # Update cache
            await cache_eo(user_id, player.id, current_eo)
    
    async def check_rival_activity(self, squad: SquadState, user_id: int):
        """
        Отслеживание действий соперников в мини-лигах
        """
        
        leagues = await fetch_user_leagues(user_id)
        
        for league in leagues[:3]:  # top 3 leagues only
            rivals = await fetch_league_teams(league.id)
            
            # Check for recent transfers by close rivals
            close_rivals = [r for r in rivals if abs(r.rank - squad.rank) < 50000]
            
            for rival in close_rivals:
                recent_transfers = await fetch_recent_transfers(rival.team_id, hours=24)
                
                for transfer in recent_transfers:
                    # Rival brought in someone you don't have
                    if transfer.player_in not in squad.players:
                        eo = await livefpl.get_effective_ownership(
                            transfer.player_in.id, 
                            get_rank_band(squad.rank)
                        )
                        
                        # Only notify if it's a significant differential
                        if eo.rank_band < 40:  # < 40% owned
                            await send_notification(user_id, Notification(
                                type="RIVAL_DIFFERENTIAL",
                                priority="LOW",
                                title=f"⚔️ {rival.name} купил {transfer.player_in.name}",
                                message=f"Differential pick (EO: {eo.rank_band:.1f}%). "
                                        f"xPts next 5: {transfer.player_in.xPts_next5:.1f}",
                                actions=[
                                    {"label": "Проанализировать", "action": "analyze_player", 
                                     "player_id": transfer.player_in.id},
                                    {"label": "Игнорировать", "action": "dismiss"}
                                ]
                            ))
```

### 7.3 Watchlist & Tracking System
```python
class WatchlistManager:
    """
    Система отслеживания интересующих игроков
    """
    
    async def add_to_watchlist(
        self, 
        user_id: int, 
        player_id: int, 
        reason: str = "manual"
    ):
        """
        Добавить игрока в watchlist
        """
        await db.watchlist.create({
            "user_id": user_id,
            "player_id": player_id,
            "added_at": datetime.now(),
            "reason": reason,  # "manual", "suggested", "trending", etc.
            "notifications_enabled": True
        })
    
    async def get_watchlist_updates(self, user_id: int) -> List[WatchlistUpdate]:
        """
        Обновления по игрокам из watchlist
        """
        watchlist = await db.watchlist.find({"user_id": user_id})
        updates = []
        
        for item in watchlist:
            player = await fetch_player_data(item.player_id)
            
            # Check various factors
            update = WatchlistUpdate(
                player=player,
                
                # Price monitoring
                price_change=check_price_change_since(player.id, item.added_at),
                price_trend=get_price_trend(player.id),
                
                # Performance
                recent_returns=get_recent_returns(player.id, games=3),
                xpts_change=compare_xpts(player.id, item.added_at),
                
                # Fixtures
                upcoming_fixtures=get_next_fixtures(player.id, n=5),
                fixture_swing=calculate_fixture_change(player.id, item.added_at),
                
                # Ownership
                ownership_trend=get_ownership_trend(player.id, days=7),
                
                # Readiness score (0-100: how ready to pull the trigger)
                readiness_score=calculate_readiness_score(player, user_id),
                
                # Recommendation
                action="BUY_NOW" if readiness_score > 80 else
                       "WAIT" if readiness_score > 50 else
                       "REMOVE_FROM_WATCHLIST"
            )
            
            updates.append(update)
        
        return sorted(updates, key=lambda u: u.readiness_score, reverse=True)
    
    def calculate_readiness_score(self, player: Player, user_id: int) -> float:
        """
        Насколько "готов" игрок для покупки (0-100)
        """
        
        score = 50  # baseline
        
        # === PRICE ===
        if player.price_rise_probability > 0.90:
            score += 15  # rising soon
        elif player.price_fall_probability > 0.50:
            score -= 10  # falling soon
        
        # === FORM ===
        if player.returns_in_last_3 >= 2:
            score += 10  # hot form
        elif player.returns_in_last_3 == 0:
            score -= 5   # cold
        
        # === FIXTURES ===
        fdr_next_5 = mean([f.fdr for f in player.next_5_fixtures])
        if fdr_next_5 < 2.5:
            score += 15  # great fixtures
        elif fdr_next_5 > 4.0:
            score -= 10  # tough fixtures
        
        # === OWNERSHIP TREND ===
        if player.eo_change_7d > 5:
            score += 10  # gaining popularity (don't miss out)
        
        # === AVAILABILITY ===
        squad = fetch_squad_state(user_id)
        if player.current_price > squad.bank:
            score -= 30  # can't afford
        
        if not can_fit_in_squad(player, squad):
            score -= 20  # doesn't fit structure
        
        # === NAILEDNESS ===
        if player.minutes_last_5 < 200:
            score -= 15  # rotation risk
        
        return max(0, min(100, score))
```

## 8) Data Pipeline Architecture
(See full diagram in prompt)

## 9) UI Components & User Flows
(See full components in prompt)

## 10) Advanced Analysis Examples
(See full examples in prompt)

## 11) Summary & Key Takeaways
Что мы построили
Эта система предоставляет персонализированные, контекстуальные рекомендации трансферов основанные на:
- Вашей текущей команде (состав, бюджет, FT, чипы)
- Предсказаниях xPts (из вашего existing engine)
- LiveFPL контексте (EO, template, trending transfers)
- Вашем ранге и целях (защита vs погоня)
- Оппонентах в мини-лигах (differential strategy)

## 12) Финальные мысли
Что делает эту систему ценной
- Personalization: Рекомендации учитывают ВАШ состав, ВАШ ранг, ВАШИ цели
- Context-aware: LiveFPL EO показывает что делают соперники на вашем уровне
- Proactive: Мониторинг и alerts вместо ручной проверки
- Optimization: Math-driven решения вместо gut feeling
- Competitive edge: Differential analysis vs mini-league rivals
