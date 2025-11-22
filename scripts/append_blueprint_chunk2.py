
import os

content = r'''
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
'''

with open(r'c:\Users\fpl-platform\docs\analytics\personal_transfer_advisor_blueprint.md', 'a', encoding='utf-8') as f:
    f.write(content)
