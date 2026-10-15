export const DATABASE_UNAVAILABLE_MESSAGE =
  "The ERP database is unavailable. Check the database service and endpoint, then try again.";

export function isDatabaseUnavailableError(error: unknown) {
  const pending: unknown[] = [error];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== "object" || current === null || visited.has(current)) continue;
    visited.add(current);

    const candidate = current as {
      code?: unknown;
      errorCode?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const code = typeof candidate.code === "string"
      ? candidate.code
      : typeof candidate.errorCode === "string"
        ? candidate.errorCode
        : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";

    if (
      ["P1001", "P1002", "P1017", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH"]
        .includes(code)
      || /can't reach database server|econnrefused|econnreset|enotfound|etimedout|socket hang up|connection.*closed|connection terminated/i.test(message)
    ) {
      return true;
    }

    pending.push(candidate.cause);
  }

  return false;
}