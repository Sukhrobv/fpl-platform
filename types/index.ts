// types/index.ts - Core type definitions for FPL Platform

// Re-export Prisma types
export type { 
  Player, 
  Team, 
  Match, 
  FPLPlayerStats,
  ExternalPlayerStats,
  PlayerMapping,
  Position,
  MappingMethod,
  MappingStatus 
} from "@prisma/client";

// FPL API Types
export interface FPLBootstrapData {
  events: FPLEvent[];
  teams: FPLTeam[];
  elements: FPLElement[]; // Players
  element_types: FPLElementType[]; // Positions
  element_stats: FPLElementStat[];
}

export interface FPLEvent {
  id: number;
  name: string;
  deadline_time: string;
  average_entry_score: number;
  finished: boolean;
  data_checked: boolean;
  highest_scoring_entry: number | null;
  deadline_time_epoch: number;
  deadline_time_game_offset: number;
  highest_score: number | null;
  is_previous: boolean;
  is_current: boolean;
  is_next: boolean;
  chip_plays: FPLChipPlay[];
  most_selected: number | null;
  most_transferred_in: number | null;
  top_element: number | null;
  top_element_info: {
    id: number;
    points: number;
  } | null;
  transfers_made: number;
  most_captained: number | null;
  most_vice_captained: number | null;
}

export interface FPLTeam {
  code: number;
  draw: number;
  form: string | null;
  id: number;
  loss: number;
  name: string;
  played: number;
  points: number;
  position: number;
  short_name: string;
  strength: number;
  team_division: string | null;
  unavailable: boolean;
  win: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
  pulse_id: number;
}

export interface FPLElement {
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  code: number;
  cost_change_event: number;
  cost_change_event_fall: number;
  cost_change_start: number;
  cost_change_start_fall: number;
  dreamteam_count: number;
  element_type: number; // Position ID
  ep_next: string | null;
  ep_this: string | null;
  event_points: number;
  first_name: string;
  form: string;
  id: number;
  in_dreamteam: boolean;
  news: string;
  news_added: string | null;
  now_cost: number;
  photo: string;
  points_per_game: string;
  second_name: string;
  selected_by_percent: string;
  special: boolean;
  squad_number: number | null;
  status: string;
  team: number; // Team ID
  team_code: number;
  total_points: number;
  transfers_in: number;
  transfers_in_event: number;
  transfers_out: number;
  transfers_out_event: number;
  value_form: string;
  value_season: string;
  web_name: string;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
}

export interface FPLElementType {
  id: number;
  plural_name: string;
  plural_name_short: string;
  singular_name: string;
  singular_name_short: string;
  squad_select: number;
  squad_min_play: number;
  squad_max_play: number;
  ui_shirt_specific: boolean;
  sub_positions_locked: number[];
  element_count: number;
}

export interface FPLElementStat {
  label: string;
  name: string;
}

export interface FPLChipPlay {
  chip_name: string;
  num_played: number;
}

// External API Types
export interface SofascorePlayer {
  id: number;
  name: string;
  slug: string;
  shortName: string;
  team: {
    id: number;
    name: string;
    slug: string;
  };
  position: string;
  height: number;
  preferredFoot: string;
  dateOfBirth: string;
  shirtNumber: number;
}

export interface UnderstatPlayer {
  id: string;
  player_name: string;
  games: number;
  time: number;
  goals: number;
  xG: number;
  assists: number;
  xA: number;
  shots: number;
  key_passes: number;
  yellow_cards: number;
  red_cards: number;
  npg: number;
  npxG: number;
  xGChain: number;
  xGBuildup: number;
}

// Mapping types
export interface MappingCandidate {
  player: {
    id: number;
    fplId: number;
    webName: string;
    firstName: string;
    secondName: string;
    teamId: number;
  };
  externalId: string;
  source: string;
  confidence: number;
  method: "EXACT_MATCH" | "FUZZY_MATCH" | "MANUAL" | "AI_SUGGESTED";
  matchReasons: string[];
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
// FPL Fixture types
export interface FPLFixtureStatEntry {
  element: number;
  value: number;
}

export interface FPLFixtureStat {
  identifier: string;
  a: FPLFixtureStatEntry[];
  h: FPLFixtureStatEntry[];
}

export interface FPLFixture {
  id: number;
  code: number;
  event: number | null;
  finished: boolean;
  finished_provisional: boolean;
  kickoff_time: string | null;
  minutes: number;
  provisional_start_time: boolean;
  started: boolean;
  team_a: number;
  team_a_score: number | null;
  team_h: number;
  team_h_score: number | null;
  stats: FPLFixtureStat[];
  team_h_difficulty: number;
  team_a_difficulty: number;
  pulse_id: number;
}

// FPL live event types
export interface FPLPlayerLiveStats {
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  total_points: number;
}

export interface FPLLiveElementExplainStat {
  identifier: string;
  points: number;
  value: number;
  points_modification: number;
}

export interface FPLLiveElementExplain {
  fixture: number;
  stats: FPLLiveElementExplainStat[];
}

export interface FPLLiveElement {
  id: number;
  stats: FPLPlayerLiveStats;
  explain: FPLLiveElementExplain[];
  modified: boolean;
}

export interface FPLEventLiveResponse {
  elements: FPLLiveElement[];
}

// FPL player summary types
export interface FPLPlayerSummaryFixture {
  id: number;
  code: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  is_home: boolean;
  difficulty: number;
  finished: boolean;
  minutes: number;
}

export interface FPLPlayerHistoryEntry {
  element: number;
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  kickoff_time: string;
  team_h_score: number;
  team_a_score: number;
  round: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  value: number;
  transfers_balance: number;
  selected: number;
  transfers_in: number;
  transfers_out: number;
}

export interface FPLPlayerSeasonSummary {
  season_name: string;
  element_code: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
}

export interface FPLPlayerSummary {
  fixtures: FPLPlayerSummaryFixture[];
  history: FPLPlayerHistoryEntry[];
  history_past: FPLPlayerSeasonSummary[];
}
