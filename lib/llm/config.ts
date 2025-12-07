// lib/llm/config.ts

export const LLM_CONFIG = {
  // Провайдер по умолчанию
  defaultProvider: "groq" as const,

  // Настройки моделей
  models: {
    groq: "llama-3.3-70b-versatile",
    gemini: "gemini-2.0-flash-exp",
  },

  // Лимиты
  maxTokensPerCall: 2000,
  maxToolCallsPerRequest: 5,
  maxMessagesHistory: 15,

  // Параметры генерации
  defaultTemperature: 0.7,
  maxRetries: 3,
  retryDelayMs: 1000,

  // Таймауты
  timeoutMs: 30000,
} as const;

export type LlmProvider = "groq" | "gemini";
