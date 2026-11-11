import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createDomain: vi.fn(),
  listDomains: vi.fn(),
  verifyDomain: vi.fn(),
  isVercelConfigured: vi.fn(),
  DomainError: class extends Error {
    status = 400;
  },
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/public-online-store-service", () => ({
  createOrganizationOnlineStoreDomain: mocks.createDomain,
  isVercelDomainIntegrationConfigured: mocks.isVercelConfigured,
  listOrganizationOnlineStoreDomains: mocks.listDomains,
  verifyOrganizationOnlineStoreDomain: mocks.verifyDomain,
  OnlineStoreDomainError: mocks.DomainError,
}));

import { GET, POST } from "./route";
import { POST as verifyDomain } from "./[domainId]/verify/route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };

describe("POS online-store domain settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listDomains.mockResolvedValue([]);
    mocks.verifyDomain.mockResolvedValue({ id: "domain-1", hostname: "shop.example.com", status: "VERIFIED" });
    mocks.isVercelConfigured.mockReturnValue(false);
    mocks.createDomain.mockResolvedValue({ id: "domain-1", hostname: "shop.example.com" });
  });

  it("returns domain settings only after organization owner/admin authorization", async () => {
    const response = await GET(new Request("http://localhost/api/domains"), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_ONLINE_STORE",
    );
    expect(mocks.listDomains).toHaveBeenCalledWith("internal-org-1");
    await expect(response.json()).resolves.toMatchObject({
      domains: [],
      integrations: { vercel: { configured: false } },
    });
  });

  it("creates domains using the authorized internal organization and actor", async () => {
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: "Shop.Example.com", provider: "MANUAL" }),
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "MANAGE_POS_ONLINE_STORE",
    );
    expect(mocks.createDomain).toHaveBeenCalledWith({
      organization: { id: "internal-org-1" },
      actorId: "user-1",
      hostname: "Shop.Example.com",
      provider: "MANUAL",
    });
    await expect(response.json()).resolves.toMatchObject({
      domain: { hostname: "shop.example.com" },
    });
  });

  it("rejects non-member requests before querying or mutating domains", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: insufficient permissions."));
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: "shop.example.com", provider: "MANUAL" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.createDomain).not.toHaveBeenCalled();
    expect(mocks.listDomains).not.toHaveBeenCalled();
  });

  it("verifies a hostname only within the authorized internal organization", async () => {
    const response = await verifyDomain(
      new Request("http://localhost/api/domains/domain-1/verify", { method: "POST" }),
      { params: Promise.resolve({ organizationId: "public-org", domainId: "domain-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "MANAGE_POS_ONLINE_STORE",
    );
    expect(mocks.verifyDomain).toHaveBeenCalledWith({
      organization: { id: "internal-org-1" },
      actorId: "user-1",
      domainId: "domain-1",
    });
  });

  it("does not create domains when management permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: "shop.example.com", provider: "MANUAL" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.createDomain).not.toHaveBeenCalled();
  });
});
