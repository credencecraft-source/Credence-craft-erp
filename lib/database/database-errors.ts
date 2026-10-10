export const DATABASE_UNAVAILABLE_MESSAGE =
  "The ERP database is unavailable. Check the database service and endpoint, then try again.";

export function isDatabaseUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; errorCode?: unknown; message?: unknown };
  const code = typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.errorCode === "string"
      ? candidate.errorCode
      : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017" ||
    /can't reach database server|econnrefused|econnreset|enotfound|etimedout|socket hang up|connection.*closed|connection terminated/i.test(message)
  );
}