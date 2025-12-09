/**
 * B8: Monte Carlo Game Simulation
 * 
 * Simulates N game outcomes for a player to generate points distribution.
 */

import { Position } from "@prisma/client";
import { 
  SimulationInput, 
  SimulationResult, 
  SimulationStats, 
  SimulationOutput 
} from "./types";
import {
  sampleMinutes,
  sampleGoals,
  sampleAssists,
  sampleCleanSheet,
  sampleDefcon,
  sampleBonus,
} from "./sampling";

/**
 * Calculate FPL points for a single simulated outcome
 */
function calculatePoints(opts: {
  position: Position;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  defconPoints: number;
  bonusPoints: number;
}): number {
  const { position, minutes, goals, assists, cleanSheet, defconPoints, bonusPoints } = opts;
  
  let points = 0;
  
  // Appearance points
  if (minutes >= 60) {
    points += 2;
  } else if (minutes > 0) {
    points += 1;
  }
  
  // Goal points
  const goalPts = position === "FORWARD" ? 4 : position === "MIDFIELDER" ? 5 : 6;
  points += goals * goalPts;
  
  // Assist points
  points += assists * 3;
  
  // Clean sheet points
  if (cleanSheet && minutes >= 60) {
    if (position === "GOALKEEPER" || position === "DEFENDER") {
      points += 4;
    } else if (position === "MIDFIELDER") {
      points += 1;
    }
  }
  
  // DEFCON points
  points += defconPoints;
  
  // Bonus points
  points += bonusPoints;
  
  return points;
}

/**
 * Run a single simulation
 */
function simulateOnce(input: SimulationInput): SimulationResult {
  // Sample minutes
  const minutes = sampleMinutes({
    startProbability: input.startProbability,
    expectedMinutes: input.expectedMinutes,
    prob60: input.prob60,
  });
  
  const minutesFrac = minutes / 90;
  
  // Sample attacking returns
  const goals = sampleGoals(input.xG, minutesFrac);
  const assists = sampleAssists(input.xA, minutesFrac);
  
  // Sample clean sheet
  const cleanSheet = sampleCleanSheet(input.csProb, minutes);
  
  // Sample DEFCON
  const defconPoints = sampleDefcon({
    position: input.position,
    cbit90: input.cbit90,
    cbirt90: input.cbirt90,
    minutes,
  });
  
  // Sample bonus
  const bonusPoints = sampleBonus({
    goals,
    assists,
    cleanSheet,
    position: input.position,
  });
  
  // Calculate total points
  const totalPoints = calculatePoints({
    position: input.position,
    minutes,
    goals,
    assists,
    cleanSheet,
    defconPoints,
    bonusPoints,
  });
  
  return {
    minutes,
    goals,
    assists,
    cleanSheet,
    defconPoints,
    bonusPoints,
    totalPoints,
  };
}

/**
 * Calculate statistics from simulation results
 */
function calculateStats(results: SimulationResult[]): SimulationStats {
  const points = results.map(r => r.totalPoints).sort((a, b) => a - b);
  const n = points.length;
  
  const mean = points.reduce((sum, p) => sum + p, 0) / n;
  const median = points[Math.floor(n / 2)];
  
  const variance = points.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean: Number(mean.toFixed(2)),
    median,
    stdDev: Number(stdDev.toFixed(2)),
    percentile5: points[Math.floor(n * 0.05)],
    percentile25: points[Math.floor(n * 0.25)],
    percentile75: points[Math.floor(n * 0.75)],
    percentile95: points[Math.floor(n * 0.95)],
    min: points[0],
    max: points[n - 1],
  };
}

/**
 * Create histogram distribution (0-20+ points)
 */
function createDistribution(results: SimulationResult[]): number[] {
  const buckets = new Array(21).fill(0);
  
  for (const result of results) {
    const bucket = Math.min(20, Math.max(0, result.totalPoints));
    buckets[bucket]++;
  }
  
  // Convert to probabilities
  return buckets.map(count => Number((count / results.length).toFixed(4)));
}

/**
 * Main simulation function
 * 
 * @param input - Player prediction context
 * @param N - Number of simulations (default 1000)
 * @returns Aggregated simulation statistics and distribution
 */
export function simulateGame(input: SimulationInput, N = 1000): SimulationOutput {
  const results: SimulationResult[] = [];
  
  for (let i = 0; i < N; i++) {
    results.push(simulateOnce(input));
  }
  
  const stats = calculateStats(results);
  const distribution = createDistribution(results);
  
  // Calculate haul and blank probabilities
  const hauls = results.filter(r => r.totalPoints >= 10).length;
  const blanks = results.filter(r => r.totalPoints <= 2).length;
  
  return {
    playerId: input.playerId,
    playerName: input.playerName,
    simulations: N,
    stats,
    distribution,
    haul_probability: Number((hauls / N).toFixed(4)),
    blank_probability: Number((blanks / N).toFixed(4)),
  };
}

/**
 * Quick simulate for expected value only (faster, fewer simulations)
 */
export function quickSimulate(input: SimulationInput, N = 100): number {
  let totalPoints = 0;
  
  for (let i = 0; i < N; i++) {
    totalPoints += simulateOnce(input).totalPoints;
  }
  
  return Number((totalPoints / N).toFixed(2));
}
