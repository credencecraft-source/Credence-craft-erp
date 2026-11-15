import { AsyncLocalStorage } from "node:async_hooks";

type QueryTimingContext = {
  durationMs: number;
  queryCount: number;
};

const timingGlobal = globalThis as typeof globalThis & {
  credenceCraftPrismaQueryTimingContext?: AsyncLocalStorage<QueryTimingContext>;
};
const queryTimingContext = timingGlobal.credenceCraftPrismaQueryTimingContext
  ?? (timingGlobal.credenceCraftPrismaQueryTimingContext = new AsyncLocalStorage<QueryTimingContext>());

export async function measureDatabaseQueries<T>(operation: () => Promise<T>) {
  const context: QueryTimingContext = { durationMs: 0, queryCount: 0 };
  const startedAt = performance.now();
  const value = await queryTimingContext.run(context, operation);
  return {
    value,
    durationMs: performance.now() - startedAt,
    databaseDurationMs: context.durationMs,
    queryCount: context.queryCount,
  };
}

export function isDatabaseQueryTimingEnabled() {
  return queryTimingContext.getStore() !== undefined;
}

export function recordDatabaseQueryDuration(durationMs: number) {
  const context = queryTimingContext.getStore();
  if (!context) return;
  context.durationMs += durationMs;
  context.queryCount += 1;
}
