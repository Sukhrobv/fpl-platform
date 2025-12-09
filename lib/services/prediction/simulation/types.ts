/**
 * B8: Monte Carlo Simulation Types
 */

import { Position } from "@prisma/client";

/** Input for simulation - combines all prediction context */
export interface SimulationInput {
  playerId: number;
  playerName: string;
  position: Position;
  // Minutes distribution params
  startProbability: number;
  expectedMinutes: number;
  prob60: number;
  // Attack distribution params
  xG: number;
  xA: number;
  // Defense distribution params
  csProb: number;
  // DEFCON params
  cbit90: number;
  cbirt90: number;
}

/** Single simulation result */
export interface SimulationResult {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  defconPoints: number;
  bonusPoints: number;
  totalPoints: number;
}

/** Aggregated simulation statistics */
export interface SimulationStats {
  mean: number;
  median: number;
  stdDev: number;
  percentile5: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  min: number;
  max: number;
}

/** Full simulation output */
export interface SimulationOutput {
  playerId: number;
  playerName: string;
  simulations: number;
  stats: SimulationStats;
  distribution: number[]; // Histogram buckets (0-20 pts)
  haul_probability: number; // P(pts >= 10)
  blank_probability: number; // P(pts <= 2)
}
