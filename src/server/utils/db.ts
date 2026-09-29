import { PrismaClient } from "@prisma/client";

/**
 * Singleton instance of Prisma Client.
 * Shared across all handlers to prevent connection leaks.
 */

let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }
  return prismaInstance;
}

/**
 * Disconnect Prisma (useful for server shutdown or testing).
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

// Export a convenience alias
export const db = getPrismaClient();
