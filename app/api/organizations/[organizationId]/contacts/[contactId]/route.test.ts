import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getContact: vi.fn(),
  updateContact: vi.fn(),
  deactivateContact: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/master-data/contact-master-service", () => ({
  getContact: mocks.getContact,
  updateContact: mocks.updateContact,
  deactivateContact: mocks.deactivateContact,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: () => false,
}));

import { DELETE, GET, PATCH } from "./route";

const routeContext = {
  params: Promise.resolve({ organizationId: "public-org", contactId: "foreign-contact" }),
};

describe("organization contact item API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "workspace-user-1", workspace_id: "workspace-1" });
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({});
    mocks.getContact.mockResolvedValue(null);
    mocks.updateContact.mockResolvedValue(null);
    mocks.deactivateContact.mockResolvedValue(null);
  });

  it("scopes contact reads by the authorized internal organization ID", async () => {
    const response = await GET(new Request("http://localhost/api/contact"), routeContext);

    expect(response.status).toBe(404);
    expect(mocks.getContact).toHaveBeenCalledWith("internal-org-1", "foreign-contact");
  });

  it("scopes updates and does not treat a cross-tenant contact ID as authorized", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: "Changed" }),
      }),
      routeContext,
    );

    expect(response.status).toBe(404);
    expect(mocks.updateContact).toHaveBeenCalledWith(
      "internal-org-1",
      "workspace-user-1",
      "foreign-contact",
      { legalName: "Changed" },
    );
  });

  it("soft-deactivates contacts instead of physically deleting them", async () => {
    const response = await DELETE(new Request("http://localhost/api/contact", { method: "DELETE" }), routeContext);

    expect(response.status).toBe(404);
    expect(mocks.deactivateContact).toHaveBeenCalledWith("internal-org-1", "workspace-user-1", "foreign-contact");
  });
});
