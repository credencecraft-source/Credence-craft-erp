import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getOrganizationForUserWithPermission: vi.fn(),
  createContact: vi.fn(),
  deactivateContacts: vi.fn(),
  deleteUnusedContacts: vi.fn(),
  listContacts: vi.fn(),
  listContactReportPage: vi.fn(),
  getContactRoleCounts: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUserWithPermission: mocks.getOrganizationForUserWithPermission,
}));
vi.mock("@/lib/services/master-data/contact-master-service", () => ({
  createContact: mocks.createContact,
  deactivateContacts: mocks.deactivateContacts,
  deleteUnusedContacts: mocks.deleteUnusedContacts,
  listContacts: mocks.listContacts,
  listContactReportPage: mocks.listContactReportPage,
  getContactRoleCounts: mocks.getContactRoleCounts,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: () => false,
}));

import { DELETE, GET, POST } from "./route";

describe("organization contact master API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "workspace-user-1", workspace_id: "workspace-1" });
    mocks.getOrganizationForUserWithPermission.mockResolvedValue({ id: "internal-org-1" });
    mocks.listContacts.mockResolvedValue([]);
    mocks.listContactReportPage.mockResolvedValue({ records: [], hasMore: false });
    mocks.getContactRoleCounts.mockResolvedValue({ total: 0, uncategorized: 0 });
    mocks.createContact.mockResolvedValue({ id: "contact-1", code: "ACME-01" });
    mocks.deactivateContacts.mockResolvedValue({ deactivatedCount: 2 });
    mocks.deleteUnusedContacts.mockResolvedValue({ deletedCount: 1, retainedContactCodes: [] });
  });

  it("rejects unauthenticated contact access", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.listContactReportPage).not.toHaveBeenCalled();
  });

  it("does not expose contacts when the route organization is not a member organization", async () => {
    mocks.getOrganizationForUserWithPermission.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/organizations/other-org/contacts"),
      { params: Promise.resolve({ organizationId: "other-org" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.listContactReportPage).not.toHaveBeenCalled();
  });

  it("enforces the master-data permission before listing", async () => {
    mocks.getOrganizationForUserWithPermission.mockRejectedValue(new Error("Access denied: Insufficient permissions."));
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.listContactReportPage).not.toHaveBeenCalled();
  });

  it("supports authorized bounded pagination and returns an exact total", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts?limit=100&offset=100&roleCode=DISTRIBUTOR"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.listContactReportPage).toHaveBeenCalledWith("internal-org-1", undefined, undefined, {
      skip: 100,
      take: 100,
      roleCode: "DISTRIBUTOR",
    });
    await expect(response.json()).resolves.toEqual({ records: [], hasMore: false });
  });

  it("returns exact tenant-scoped role summary counts", async () => {
    mocks.getContactRoleCounts.mockResolvedValue({
      total: 800,
      uncategorized: 772,
      CUSTOMER: 4,
      VENDOR: 4,
      AGENT: 4,
      DISTRIBUTOR: 5,
      DEALER: 27,
    });
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts?summary=true"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getContactRoleCounts).toHaveBeenCalledWith("internal-org-1");
    await expect(response.json()).resolves.toMatchObject({ total: 800, DISTRIBUTOR: 5 });
  });

  it("rejects invalid contact pagination", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts?limit=500&offset=-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.listContactReportPage).not.toHaveBeenCalled();
  });

  it("rejects unsupported role filters", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts?limit=100&roleCode=ADMIN"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.listContactReportPage).not.toHaveBeenCalled();
  });

  it("creates contacts using the authorized internal organization ID", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ACME-01", legalName: "Acme" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.getOrganizationForUserWithPermission).toHaveBeenCalledWith(
      "workspace-user-1",
      "public-org",
      "MANAGE_MASTER_DATA",
    );
    expect(mocks.createContact).toHaveBeenCalledWith("internal-org-1", "workspace-user-1", { code: "ACME-01", legalName: "Acme" });
  });

  it("rejects oversized or malformed request bodies without invoking the service", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/contacts", {
        method: "POST",
        body: "{invalid",
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.createContact).not.toHaveBeenCalled();
  });

  it("bulk-deactivates contacts through the authorized internal organization", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/organizations/public-org/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ["contact-1", "contact-2"] }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.deactivateContacts).toHaveBeenCalledWith("internal-org-1", "workspace-user-1", ["contact-1", "contact-2"]);
  });

  it("bulk-deletes only unused contacts through the authorized internal organization", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/organizations/public-org/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ["contact-1"], operation: "delete-unused" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteUnusedContacts).toHaveBeenCalledWith("internal-org-1", "workspace-user-1", ["contact-1"]);
    expect(mocks.deactivateContacts).not.toHaveBeenCalled();
  });

  it("reports transaction timeouts as a contact operation failure", async () => {
    mocks.deleteUnusedContacts.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Transaction timed out.",
      { code: "P2028", clientVersion: "test" },
    ));
    const response = await DELETE(
      new Request("http://localhost/api/organizations/public-org/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ["contact-1"], operation: "delete-unused" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "The contact operation took too long while data was being updated. Refresh and try again.",
    });
  });

  it("rejects invalid bulk contact payloads without invoking the service", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/organizations/public-org/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: "contact-1" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.deactivateContacts).not.toHaveBeenCalled();
    expect(mocks.deleteUnusedContacts).not.toHaveBeenCalled();
  });

  it("rejects unauthorized bulk contact operations before invoking the service", async () => {
    mocks.getOrganizationForUserWithPermission.mockRejectedValue(new Error("Access denied: Insufficient permissions."));
    const response = await DELETE(
      new Request("http://localhost/api/organizations/public-org/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ["contact-1"] }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.deactivateContacts).not.toHaveBeenCalled();
    expect(mocks.deleteUnusedContacts).not.toHaveBeenCalled();
  });
});
