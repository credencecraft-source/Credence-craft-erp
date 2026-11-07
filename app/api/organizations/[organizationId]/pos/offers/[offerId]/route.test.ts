import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getPosOffer: vi.fn(),
  updatePosOffer: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/pos/pos-offer-service", () => ({
  getPosOffer: mocks.getPosOffer,
  updatePosOffer: mocks.updatePosOffer,
  PosOfferConflictError: class PosOfferConflictError extends Error {},
  PosOfferNotFoundError: class PosOfferNotFoundError extends Error {},
  PosOfferValidationError: class PosOfferValidationError extends Error {},
}));

import { GET, PATCH } from "./route";

const routeContext = {
  params: Promise.resolve({ organizationId: "public-org-id", offerId: "offer-1" }),
};

describe("POS offer detail API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "actor-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-id" });
    mocks.getPosOffer.mockResolvedValue({ id: "offer-1", offerCode: "SAVE10", targetIds: [] });
    mocks.updatePosOffer.mockResolvedValue({ id: "offer-1", offerCode: "SAVE12" });
  });

  it("authorizes offer detail reads and uses the internal organization ID", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers/offer-1"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.getPosOffer).toHaveBeenCalledWith("internal-org-id", "offer-1");
  });

  it("updates the selected offer only after organization authorization", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers/offer-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerCode: "SAVE12",
          name: "SAVE TWELVE",
          offerType: "percentage",
          scope: "all",
          status: "DRAFT",
          discountPercentage: "12",
          startsAt: "2026-11-06",
          targetIds: [],
        }),
      }),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.updatePosOffer).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      actorId: "actor-1",
      offerId: "offer-1",
      offerType: "PERCENTAGE",
      scope: "ALL",
      offerCode: "SAVE12",
    }));
  });

  it("does not fetch an offer for a user outside the organization", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: organization membership is inactive."));

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org-id/pos/offers/offer-1"),
      routeContext,
    );

    expect(response.status).toBe(403);
    expect(mocks.getPosOffer).not.toHaveBeenCalled();
  });
});
