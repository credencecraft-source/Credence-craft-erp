import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  listContactLookupOptions: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/master-data/contact-master-service", () => ({
  listContactLookupOptions: mocks.listContactLookupOptions,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: () => false,
}));

import { GET } from "./route";

const routeContext = {
  params: Promise.resolve({ organizationId: "public-org" }),
};

describe("organization contact lookup API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listContactLookupOptions.mockResolvedValue([
      { id: "contact-1", code: "CT1", label: "ACME (CT1)" },
    ]);
  });

  it("returns only scoped contact labels to authorized booking roles", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts/lookup?limit=200&offset=0"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: "contact-1", code: "CT1", label: "ACME (CT1)" },
    ]);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.listContactLookupOptions).toHaveBeenCalledWith(
      "internal-org-1",
      undefined,
      { skip: 0, take: 200, search: "" },
    );
  });

  it("passes a bounded search term to the organization-scoped lookup", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts/lookup?limit=100&search=acme"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.listContactLookupOptions).toHaveBeenCalledWith(
      "internal-org-1",
      undefined,
      { skip: 0, take: 100, search: "acme" },
    );
  });

  it("rejects invalid pagination before listing contacts", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts/lookup?limit=500"),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.listContactLookupOptions).not.toHaveBeenCalled();
  });

  it("rejects oversized search input before listing contacts", async () => {
    const response = await GET(
      new Request(`http://localhost/api/organizations/public-org/contacts/lookup?search=${"a".repeat(101)}`),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.listContactLookupOptions).not.toHaveBeenCalled();
  });

  it("rejects unauthorized organization membership before listing contacts", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: organization not found."));

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts/lookup"),
      routeContext,
    );

    expect(response.status).toBe(403);
    expect(mocks.listContactLookupOptions).not.toHaveBeenCalled();
  });
});
