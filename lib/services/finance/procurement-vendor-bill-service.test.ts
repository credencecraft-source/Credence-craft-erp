import { FinanceDocumentStatus, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  validateSources: vi.fn(),
  ingest: vi.fn(),
  transaction: vi.fn(),
  billFindFirst: vi.fn(),
  billUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requirePermission,
}));
vi.mock("@/lib/services/finance/procurement-vendor-bill-validation", () => ({
  validateProcurementVendorBillSources: mocks.validateSources,
}));
vi.mock("@/lib/services/finance/finance-ingestion-service", () => ({
  ingestProcurementVendorBill: mocks.ingest,
}));

import { transitionProcurementVendorBill } from "@/lib/services/finance/procurement-vendor-bill-service";

describe("procurement vendor bill lifecycle", () => {
  const tx = {
    workspaceUser: { findUnique: vi.fn() },
    procurementVendorBill: {
      findFirst: mocks.billFindFirst,
      updateMany: mocks.billUpdateMany,
    },
    auditEvent: { create: mocks.auditCreate },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ id: "org-A" });
    mocks.validateSources.mockResolvedValue({ tax: { totalAmount: new Prisma.Decimal("118") } });
    mocks.billUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
    tx.workspaceUser.findUnique.mockResolvedValue({ id: "user-2", email: "approver@example.test" });
    mocks.transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx));
  });

  it("prevents the bill creator from approving their own submission", async () => {
    mocks.billFindFirst.mockResolvedValue({
      id: "bill-1",
      organization_id: "org-A",
      status: FinanceDocumentStatus.SUBMITTED,
      created_by_user_id: "user-2",
      document_number: "VB-1",
      entity_id: "entity-A",
      vendor_id: "vendor-A",
      purchase_order_id: "po-1",
      bill_date: new Date("2026-11-18"),
      lines: [],
    });

    await expect(transitionProcurementVendorBill("org-A", "user-2", "bill-1", "APPROVE"))
      .rejects.toThrow("cannot approve their own");

    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "user-2",
      "org-A",
      "APPROVE_PROCUREMENT_VENDOR_BILL",
    );
    expect(mocks.billUpdateMany).not.toHaveBeenCalled();
  });

  it("posts the approved bill through Central Finance in the same transaction", async () => {
    mocks.billFindFirst.mockResolvedValue({
      id: "bill-1",
      organization_id: "org-A",
      status: FinanceDocumentStatus.APPROVED,
      created_by_user_id: "creator-1",
      document_number: "VB-1",
      entity_id: "entity-A",
      vendor_id: "vendor-A",
      purchase_order_id: "po-1",
      bill_date: new Date("2026-11-18"),
      lines: [],
    });

    const result = await transitionProcurementVendorBill("org-A", "user-2", "bill-1", "POST");

    expect(result).toEqual({ id: "bill-1", status: FinanceDocumentStatus.POSTED });
    expect(mocks.ingest).toHaveBeenCalledWith(tx, { organizationId: "org-A", billId: "bill-1" });
    expect(mocks.billUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "bill-1",
        organization_id: "org-A",
        status: FinanceDocumentStatus.APPROVED,
      },
      data: expect.objectContaining({ status: FinanceDocumentStatus.POSTED }),
    }));
    expect(mocks.auditCreate).toHaveBeenCalled();
  });
});
