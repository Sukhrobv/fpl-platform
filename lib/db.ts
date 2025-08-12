// lib/db.ts - Prisma Client singleton for Next.js
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Helper function to handle database connection
export async function connectDB() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

// Helper function to disconnect from database
export async function disconnectDB() {
  await prisma.$disconnect();
  console.log("Database disconnected");
}