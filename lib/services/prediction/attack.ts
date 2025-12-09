import { LeagueAverages } from "./types";

export function lambdaAttack(
  team_xG: number,
  opp_xGA: number,
  opp_deep: number,
  home: boolean,
  L: LeagueAverages
): number {
  const beta = 0.85;
  const betaH = 0.15;
  const val = Math.exp(
    Math.log(L.avg_xG) +
      beta * Math.log(Math.max(0.1, team_xG) / L.avg_xG) -
      beta * Math.log(Math.max(0.1, opp_xGA) / L.avg_xGA) +
      betaH * (home ? 1 : -0.1)
  );
  return Math.max(0.3, Math.min(3.8, val));
}

export function lambdaDefense(
  opp_xG: number,
  team_xGA: number,
  team_deep: number,
  home: boolean,
  L: LeagueAverages
): number {
  const beta = 0.85;
  const betaH = 0.15;
  const val = Math.exp(
    Math.log(L.avg_xGA) +
      beta * Math.log(Math.max(0.1, opp_xG) / L.avg_xG) -
      beta * Math.log(Math.max(0.1, team_xGA) / L.avg_xGA) -
      betaH * (home ? 1 : 0)
  );
  return Math.max(0.3, Math.min(3.5, val));
}
