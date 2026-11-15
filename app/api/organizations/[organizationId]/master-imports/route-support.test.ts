import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session-manager", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: vi.fn(() => false),
}));
vi.mock("@/lib/services/master-data/master-import-service", () => ({
  authorizeMasterImportRequest: vi.fn(),
  MasterImportServiceError: class MasterImportServiceError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));

import {
  masterImportErrorResponse,
  parseBoundedJson,
  parseOptionalBoundedJson,
} from "./route-support";

describe("master import route errors", () => {
  it("reports missing import tables as a safe migration readiness error", async () => {
    const response = masterImportErrorResponse({ code: "P2021" }, "list");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Master import database migration is pending. Apply the approved migration before using this feature.",
    });
  });

  it("reports a wrapped missing import table as a migration readiness error", async () => {
    const response = masterImportErrorResponse(
      new Error("Import operation failed", { cause: { code: "P2021" } }),
      "get-run",
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Master import database migration is pending. Apply the approved migration before using this feature.",
    });
  });

  describe("master import bounded JSON parsing", () => {
    it("accepts an empty stream for optional JSON", async () => {
      const request = new Request("http://localhost/api/plans", {
        method: "POST",
        body: "",
      });

      await expect(parseOptionalBoundedJson(request, 4 * 1024)).resolves.toBeUndefined();
    });

    it("accepts a missing stream for optional JSON", async () => {
      const request = new Request("http://localhost/api/plans", { method: "POST" });

      await expect(parseOptionalBoundedJson(request, 4 * 1024)).resolves.toBeUndefined();
    });

    it("parses non-empty optional JSON and rejects malformed JSON", async () => {
      const validRequest = new Request("http://localhost/api/plans", {
        method: "POST",
        body: JSON.stringify({ rowNumbers: [4, 9] }),
      });
      const invalidRequest = new Request("http://localhost/api/plans", {
        method: "POST",
        body: "{",
      });

      await expect(parseOptionalBoundedJson(validRequest, 4 * 1024))
        .resolves.toEqual({ rowNumbers: [4, 9] });
      await expect(parseOptionalBoundedJson(invalidRequest, 4 * 1024))
        .rejects.toThrow("Request body must contain valid JSON.");
    });

    it("keeps empty JSON invalid for routes requiring a body", async () => {
      const request = new Request("http://localhost/api/imports", {
        method: "POST",
        body: "",
      });

      await expect(parseBoundedJson(request, 4 * 1024))
        .rejects.toThrow("Request body must contain valid JSON.");
    });
  });

  it("reports a retryable upload timeout instead of a generic import error", async () => {
    const response = masterImportErrorResponse({ code: "P2028" }, "create");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The database took too long to start this upload. Please retry.",
    });
  });

  it("explains that a timed-out chunk can be resumed safely", async () => {
    const response = masterImportErrorResponse({ code: "P2028" }, "upload-chunk");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "This upload paused before saving the next chunk. Resume it to continue; previously saved chunks are retained.",
    });
  });

  it("explains that a timed-out staging operation can be retried without reuploading", async () => {
    const response = masterImportErrorResponse({ code: "P2028" }, "stage");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The workbook is saved, but staging timed out. Retry Stage workbook; saved master records were not changed.",
    });
  });
});
