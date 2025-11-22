
const fs = require('fs');
const path = require('path');

const content = `
## 5) UI/UX Recommendations Display
### 5.1 Recommendation Card Structure

\`\`\`python
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
\`\`\`

### 5.2 Interactive Planning Tool

\`\`\`python
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
\`\`\`

## 6) Advanced Features
### 6.1 Wildcard Optimizer

\`\`\`python
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
\`\`\`

### 6.2 Chip Strategy Planner

\`\`\`python
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
\`\`\`

### 6.3 Mini-League Analyzer
\`\`\`python
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
\`\`\`

## 7) Implementation Pseudocode
### 7.1 Main Pipeline

\`\`\`python
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
\`\`\`

### 7.2 Real-time Monitoring Service
\`\`\`python
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
\`\`\`

### 7.3 Watchlist & Tracking System
\`\`\`python
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
\`\`\`

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
`;

const filePath = path.join('c:', 'Users', 'fpl-platform', 'docs', 'analytics', 'personal_transfer_advisor_blueprint.md');
fs.appendFileSync(filePath, content);
console.log('Chunk 3 appended successfully');
