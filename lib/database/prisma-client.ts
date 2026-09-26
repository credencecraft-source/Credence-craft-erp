import { PrismaClient } from "@prisma/client";

const MAX_CONNECTION_RETRIES = 2;

function isConnectionUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    errorCode?: unknown;
    message?: unknown;
  };

  return (
    candidate.code === "P1001" ||
    candidate.errorCode === "P1001" ||
    (typeof candidate.message === "string" && /can't reach database server at/i.test(candidate.message))
  );
}

async function withConnectionRetry<T>(query: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await query();
    } catch (error) {
      if (!isConnectionUnavailable(error) || attempt >= MAX_CONNECTION_RETRIES) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      $allOperations({ args, query }) {
        return withConnectionRetry(() => query(args));
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