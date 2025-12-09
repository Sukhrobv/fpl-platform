/**
 * B7: ML Model Configuration
 * 
 * Provides USE_ML toggle and model configuration.
 * By default, ML is disabled and heuristics are used.
 */

export const ML_CONFIG = {
  /** Enable ML models for prediction (default: false) */
  USE_ML: process.env.USE_ML === "true",
  
  /** Model paths - relative to project root */
  MODELS_DIR: process.env.ML_MODELS_DIR || "ml/models",
  
  /** Individual model toggles */
  USE_ML_MINUTES: process.env.USE_ML_MINUTES === "true",
  USE_ML_ATTACK: process.env.USE_ML_ATTACK === "true",
  
  /** Fallback to heuristic on ML error */
  FALLBACK_ON_ERROR: true,
};

/** Check if any ML model is enabled */
export function isMLEnabled(): boolean {
  return ML_CONFIG.USE_ML || ML_CONFIG.USE_ML_MINUTES || ML_CONFIG.USE_ML_ATTACK;
}

/** Log ML configuration on startup */
export function logMLConfig(): void {
  console.log("[ML Config]", {
    USE_ML: ML_CONFIG.USE_ML,
    USE_ML_MINUTES: ML_CONFIG.USE_ML_MINUTES,
    USE_ML_ATTACK: ML_CONFIG.USE_ML_ATTACK,
    MODELS_DIR: ML_CONFIG.MODELS_DIR,
  });
}
