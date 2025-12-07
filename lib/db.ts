// lib/db.ts - Prisma Client singleton and connection helpers
//
// This module encapsulates the Prisma client instance and exposes
// convenience functions to connect and disconnect from the database.

import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

// Reuse the Prisma client across hot‑reloaded modules. Without this
// guard Next.js will create multiple clients during development which
// may exhaust the database connection pool.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Cache the instance on the global object when not in production
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Connect to the database. Returns true on success and false on
 * failure. If an error occurs the logger will emit an ERROR level
 * message and the promise resolves to false rather than throwing.
 */
export async function connectDB(): Promise<boolean> {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Disconnect from the database. This function does not throw. It
 * logs the outcome and swallows any errors because in some environments
 * (like tests) multiple disconnects may occur.
 */
export async function disconnectDB(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.warn('Error while disconnecting database:', error);
  }
}