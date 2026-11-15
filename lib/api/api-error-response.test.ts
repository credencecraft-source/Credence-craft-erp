import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { apiErrorResponse, ApiError } from "./api-error-response";

describe("apiErrorResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps known Prisma constraint errors without exposing database diagnostics", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Prisma.PrismaClientKnownRequestError(
      "private database diagnostic",
      { code: "P2002", clientVersion: "test" },
    );

    const response = apiErrorResponse(error, { context: "test" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A record with the same value already exists.",
      code: "CONFLICT",
    });
  });

  it("preserves explicitly safe domain status and message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = apiErrorResponse(new ApiError("A valid organization is required.", 400, "INVALID_ORGANIZATION"), {
      context: "test",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A valid organization is required.",
      code: "INVALID_ORGANIZATION",
    });
  });

  it("sanitizes unknown errors and uses a server-error status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = apiErrorResponse(new Error("private implementation detail"), { context: "test" });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "An unexpected error occurred. Please try again.",
      code: "INTERNAL_ERROR",
    });
  });
});
