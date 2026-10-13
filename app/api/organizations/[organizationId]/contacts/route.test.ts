import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createContact: vi.fn(),
  deactivateContacts: vi.fn(),
  deleteUnusedContacts: vi.fn(),
  listContacts: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/master-data/contact-master-service", () => ({
  createContact: mocks.createContact,
  deactivateContacts: mocks.deactivateContacts,
  deleteUnusedContacts: mocks.deleteUnusedContacts,
  listContacts: mocks.listContacts,
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
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({});
    mocks.listContacts.mockResolvedValue([]);
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
    expect(mocks.listContacts).not.toHaveBeenCalled();
  });

  it("does not expose contacts when the route organization is not a member organization", async () => {
    mocks.getOrganizationForUser.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/organizations/other-org/contacts"),
      { params: Promise.resolve({ organizationId: "other-org" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.listContacts).not.toHaveBeenCalled();
  });

  it("enforces the master-data permission before listing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: Insufficient permissions."));
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.listContacts).not.toHaveBeenCalled();
  });

  it("supports authorized bounded pagination for complete workbook exports", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts?limit=200&offset=400"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.listContacts).toHaveBeenCalledWith("internal-org-1", undefined, undefined, { skip: 400, take: 200 });
  });

  it("rejects invalid contact pagination", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/contacts?limit=500&offset=-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.listContacts).not.toHaveBeenCalled();
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
    expect(mocks.getOrganizationForUser).toHaveBeenCalledWith("workspace-user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("workspace-user-1", "internal-org-1", "MANAGE_MASTER_DATA");
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
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("workspace-user-1", "internal-org-1", "MANAGE_MASTER_DATA");
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
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: Insufficient permissions."));
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
