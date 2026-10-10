import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getRmGrnVerification: vi.fn(),
  saveRmGrnVerification: vi.fn(),
  listRmGrnVerificationAllocations: vi.fn(),
  getRawMaterialPickSummariesForGroupedLines: vi.fn(),
  listPendingStockVerificationTasks: vi.fn(),
  getStockVerificationDetails: vi.fn(),
  saveStockGroupVerification: vi.fn(),
  MasterGroupRequiredError: class MasterGroupRequiredError extends Error {},
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/inventory/rm-grn-verification-service", () => ({
  getRmGrnVerification: mocks.getRmGrnVerification,
  saveRmGrnVerification: mocks.saveRmGrnVerification,
  listRmGrnVerificationAllocations: mocks.listRmGrnVerificationAllocations,
  listPendingStockVerificationTasks: mocks.listPendingStockVerificationTasks,
  getStockVerificationDetails: mocks.getStockVerificationDetails,
  saveStockGroupVerification: mocks.saveStockGroupVerification,
  MasterGroupRequiredError: mocks.MasterGroupRequiredError,
  InvalidActualCountError: class InvalidActualCountError extends Error {},
  RmGrnVerificationNotFoundError: class RmGrnVerificationNotFoundError extends Error {},
}));

vi.mock("@/lib/services/inventory/rm-stock-verification-service", () => ({
  getStockVerificationDetails: mocks.getStockVerificationDetails,
  listPendingStockVerificationTasks: mocks.listPendingStockVerificationTasks,
  saveStockGroupVerification: mocks.saveStockGroupVerification,
}));

vi.mock("@/lib/services/inventory/raw-material-outward-service", () => ({
  getRawMaterialPickSummariesForGroupedLines: mocks.getRawMaterialPickSummariesForGroupedLines,
}));

import { GET, POST } from "./route";

describe("RM GRN Verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
  });

  it("loads a line only after authenticating and resolving the route organization", async () => {
    mocks.getRmGrnVerification.mockResolvedValue({ receiptLineId: "line-1" });
    const response = await GET(new Request("http://localhost/api/inventory/grn-verifications?organizationId=public-org&receiptLineId=line-1"));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.getRmGrnVerification).toHaveBeenCalledWith("internal-org-1", "line-1");
  });

  it("loads the allocation register only for the authorized internal organization", async () => {
    mocks.listRmGrnVerificationAllocations.mockResolvedValue([{ id: "allocation-1" }]);
    const response = await GET(new Request("http://localhost/api/inventory/grn-verifications?organizationId=public-org&allocationRegister=true"));

    expect(response.status).toBe(200);
    expect(mocks.listRmGrnVerificationAllocations).toHaveBeenCalledWith("internal-org-1");
  });

  it("requests completed sample allocations for Style-wise Inventory", async () => {
    mocks.listRmGrnVerificationAllocations.mockResolvedValue([{
      id: "allocation-1",
      orderAllocations: [{ groupedPurchaseOrderLineId: "group-line-1", allocate: "10" }],
    }]);
    mocks.getRawMaterialPickSummariesForGroupedLines.mockResolvedValue({
      "group-line-1": { pickedQuantity: "4", balanceStock: "6" },
    });
    const response = await GET(new Request("http://localhost/api/inventory/grn-verifications?organizationId=public-org&allocationRegister=true&styleWiseInventory=true"));

    expect(response.status).toBe(200);
    expect(mocks.listRmGrnVerificationAllocations).toHaveBeenCalledWith(
      "internal-org-1",
      { styleWiseInventory: true },
    );
    expect(mocks.getRawMaterialPickSummariesForGroupedLines).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["group-line-1"],
    );
    await expect(response.json()).resolves.toMatchObject({
      allocations: [{
        orderAllocations: [{
          groupedPurchaseOrderLineId: "group-line-1",
          pickedQuantity: "4",
          balanceStock: "6",
        }],
      }],
    });
  });

  it("loads notified stock verification tasks for the authorized organization", async () => {
    mocks.listPendingStockVerificationTasks.mockResolvedValue([{ sourceGroupedPurchaseOrderId: "stock-group-1" }]);
    const response = await GET(new Request("http://localhost/api/inventory/grn-verifications?organizationId=public-org&verificationRegister=true"));

    expect(response.status).toBe(200);
    expect(mocks.listPendingStockVerificationTasks).toHaveBeenCalledWith("internal-org-1");
  });

  it("loads stock verification details by tenant-scoped grouped PO ID", async () => {
    mocks.getStockVerificationDetails.mockResolvedValue({ sourceGroupedPurchaseOrderId: "stock-group-1" });
    const response = await GET(new Request("http://localhost/api/inventory/grn-verifications?organizationId=public-org&stockGroupedPurchaseOrderId=stock-group-1"));

    expect(response.status).toBe(200);
    expect(mocks.getStockVerificationDetails).toHaveBeenCalledWith("internal-org-1", "stock-group-1");
  });

  it("requires an inventory-capable organization role before saving", async () => {
    mocks.saveRmGrnVerification.mockResolvedValue({ created: true, verifiedQuantity: "42" });
    const response = await POST(new Request("http://localhost/api/inventory/grn-verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", receiptLineId: "line-1", verifiedQuantity: "42", approvedQuantity: "40", allocations: [] }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "INVENTORY"]);
    expect(mocks.saveRmGrnVerification).toHaveBeenCalledWith("internal-org-1", "line-1", {
      verifiedQuantity: "42",
      approvedQuantity: "40",
      allocations: [],
    }, "user-1");
  });

  it("does not save when organization authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Organization access denied."));
    const response = await POST(new Request("http://localhost/api/inventory/grn-verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", receiptLineId: "line-1", verifiedQuantity: "42", approvedQuantity: "42", allocations: [] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.saveRmGrnVerification).not.toHaveBeenCalled();
  });

  it("submits a stock verification using the same Inventory role boundary", async () => {
    mocks.saveStockGroupVerification.mockResolvedValue({ created: true, approvedQuantity: "5" });
    const response = await POST(new Request("http://localhost/api/inventory/grn-verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", sourceGroupedPurchaseOrderId: "stock-group-1", verifiedQuantity: "6", approvedQuantity: "5" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "INVENTORY"]);
    expect(mocks.saveStockGroupVerification).toHaveBeenCalledWith("internal-org-1", "stock-group-1", {
      verifiedQuantity: "6",
      approvedQuantity: "5",
    }, "user-1");
  });
});