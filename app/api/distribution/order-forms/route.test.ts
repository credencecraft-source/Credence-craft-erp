import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createDistributionOrderFormFromBookings: vi.fn(),
  deleteDistributionOrderForms: vi.fn(),
  listDistributionOrderForms: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-service", () => ({
  createDistributionOrderFormFromBookings: mocks.createDistributionOrderFormFromBookings,
  deleteDistributionOrderForms: mocks.deleteDistributionOrderForms,
  listDistributionOrderForms: mocks.listDistributionOrderForms,
}));

import { DELETE, GET } from "./route";

const deleteRequest = (body: unknown) => new Request("http://localhost/api/distribution/order-forms", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const getRequest = (query = "") => new Request(
  `http://localhost/api/distribution/order-forms?organizationId=public-org${query}`,
);

describe("distribution Order Form API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listDistributionOrderForms.mockResolvedValue({ orderForms: [], nextCursor: null });
    mocks.deleteDistributionOrderForms.mockResolvedValue([
      { id: "order-form-1", orderFormNo: "OF-1" },
    ]);
  });

  it("passes the opaque page cursor after organization authorization", async () => {
    const response = await GET(getRequest("&cursor=cursor-token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderForms: [], nextCursor: null });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listDistributionOrderForms).toHaveBeenCalledWith("internal-org-1", "cursor-token");
  });

  it("filters Order Forms without a quotation after organization authorization", async () => {
    const response = await GET(getRequest("&quotationStatus=not-created"));

    expect(response.status).toBe(200);
    expect(mocks.listDistributionOrderForms).toHaveBeenCalledWith(
      "internal-org-1",
      undefined,
      "not-created",
    );
  });

  it("filters Order Forms with a quotation after organization authorization", async () => {
    await GET(getRequest("&quotationStatus=created"));

    expect(mocks.listDistributionOrderForms).toHaveBeenCalledWith(
      "internal-org-1",
      undefined,
      "created",
    );
  });

  it("rejects unsupported Order Form quotation filters", async () => {
    const response = await GET(getRequest("&quotationStatus=invalid"));

    expect(response.status).toBe(400);
    expect(mocks.requireSessionUser).not.toHaveBeenCalled();
    expect(mocks.listDistributionOrderForms).not.toHaveBeenCalled();
  });

  it("deletes selected Order Forms only for authorized merchandising roles", async () => {
    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      orderFormIds: ["order-form-1"],
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deleted: [{ id: "order-form-1", orderFormNo: "OF-1" }],
    });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.deleteDistributionOrderForms).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["order-form-1"],
    );
  });

  it("rejects malformed or oversized selections before invoking deletion", async () => {
    const malformedResponse = await DELETE(deleteRequest({
      organizationId: "public-org",
      orderFormIds: ["order-form-1", 2],
    }));
    const oversizedResponse = await DELETE(deleteRequest({
      organizationId: "public-org",
      orderFormIds: Array.from({ length: 501 }, (_, index) => `order-form-${index}`),
    }));

    expect(malformedResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.deleteDistributionOrderForms).not.toHaveBeenCalled();
  });

  it("does not delete data when organization membership authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied."));

    const response = await DELETE(deleteRequest({
      organizationId: "other-org",
      orderFormIds: ["order-form-1"],
    }));

    expect(response.status).toBe(400);
    expect(mocks.deleteDistributionOrderForms).not.toHaveBeenCalled();
  });
});
