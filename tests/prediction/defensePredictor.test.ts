/**
 * Tests for A4.2-A4.3: Defense Predictor and DEFCON Profile
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { 
  buildDefconProfile, 
  inferPlayerZone, 
  estimateDefconProbabilityFromProfile,
  DefconProfile 
} from "../../lib/services/prediction/defense/defconProfile";
import { 
  predictDefensiveActions, 
  quickDefensePrediction,
  DEFAULT_OPPONENT_CONTEXT,
  DEFAULT_TEAM_CONTEXT 
} from "../../lib/services/prediction/defense/defensePredictor";
import type { DefensiveMatchStats } from "../../lib/services/prediction/features/defenseFeatures";

describe("DefconProfile", () => {
  const sampleMatches: DefensiveMatchStats[] = [
    { clearances: 4, blocks: 2, interceptions: 3, tackles: 2, recoveries: 3, aerial_duels_won: 2, challenges_won: 3 },
    { clearances: 5, blocks: 1, interceptions: 2, tackles: 3, recoveries: 2, aerial_duels_won: 3, challenges_won: 2 },
    { clearances: 3, blocks: 2, interceptions: 4, tackles: 2, recoveries: 4, aerial_duels_won: 1, challenges_won: 4 },
  ];

  it("buildDefconProfile: should create profile with correct baselines", () => {
    const profile = buildDefconProfile(sampleMatches, "DEFENDER", 270);
    
    assert.ok(profile.baseline_cbit90 > 0, "baseline_cbit90 should be positive");
    assert.ok(profile.baseline_cbirt90 > profile.baseline_cbit90, "cbirt should include recoveries");
    assert.strictEqual(profile.position, "DEFENDER");
    assert.strictEqual(profile.role_multiplier, 1.0); // CB default for DEFENDER
  });

  it("buildDefconProfile: confidence should scale with sample size", () => {
    const profile3 = buildDefconProfile(sampleMatches, "DEFENDER", 270);
    const profile10 = buildDefconProfile([...sampleMatches, ...sampleMatches, ...sampleMatches, sampleMatches[0]], "DEFENDER", 360);
    
    assert.ok(profile10.confidence >= profile3.confidence, "more matches = higher confidence");
  });

  it("inferPlayerZone: should map positions correctly", () => {
    assert.strictEqual(inferPlayerZone("GOALKEEPER"), "CB");
    assert.strictEqual(inferPlayerZone("DEFENDER"), "CB");
    assert.strictEqual(inferPlayerZone("MIDFIELDER"), "CM");
    assert.strictEqual(inferPlayerZone("FORWARD"), "ST");
  });

  it("inferPlayerZone: should respect role hints", () => {
    assert.strictEqual(inferPlayerZone("DEFENDER", "wing-back"), "WB");
    assert.strictEqual(inferPlayerZone("MIDFIELDER", "defensive mid"), "DM");
    assert.strictEqual(inferPlayerZone("MIDFIELDER", "attacking mid"), "AM");
  });

  it("estimateDefconProbabilityFromProfile: high CBIT should give higher probability", () => {
    const lowProfile: DefconProfile = {
      baseline_cbit90: 4,
      baseline_cbirt90: 6,
      baseline_extended90: 5,
      variability_sigma: 2,
      role_multiplier: 1,
      position: "DEFENDER",
      confidence: 0.8,
    };

    const highProfile: DefconProfile = {
      baseline_cbit90: 12,
      baseline_cbirt90: 15,
      baseline_extended90: 14,
      variability_sigma: 2,
      role_multiplier: 1,
      position: "DEFENDER",
      confidence: 0.8,
    };

    const lowProb = estimateDefconProbabilityFromProfile(lowProfile);
    const highProb = estimateDefconProbabilityFromProfile(highProfile);

    assert.ok(highProb > lowProb, "higher CBIT should give higher DEFCON probability");
    assert.ok(lowProb < 0.5, "low CBIT player should have < 50% chance");
    assert.ok(highProb > 0.5, "high CBIT player should have > 50% chance");
  });

  it("estimateDefconProbabilityFromProfile: reduced minutes should lower probability", () => {
    const profile: DefconProfile = {
      baseline_cbit90: 10,
      baseline_cbirt90: 13,
      baseline_extended90: 12,
      variability_sigma: 2,
      role_multiplier: 1,
      position: "DEFENDER",
      confidence: 0.8,
    };

    const prob90 = estimateDefconProbabilityFromProfile(profile, 90);
    const prob60 = estimateDefconProbabilityFromProfile(profile, 60);

    assert.ok(prob90 > prob60, "full 90 mins should have higher DEFCON probability");
  });
});

describe("DefensePredictor", () => {
  const baseProfile: DefconProfile = {
    baseline_cbit90: 10,
    baseline_cbirt90: 13,
    baseline_extended90: 12,
    variability_sigma: 2,
    role_multiplier: 1,
    position: "DEFENDER",
    confidence: 0.8,
  };

  it("predictDefensiveActions: should return valid prediction", () => {
    const prediction = predictDefensiveActions(baseProfile, {
      opponent: DEFAULT_OPPONENT_CONTEXT,
      team: DEFAULT_TEAM_CONTEXT,
      player_zone: "CB",
      expected_minutes: 90,
    });

    assert.ok(prediction.expected_cbit > 0, "expected_cbit should be positive");
    assert.ok(prediction.expected_cbirt >= prediction.expected_cbit, "cbirt should include recoveries");
    assert.ok(prediction.prob_defcon >= 0 && prediction.prob_defcon <= 1, "prob should be 0-1");
    assert.ok(prediction.expected_defcon_points >= 0 && prediction.expected_defcon_points <= 2, "max 2 pts");
  });

  it("predictDefensiveActions: more opponent attacks should increase defensive actions", () => {
    const lowAttackOpponent = { ...DEFAULT_OPPONENT_CONTEXT, attacks_per_90: 30 };
    const highAttackOpponent = { ...DEFAULT_OPPONENT_CONTEXT, attacks_per_90: 60 };

    const lowPred = predictDefensiveActions(baseProfile, {
      opponent: lowAttackOpponent,
      team: DEFAULT_TEAM_CONTEXT,
      player_zone: "CB",
      expected_minutes: 90,
    });

    const highPred = predictDefensiveActions(baseProfile, {
      opponent: highAttackOpponent,
      team: DEFAULT_TEAM_CONTEXT,
      player_zone: "CB",
      expected_minutes: 90,
    });

    assert.ok(highPred.expected_cbit > lowPred.expected_cbit, "more attacks = more defensive actions");
  });

  it("quickDefensePrediction: should work with minimal input", () => {
    const prediction = quickDefensePrediction(baseProfile, 90);

    assert.ok(prediction.expected_cbit > 0);
    assert.ok(prediction.confidence > 0);
  });

  it("predictDefensiveActions: midfielder should have lower expected actions than defender", () => {
    const midProfile: DefconProfile = {
      ...baseProfile,
      position: "MIDFIELDER",
      role_multiplier: 0.65, // CM role
    };

    const defPred = predictDefensiveActions(baseProfile, {
      opponent: DEFAULT_OPPONENT_CONTEXT,
      team: DEFAULT_TEAM_CONTEXT,
      player_zone: "CB",
      expected_minutes: 90,
    });

    const midPred = predictDefensiveActions(midProfile, {
      opponent: DEFAULT_OPPONENT_CONTEXT,
      team: DEFAULT_TEAM_CONTEXT,
      player_zone: "CM",
      expected_minutes: 90,
    });

    assert.ok(defPred.expected_cbit > midPred.expected_cbit, "defenders should have more CBIT than mids");
  });
});
