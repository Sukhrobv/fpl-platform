import { Position } from "@prisma/client";

export interface PlayerInput {
  id: number;
  name: string;
  position: Position;
  price: number;
  // Per 90 (season)
  xG90_season: number;
  xA90_season: number;
  shots90_season: number;
  keyPasses90_season: number;
  touchesInBox90_season?: number; // B4: for involvement_score
  // Per 90 (recent)
  xG90_recent: number;
  xA90_recent: number;
  shots90_recent: number;
  keyPasses90_recent: number;
  touchesInBox90_recent?: number; // B4: for involvement_score
  // Minutes & availability
  minutes_recent: number;
  season_minutes: number;
  start_probability: number;
}

export interface TeamInput {
  id: number;
  name: string;
  isHome: boolean;
  // Per match (season)
  xG90_season: number;
  xGA90_season: number;
  deep_season: number;
  ppda_season: number;
  // Recent
  xG90_recent?: number;
  xGA90_recent?: number;
  deep_recent?: number;
  ppda_recent?: number;
  // Context
  shotsAllowed90?: number;
}

export interface LeagueAverages {
  avg_xG: number;
  avg_xGA: number;
  avg_deep: number;
  avg_ppda: number;
}

export interface PredictionResult {
  playerId: number;
  playerName: string;
  xPts: number;
  breakdown: {
    appearance: number;
    attack: number;
    defense: number;
    bonus: number;
    other: number;
  };
  raw: {
    xG: number;
    xA: number;
    csProb: number;
  };
}
