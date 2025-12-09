import { TeamStrengthFeatures } from "./types";
import { LeagueAverages, TeamInput } from "../types";

export function buildTeamStrengthFeatures(team: TeamInput, league: LeagueAverages): TeamStrengthFeatures {
  const xG_diff = (team.xG90_recent ?? team.xG90_season) - (team.xGA90_recent ?? team.xGA90_season);
  const attack_strength =
    league.avg_xG > 0 ? (team.xG90_recent ?? team.xG90_season) / league.avg_xG : team.xG90_recent ?? team.xG90_season;
  const defense_strength =
    league.avg_xGA > 0
      ? (team.xGA90_recent ?? team.xGA90_season) / league.avg_xGA
      : team.xGA90_recent ?? team.xGA90_season;

  return {
    xG_diff,
    attack_strength,
    defense_strength,
    points_per_game: null,
  };
}
