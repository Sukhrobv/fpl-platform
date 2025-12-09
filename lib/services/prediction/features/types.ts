export interface BasicMatchStat {
  minutes?: number | null;
  xG?: number | null;
  xA?: number | null;
  shots?: number | null;
  keyPasses?: number | null;
  kickoff?: string | number | Date | null;
  competition?: string | null;
  isEurope?: boolean;
}

export interface ScheduleFeatures {
  rest_days: number | null;
  has_midweek_europe_before: boolean;
  has_midweek_europe_after: boolean;
}

export interface InjuryFeatures {
  days_out: number | null;
  games_missed: number;
  game_index_since_return: number | null;
}

export interface RoleFeatures {
  perStart_xG: number;
  perSub_xG: number;
  perStart_xA: number;
  perSub_xA: number;
}

export interface TrendFeatures {
  rolling_avg_xG: Record<number, number>;
  rolling_avg_xA: Record<number, number>;
  rolling_var_xG: Record<number, number>;
  rolling_var_xA: Record<number, number>;
  slope_xG: Record<number, number>;
  slope_xA: Record<number, number>;
}

export interface TeamStrengthFeatures {
  xG_diff: number;
  attack_strength: number;
  defense_strength: number;
  points_per_game: number | null;
}
