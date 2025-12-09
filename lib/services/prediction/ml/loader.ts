/**
 * B7: ML Model Loader
 * 
 * Loads and manages ML models for prediction.
 * Currently provides placeholder implementations - replace with actual models.
 */

import { ML_CONFIG } from "./config";
import { MinutesMLInput, MinutesMLOutput, AttackMLInput, AttackMLOutput, MLModel } from "./types";

// ============================================================================
// Placeholder Models (to be replaced with actual trained models)
// ============================================================================

/**
 * Placeholder Minutes Model
 * Uses simple heuristics - replace with trained Logistic Regression
 */
class PlaceholderMinutesModel implements MLModel<MinutesMLInput, MinutesMLOutput> {
  private loaded = true;

  async predict(input: MinutesMLInput): Promise<MinutesMLOutput> {
    // Placeholder: simple heuristic based on recent minutes
    let baseProb = input.recent_avg_minutes / 90;
    
    // Apply adjustments similar to heuristic model
    if (input.rest_days !== null && input.rest_days <= 3) baseProb *= 0.85;
    if (input.has_europe_before) baseProb *= 0.9;
    if (input.days_out !== null && input.days_out > 20) baseProb *= 0.6;
    if (input.game_index_since_return === 0) baseProb *= 0.7;
    if (input.perSub_ratio > 1.3) baseProb *= 0.6;
    if (input.chance_of_playing !== null) baseProb *= input.chance_of_playing / 100;

    const start_probability = Math.max(0, Math.min(1, baseProb));
    const prob_60 = start_probability * 0.92;
    const expected_minutes = start_probability * 75 + (1 - start_probability) * 10;

    return { start_probability, prob_60, expected_minutes };
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

/**
 * Placeholder Attack Model
 * Uses simple heuristics - replace with trained XGBoost/LightGBM
 */
class PlaceholderAttackModel implements MLModel<AttackMLInput, AttackMLOutput> {
  private loaded = true;

  async predict(input: AttackMLInput): Promise<AttackMLOutput> {
    // Placeholder: blend season and recent stats
    const blendWeight = 0.6;
    const xG_base = blendWeight * input.xG90_recent + (1 - blendWeight) * input.xG90_season;
    const xA_base = blendWeight * input.xA90_recent + (1 - blendWeight) * input.xA90_season;

    // Apply context adjustments
    const homeBonus = input.is_home ? 1.1 : 0.95;
    const strengthAdj = input.team_xG_strength * input.opp_xGA_weak;
    const minutesFactor = input.minutes_expected / 90;

    const xG_predicted = xG_base * homeBonus * strengthAdj * minutesFactor;
    const xA_predicted = xA_base * homeBonus * strengthAdj * minutesFactor;

    return { xG_predicted, xA_predicted };
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

// ============================================================================
// Model Instances
// ============================================================================

let minutesModel: MLModel<MinutesMLInput, MinutesMLOutput> | null = null;
let attackModel: MLModel<AttackMLInput, AttackMLOutput> | null = null;

/**
 * Initialize ML models
 */
export async function initializeMLModels(): Promise<void> {
  if (ML_CONFIG.USE_ML || ML_CONFIG.USE_ML_MINUTES) {
    console.log("[ML] Loading Minutes model...");
    minutesModel = new PlaceholderMinutesModel();
    // TODO: Replace with actual model loading
    // minutesModel = await loadModel(`${ML_CONFIG.MODELS_DIR}/minutes_model.json`);
  }

  if (ML_CONFIG.USE_ML || ML_CONFIG.USE_ML_ATTACK) {
    console.log("[ML] Loading Attack model...");
    attackModel = new PlaceholderAttackModel();
    // TODO: Replace with actual model loading
    // attackModel = await loadModel(`${ML_CONFIG.MODELS_DIR}/attack_model.json`);
  }
}

/**
 * Get Minutes ML model (if loaded)
 */
export function getMinutesModel(): MLModel<MinutesMLInput, MinutesMLOutput> | null {
  return minutesModel;
}

/**
 * Get Attack ML model (if loaded)
 */
export function getAttackModel(): MLModel<AttackMLInput, AttackMLOutput> | null {
  return attackModel;
}

/**
 * Check if models are ready
 */
export function areModelsReady(): boolean {
  const minutesReady = !ML_CONFIG.USE_ML_MINUTES || (minutesModel?.isLoaded() ?? false);
  const attackReady = !ML_CONFIG.USE_ML_ATTACK || (attackModel?.isLoaded() ?? false);
  return minutesReady && attackReady;
}
