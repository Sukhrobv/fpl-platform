// lib/env.ts - Типобезопасная конфигурация окружения
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables
   */
  server: {
    // Database
    DATABASE_URL: z.string().url(),
    
    // API Keys (добавим позже)
    OPENAI_API_KEY: z.string().min(1).optional(),
    
    // FPL Config
    FPL_API_BASE_URL: z.string().url().default("https://fantasy.premierleague.com/api"),
    FPL_USER_ID: z.string().optional(),
    
    // App Config
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    
    // Sync Config
    ENABLE_AUTO_SYNC: z.boolean().default(false),
    SYNC_INTERVAL_MINUTES: z.number().default(60),
  },

  /**
   * Client-side environment variables
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  },

  /**
   * Runtime environment variables
   */
  runtimeEnv: {
    // Server
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    FPL_API_BASE_URL: process.env.FPL_API_BASE_URL,
    FPL_USER_ID: process.env.FPL_USER_ID,
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_AUTO_SYNC: process.env.ENABLE_AUTO_SYNC === "true",
    SYNC_INTERVAL_MINUTES: process.env.SYNC_INTERVAL_MINUTES 
      ? parseInt(process.env.SYNC_INTERVAL_MINUTES) 
      : undefined,
    
    // Client
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  /**
   * Skip validation in certain environments
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  
  /**
   * Make it clear when we're using a default value
   */
  emptyStringAsUndefined: true,
});