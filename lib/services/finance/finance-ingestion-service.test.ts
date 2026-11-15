import {
  FinanceDocumentStatus,
  FinanceDocumentType,
  FinanceSourceModule,
  FinanceSourceType,
  Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const { validateSources } = vi.hoisted(() => ({ validateSources: vi.fn() }));

vi.mock("@/lib/services/finance/procurement-vendor-bill-validation", () => ({
  validateProcurementVendorBillSources: validateSources,
}));

import {
  ingestProcurementVendorBill,
  ingestPosSale,
  type FinanceIngestionInput,
} from "@/lib/services/finance/finance-ingestion-service";

function input(organizationId: string): FinanceIngestionInput {
  return {
    organizationId,
    documentNumber: "INV-0001",
    documentDate: new Date("2026-11-18T00:00:00.000Z"),
    sourceId: "source-1",
    sourceDocumentNumber: "INV-0001",
    subSource: "POS_BARCODE_COUNTER",
    partyName: "CUSTOMER",
    subtotal: "100.00",
    taxableAmount: "100.00",
    cgstAmount: "9.00",
    sgstAmount: "9.00",
    igstAmount: "0.00",
    totalAmount: "118.00",
    lines: [{
      sourceLineId: "line-1",
      description: "ITEM",
      quantity: "1",
      unitRate: "100.00",
      taxableAmount: "100.00",
      gstRate: "18",
      cgstAmount: "9.00",
      sgstAmount: "9.00",
      igstAmount: "0.00",
      totalAmount: "118.00",
    }],
  };
}

function transactionClient(existing: {
  id: string;
  total_amount: Prisma.Decimal;
  source_document_number: string;
  status: FinanceDocumentStatus;
} | null) {
  const tx = {
    organizationMembership: { findFirst: vi.fn() },
    organizationRolePermission: { findMany: vi.fn() },
    procurementVendorBill: { findFirst: vi.fn() },
    centralFinanceTransaction: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "central-1" }),
    },
    workspaceUser: { findUnique: vi.fn() },
    financeSyncOutboxLog: { create: vi.fn().mockResolvedValue({ id: "outbox-1" }) },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  return tx;
}

describe("central finance ingestion", () => {
  it("scopes source idempotency to the internal organization ID", async () => {
    const tx = transactionClient(null);

    await ingestPosSale(tx as unknown as Prisma.TransactionClient, input("org-internal-A"));

    expect(tx.centralFinanceTransaction.findUnique).toHaveBeenCalledWith({
      where: {
        organization_id_source_type_source_id: {
          organization_id: "org-internal-A",
          source_type: FinanceSourceType.POS_SALES_INVOICE,
          source_id: "source-1",
        },
      },
      select: {
        id: true,
        total_amount: true,
        source_document_number: true,
        status: true,
      },
    });
    expect(tx.centralFinanceTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "org-internal-A",
          total_amount: new Prisma.Decimal("118.00"),
        }),
      }),
    );
  });

  it("returns an existing identical posted source without writing a duplicate", async () => {
    const tx = transactionClient({
      id: "central-existing",
      total_amount: new Prisma.Decimal("118.00"),
      source_document_number: "INV-0001",
      status: FinanceDocumentStatus.POSTED,
    });

    const result = await ingestPosSale(tx as unknown as Prisma.TransactionClient, input("org-internal-A"));

    expect(result).toEqual({ id: "central-existing", duplicate: true });
    expect(tx.centralFinanceTransaction.create).not.toHaveBeenCalled();
    expect(tx.financeSyncOutboxLog.create).not.toHaveBeenCalled();
  });

  it("revalidates and ingests an approved PO/GRN vendor bill into the tenant central ledger", async () => {
    const tx = transactionClient(null);
    const decimal = (value: string) => new Prisma.Decimal(value);
    const validatedLine = {
      sourceLineId: "grn-line-1",
      purchaseOrderLineId: "po-line-1",
      inventoryReceiptLineId: "grn-line-1",
      description: "FABRIC",
      unitOfMeasure: "MTR",
      quantity: decimal("1"),
      unitRate: decimal("100"),
      taxableAmount: decimal("100"),
      hsnCode: "5208",
      gstRate: decimal("18"),
      cgstAmount: decimal("9"),
      sgstAmount: decimal("9"),
      igstAmount: decimal("0"),
      totalAmount: decimal("118"),
    };
    tx.procurementVendorBill.findFirst.mockResolvedValue({
      id: "bill-1",
      organization_id: "org-internal-A",
      status: FinanceDocumentStatus.APPROVED,
      entity_id: "entity-1",
      vendor_id: "vendor-1",
      purchase_order_id: "po-1",
      document_number: "VB-1",
      vendor_invoice_number: "VENDOR-INV-1",
      bill_date: new Date("2026-11-14T00:00:00.000Z"),
      entity_name_snapshot: "ENTITY",
      entity_gstin_snapshot: "27AAAAA0000A1Z5",
      vendor_name_snapshot: "VENDOR",
      vendor_gstin_snapshot: "27BBBBB0000B1Z5",
      created_by_user_id: null,
      created_by_email: "buyer@example.test",
      subtotal: decimal("100"),
      cgst_amount: decimal("9"),
      sgst_amount: decimal("9"),
      igst_amount: decimal("0"),
      total_amount: decimal("118"),
      lines: [{
        ...validatedLine,
        line_number: 1,
        purchase_order_line_id: "po-line-1",
        inventory_receipt_line_id: "grn-line-1",
        unit_rate: decimal("100"),
        taxable_amount: decimal("100"),
        gst_rate: decimal("18"),
        cgst_amount: decimal("9"),
        sgst_amount: decimal("9"),
        igst_amount: decimal("0"),
        total_amount: decimal("118"),
      }],
    });
    validateSources.mockResolvedValue({
      tax: {
        taxableAmount: decimal("100"),
        cgstAmount: decimal("9"),
        sgstAmount: decimal("9"),
        igstAmount: decimal("0"),
        totalAmount: decimal("118"),
        placeOfSupplyStateCode: "27",
      },
      lines: [validatedLine],
    });

    const result = await ingestProcurementVendorBill(
      tx as unknown as Prisma.TransactionClient,
      { organizationId: "org-internal-A", billId: "bill-1" },
    );

    expect(result).toEqual({ id: "central-1", duplicate: false });
    expect(tx.procurementVendorBill.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bill-1", organization_id: "org-internal-A" },
    }));
    expect(validateSources).toHaveBeenCalledWith(tx, expect.objectContaining({
      organizationId: "org-internal-A",
      purchaseOrderId: "po-1",
      billIdToExclude: "bill-1",
    }));
    expect(tx.centralFinanceTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-internal-A",
        document_type: FinanceDocumentType.PURCHASE_INVOICE,
        source_module: FinanceSourceModule.PROCUREMENT,
        source_type: FinanceSourceType.PROCUREMENT_VENDOR_BILL,
        total_amount: decimal("118"),
      }),
    }));
    expect(tx.financeSyncOutboxLog.create).toHaveBeenCalledOnce();
  });
});
