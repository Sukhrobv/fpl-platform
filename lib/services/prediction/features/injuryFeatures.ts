import { BasicMatchStat, InjuryFeatures } from "./types";

export function buildInjuryFeatures(recentMatches: BasicMatchStat[]): InjuryFeatures {
  if (!recentMatches || recentMatches.length === 0) {
    return { days_out: null, games_missed: 0, game_index_since_return: null };
  }

  const games_missed = recentMatches.filter((m) => !m.minutes || m.minutes <= 0).length;
  const game_index_since_return = recentMatches.findIndex((m) => (m.minutes || 0) > 0);

  // days_out is unknown without injury log; keep null placeholder
  return {
    days_out: null,
    games_missed,
    game_index_since_return: game_index_since_return === -1 ? null : game_index_since_return,
  };
}
