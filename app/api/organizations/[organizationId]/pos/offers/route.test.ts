import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createPosOffer: vi.fn(),
  listEligiblePosOffersByStock: vi.fn(),
  listPosOffers: vi.fn(),
  listPosOfferTargetOptions: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-offer-service", () => ({
  createPosOffer: mocks.createPosOffer,
  listEligiblePosOffersByStock: mocks.listEligiblePosOffersByStock,
  listPosOffers: mocks.listPosOffers,
  listPosOfferTargetOptions: mocks.listPosOfferTargetOptions,
  PosOfferConflictError: class PosOfferConflictError extends Error {},
  PosOfferValidationError: class PosOfferValidationError extends Error {},
}));

import { GET, POST } from "./route";

const routeContext = { params: Promise.resolve({ organizationId: "public-org-id" }) };

describe("POS offer API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "actor-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-id" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listPosOffers.mockResolvedValue({ offers: [], nextCursor: null });
    mocks.listEligiblePosOffersByStock.mockResolvedValue({ offersByStock: {}, offerLimitReached: false });
    mocks.listPosOfferTargetOptions.mockResolvedValue([]);
    mocks.createPosOffer.mockResolvedValue({
      id: "offer-1",
      offerCode: "SAVE10",
      offerType: "PERCENTAGE",
      scope: "ALL",
    });
  });

  it("scopes report reads to the authorized internal organization and page selection", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers?offerType=percentage&scope=all&limit=20"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "actor-1",
      "public-org-id",
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("actor-1", "internal-org-id", "VIEW_POS_OFFERS");
    expect(mocks.listPosOffers).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      offerType: "PERCENTAGE",
      scope: "ALL",
      limit: 20,
    }));
  });

  it("lists offers across all types and scopes for the authorized organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers?limit=50"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.listPosOffers).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      limit: 50,
    }));
    expect(mocks.listPosOffers.mock.calls.at(-1)?.[0]).not.toHaveProperty("offerType");
    expect(mocks.listPosOffers.mock.calls.at(-1)?.[0]).not.toHaveProperty("scope");
  });

  it("supports filtering by offer type across every scope", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers?offerType=percentage"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.listPosOffers).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      offerType: "PERCENTAGE",
    }));
    expect(mocks.listPosOffers.mock.calls.at(-1)?.[0]).not.toHaveProperty("scope");
  });

  it("returns tenant- and Entity-scoped item offers for the invoice date", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/organizations/public-org-id/pos/offers?eligibleStock=true&entityId=entity-1&invoiceDate=2026-11-07&stock=SKU%3Asku-1",
      ),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.listEligiblePosOffersByStock).toHaveBeenCalledWith({
      organizationId: "internal-org-id",
      entityId: "entity-1",
      invoiceDate: "2026-11-07",
      stockKeys: ["SKU:sku-1"],
    });
    expect(mocks.listPosOffers).not.toHaveBeenCalled();
  });

  it("creates an offer only after organization membership and manage permission authorization", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "request-1",
          offerCode: "SAVE10",
          name: "SAVE TEN",
          offerType: "percentage",
          scope: "all",
          status: "DRAFT",
          discountPercentage: "10",
          startsAt: "2026-11-06",
          targetIds: [],
        }),
      }),
      routeContext,
    );

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("actor-1", "internal-org-id", "MANAGE_POS_OFFERS");
    expect(mocks.createPosOffer).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      actorId: "actor-1",
      offerType: "PERCENTAGE",
      scope: "ALL",
      requestKey: "request-1",
    }));
  });

  it("rejects non-member access without calling the offer service", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: organization membership is inactive."));

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers?offerType=percentage&scope=all"),
      routeContext,
    );

    expect(response.status).toBe(403);
    expect(mocks.listPosOffers).not.toHaveBeenCalled();
  });

  it("does not list offers when the dedicated view permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers"),
      routeContext,
    );

    expect(response.status).toBe(403);
    expect(mocks.listPosOffers).not.toHaveBeenCalled();
  });

  it("does not create offers when the dedicated management permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await POST(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "request-1",
          offerCode: "SAVE10",
          name: "SAVE TEN",
          offerType: "percentage",
          scope: "all",
          status: "DRAFT",
          discountPercentage: "10",
          startsAt: "2026-11-06",
          targetIds: [],
        }),
      }),
      routeContext,
    );

    expect(response.status).toBe(403);
    expect(mocks.createPosOffer).not.toHaveBeenCalled();
  });
});
