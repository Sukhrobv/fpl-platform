"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
// lib/env.ts - Типобезопасная конфигурация окружения
const env_nextjs_1 = require("@t3-oss/env-nextjs");
const zod_1 = require("zod");
exports.env = (0, env_nextjs_1.createEnv)({
    /**
     * Server-side environment variables
     */
    server: {
        // Database
        DATABASE_URL: zod_1.z.string().url(),
        // API Keys (добавим позже)
        OPENAI_API_KEY: zod_1.z.string().min(1).optional(),
        // FPL Config
        FPL_API_BASE_URL: zod_1.z.string().url().default("https://fantasy.premierleague.com/api"),
        FPL_USER_ID: zod_1.z.string().optional(),
        // App Config
        NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
        // Sync Config
        ENABLE_AUTO_SYNC: zod_1.z.boolean().default(false),
        SYNC_INTERVAL_MINUTES: zod_1.z.number().default(60),
    },
    /**
     * Client-side environment variables
     */
    client: {
        NEXT_PUBLIC_APP_URL: zod_1.z.string().url().default("http://localhost:3000"),
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
