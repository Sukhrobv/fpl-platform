/**
 * B8: Monte Carlo Sampling Utilities
 * 
 * Provides random sampling from various distributions.
 */

/**
 * Sample from Poisson distribution
 * Uses inverse transform sampling
 */
export function samplePoisson(lambda: number): number {
  if (lambda <= 0) return 0;
  
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  
  return k - 1;
}

/**
 * Sample from Bernoulli distribution
 */
export function sampleBernoulli(p: number): boolean {
  return Math.random() < p;
}

/**
 * Sample minutes played based on start probability and expected minutes
 * Returns 0, sub minutes (1-59), or full minutes (60-90)
 */
export function sampleMinutes(opts: {
  startProbability: number;
  expectedMinutes: number;
  prob60: number;
}): number {
  const { startProbability, expectedMinutes, prob60 } = opts;
  
  // Did player start?
  const started = sampleBernoulli(startProbability);
  
  if (!started) {
    // Not starting - either no appearance or sub
    const subProb = (expectedMinutes - startProbability * 70) / 25; // Rough sub probability
    if (!sampleBernoulli(Math.max(0, Math.min(0.3, subProb)))) {
      return 0; // No appearance
    }
    // Sub appearance: 1-45 minutes, peak around 15-20
    return Math.floor(Math.random() * 45) + 1;
  }
  
  // Started - did they play 60+?
  const played60Plus = sampleBernoulli(prob60 / startProbability);
  
  if (played60Plus) {
    // Full game: 60-90 minutes
    return 60 + Math.floor(Math.random() * 31);
  } else {
    // Early sub: 45-59 minutes
    return 45 + Math.floor(Math.random() * 15);
  }
}

/**
 * Sample goals scored based on xG and minutes played
 */
export function sampleGoals(xG: number, minutesFraction: number): number {
  const adjustedXg = xG * minutesFraction;
  return samplePoisson(adjustedXg);
}

/**
 * Sample assists based on xA and minutes played
 */
export function sampleAssists(xA: number, minutesFraction: number): number {
  const adjustedXa = xA * minutesFraction;
  return samplePoisson(adjustedXa);
}

/**
 * Sample clean sheet based on CS probability and minutes played
 */
export function sampleCleanSheet(csProb: number, minutes: number): boolean {
  // Need 60+ minutes for CS points
  if (minutes < 60) return false;
  return sampleBernoulli(csProb);
}

/**
 * Sample DEFCON points based on defensive stats rate
 */
export function sampleDefcon(opts: {
  position: "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";
  cbit90: number;
  cbirt90: number;
  minutes: number;
}): number {
  const { position, cbit90, cbirt90, minutes } = opts;
  
  if (minutes < 60) return 0; // Need significant minutes
  
  const minutesFrac = minutes / 90;
  const threshold = (position === "GOALKEEPER" || position === "DEFENDER") ? 10 : 12;
  const rate = (position === "GOALKEEPER" || position === "DEFENDER") ? cbit90 : cbirt90;
  
  // Sample actual defensive actions
  const actions = samplePoisson(rate * minutesFrac);
  
  return actions >= threshold ? 2 : 0;
}

/**
 * Sample bonus points based on performance
 */
export function sampleBonus(opts: {
  goals: number;
  assists: number;
  cleanSheet: boolean;
  position: "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";
}): number {
  const { goals, assists, cleanSheet, position } = opts;
  
  // Simplified BPS sampling
  let bpsScore = goals * 12 + assists * 9;
  if (cleanSheet && (position === "GOALKEEPER" || position === "DEFENDER")) {
    bpsScore += 12;
  }
  
  // Random component for other BPS factors
  bpsScore += Math.floor(Math.random() * 10);
  
  // Convert to bonus points (simplified)
  if (bpsScore >= 30) return 3;
  if (bpsScore >= 20) return 2;
  if (bpsScore >= 10) return 1;
  return 0;
}
