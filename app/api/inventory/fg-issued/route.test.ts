import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  listFgIssued: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/inventory/fg-issued-service", () => ({
  listFgIssued: mocks.listFgIssued,
}));

import { GET } from "./route";

describe("FG Issued route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listFgIssued.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 50 });
  });

  it("requires authentication before reading the register", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("Not authenticated."));

    const response = await GET(new Request("http://localhost/api/inventory/fg-issued?organizationId=public-org-1"));

    expect(response.status).toBe(401);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.listFgIssued).not.toHaveBeenCalled();
  });

  it("queries only the authorized internal organization with validated report filters", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/fg-issued?organizationId=public-org-1&dateFrom=2026-10-01&dateTo=2026-10-31&sourceType=POS_INVOICE&movement=REVERSAL&page=2&pageSize=25",
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org-1");
    expect(mocks.listFgIssued).toHaveBeenCalledWith("internal-org-1", {
      dateFrom: new Date("2026-10-01T00:00:00.000Z"),
      dateTo: new Date("2026-10-31T23:59:59.999Z"),
      sourceType: "POS_INVOICE",
      movement: "REVERSAL",
      page: 2,
      pageSize: 25,
    });
  });

  it("rejects malformed dates, ranges, enum values, and page bounds", async () => {
    const invalidQueries = [
      "dateFrom=2026-02-30",
      "dateFrom=2026-10-10&dateTo=2026-10-01",
      "sourceType=OTHER",
      "movement=RETURN",
      "page=0",
      "pageSize=101",
    ];

    for (const query of invalidQueries) {
      const response = await GET(new Request(
        `http://localhost/api/inventory/fg-issued?organizationId=public-org-1&${query}`,
      ));
      expect(response.status, query).toBe(400);
    }

    expect(mocks.listFgIssued).not.toHaveBeenCalled();
  });

  it("returns forbidden when organization membership verification fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: membership required."));

    const response = await GET(new Request("http://localhost/api/inventory/fg-issued?organizationId=other-org"));

    expect(response.status).toBe(403);
    expect(mocks.listFgIssued).not.toHaveBeenCalled();
  });

  it.each(["P2021", "P2022", "42P01", "42703"])(
    "returns a migration-specific response for schema error %s",
    async (code) => {
      const error = Object.assign(new Error("FG issue ledger schema is missing."), { code });
      mocks.listFgIssued.mockRejectedValue(error);
      const logError = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        const response = await GET(new Request(
          "http://localhost/api/inventory/fg-issued?organizationId=public-org-1",
        ));

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
          error: "FG Issued is unavailable until its database migration is deployed.",
        });
        expect(logError).toHaveBeenCalledWith("FG Issued API Error:", error);
      } finally {
        logError.mockRestore();
      }
    },
  );

  it("logs unexpected failures and returns a safe server error", async () => {
    const error = new Error("Unexpected database failure.");
    mocks.listFgIssued.mockRejectedValue(error);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await GET(new Request(
        "http://localhost/api/inventory/fg-issued?organizationId=public-org-1",
      ));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to load FG Issued records." });
      expect(logError).toHaveBeenCalledWith("FG Issued API Error:", error);
    } finally {
      logError.mockRestore();
    }
  });
});
