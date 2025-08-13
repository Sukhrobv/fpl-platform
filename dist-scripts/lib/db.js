"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDB = connectDB;
exports.disconnectDB = disconnectDB;
// lib/db.ts - Prisma Client singleton for Next.js
const client_1 = require("@prisma/client");
const env_1 = require("@/lib/env");
const globalForPrisma = globalThis;
exports.prisma = (_a = globalForPrisma.prisma) !== null && _a !== void 0 ? _a : new client_1.PrismaClient({
    log: env_1.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});
if (env_1.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = exports.prisma;
}
// Helper function to handle database connection
async function connectDB() {
    try {
        await exports.prisma.$connect();
        console.log("✅ Database connected successfully");
        return true;
    }
    catch (error) {
        console.error("❌ Database connection failed:", error);
        return false;
    }
}
// Helper function to disconnect from database
async function disconnectDB() {
    await exports.prisma.$disconnect();
    console.log("Database disconnected");
}
