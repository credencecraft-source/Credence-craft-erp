import { describe, expect, it } from "vitest";

import { isDatabaseUnavailableError } from "./database-errors";

describe("database connection error classification", () => {
  it.each([
    { errorCode: "P1001" },
    { code: "P1002" },
    { code: "P1017" },
    { code: "ECONNRESET" },
    { message: "Can't reach database server at db.example.com:5432" },
    { message: "connect ECONNRESET" },
    { message: "Connection terminated unexpectedly" },
  ])("recognizes unavailable database errors: %o", (error) => {
    expect(isDatabaseUnavailableError(error)).toBe(true);
  });

  it("does not classify unrelated database errors as connection failures", () => {
    expect(isDatabaseUnavailableError({ code: "P2002", message: "Unique constraint failed" })).toBe(false);
    expect(isDatabaseUnavailableError(null)).toBe(false);
  });

  it("recognizes connection failures wrapped as an error cause", () => {
    const wrappedError = new Error("Database operation failed", {
      cause: Object.assign(new Error("Socket closed"), { code: "ECONNRESET" }),
    });

    expect(isDatabaseUnavailableError(wrappedError)).toBe(true);
  });

  it("handles circular causes without looping", () => {
    const error: { code: string; cause?: unknown } = { code: "P2002" };
    error.cause = error;

    expect(isDatabaseUnavailableError(error)).toBe(false);
  });
});