import { PrismaClient } from "@prisma/client";
import { isDatabaseUnavailableError } from "@/lib/database/database-errors";

// ERP rule: transient database blips should not add multi-second user-facing latency
// to every button click across the application. Keep retries bounded and fail fast.
const MAX_CONNECTION_RETRIES = 1;
const CONNECTION_RETRY_DELAY_MS = 150;

export function shouldRetryPrismaQuery(context: { runInTransaction?: boolean } | undefined) {
  return !context?.runInTransaction;
}

async function withConnectionRetry<T>(query: () => Promise<T>, context?: { runInTransaction?: boolean }): Promise<T> {
  if (!shouldRetryPrismaQuery(context)) {
    return query();
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await query();
    } catch (error) {
      if (!isDatabaseUnavailableError(error) || attempt >= MAX_CONNECTION_RETRIES) {
        throw error;
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn(`Prisma connection retry ${attempt + 1}/${MAX_CONNECTION_RETRIES} in ${CONNECTION_RETRY_DELAY_MS}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, CONNECTION_RETRY_DELAY_MS));
    }
  }
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      $allOperations(context) {
        const { args, query } = context;
        const runInTransaction = "runInTransaction" in context && context.runInTransaction === true;
        return withConnectionRetry(() => query(args), { runInTransaction });
      },
    },
  }) as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;