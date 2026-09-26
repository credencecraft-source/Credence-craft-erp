export const DATABASE_UNAVAILABLE_MESSAGE =
  "We can't reach the database right now. Check your internet connection and try again.";

export function isDatabaseUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    code === "P1001" ||
    code === "P1002" ||
    /can't reach database server|econnrefused|enotfound|etimedout|connection.*closed/i.test(message)
  );
}