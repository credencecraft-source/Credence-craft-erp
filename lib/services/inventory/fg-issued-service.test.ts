import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FGMaterialIssueMovement,
  FGMaterialIssueSource,
  FGMaterialIssueStockType,
  Prisma,
} from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  reserveNumber: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    fGMaterialIssue: {
      findMany: mocks.findMany,
      count: mocks.count,
      findFirst: mocks.findFirst,
      create: mocks.create,
    },
  },
}));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveNumber,
}));

import { prisma } from "@/lib/database/prisma-client";
import { createFgMaterialIssue, listFgIssued } from "./fg-issued-service";

describe("listFgIssued", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "issue-1", issue_no: "FG-ISS-1" });
    mocks.reserveNumber.mockResolvedValue("FG-ISS-1");
  });

  it("returns an empty report when the authorized organization has no matching issues", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);

    await expect(listFgIssued("internal-org-1", {
      page: 1,
      pageSize: 50,
    })).resolves.toEqual({
      records: [],
      total: 0,
      page: 1,
      pageSize: 50,
      hasMore: false,
    });
  });

  it("uses an authorized organization, filters, bounded paging, and serializes line decimals", async () => {
    mocks.findMany.mockResolvedValue([{
      id: "issue-1",
      issue_no: "FG-ISS-1",
      source_type: "PACKING_LIST",
      movement: "ISSUE",
      packing_list_id: "packing-list-1",
      pos_invoice_id: null,
      source_reference: null,
      issued_by: "user-1",
      issued_at: new Date("2026-10-12T10:00:00.000Z"),
      packingList: { packing_list_no: "FG-PL-4" },
      posInvoice: null,
      lines: [{
        id: "issue-line-1",
        line_no: 1,
        stock_type: "SKU",
        item_code: "SKU-1",
        style_name: "Classic Shirt",
        article_no: "ART-1",
        size: "M",
        colour: "NAVY",
        quantity: new Prisma.Decimal("2.50"),
        uom_code: "PCS",
        stock_before: new Prisma.Decimal("8.00"),
        stock_after: new Prisma.Decimal("5.50"),
      }],
    }]);
    mocks.count.mockResolvedValue(1);

    const result = await listFgIssued("internal-org-1", {
      dateFrom: new Date("2026-10-01T00:00:00.000Z"),
      dateTo: new Date("2026-10-31T23:59:59.999Z"),
      sourceType: "PACKING_LIST",
      movement: "ISSUE",
      page: 2,
      pageSize: 25,
    });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        source_type: "PACKING_LIST",
        movement: "ISSUE",
        issued_at: {
          gte: new Date("2026-10-01T00:00:00.000Z"),
          lte: new Date("2026-10-31T23:59:59.999Z"),
        },
      }),
      skip: 25,
      take: 25,
    }));
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "internal-org-1" }),
    }));
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 25,
      hasMore: false,
      records: [{
        id: "issue-line-1",
        issueNo: "FG-ISS-1",
        sourceReference: "FG-PL-4",
        quantity: "2.50",
        stockBefore: "8.00",
        stockAfter: "5.50",
      }],
    });

  });

    it("writes tenant-scoped issue lines with idempotent numbers and stock snapshots", async () => {
      const result = await createFgMaterialIssue(prisma, {
        organizationId: "internal-org-1",
        sourceType: FGMaterialIssueSource.POS_INVOICE,
        movement: FGMaterialIssueMovement.ISSUE,
        posInvoiceId: "invoice-1",
        idempotencyKey: "pos-invoice:invoice-1:issue",
        sourceReference: "POS-1",
        issuedBy: "user-1",
        lines: [{
          stockType: FGMaterialIssueStockType.GENERAL,
          generalReceiptId: "receipt-1",
          styleName: "Classic Shirt",
          quantity: new Prisma.Decimal("2"),
          uomCode: "PCS",
          stockBefore: new Prisma.Decimal("8"),
          stockAfter: new Prisma.Decimal("6"),
        }],
      });

      expect(result).toEqual({ id: "issue-1", issue_no: "FG-ISS-1" });
      expect(mocks.reserveNumber).toHaveBeenCalledWith(
        "internal-org-1",
        "FG_MATERIAL_ISSUE",
        prisma,
      );
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "internal-org-1",
          issue_no: "FG-ISS-1",
          pos_invoice_id: "invoice-1",
          idempotency_key: "pos-invoice:invoice-1:issue",
          lines: {
            create: [expect.objectContaining({
              organization_id: "internal-org-1",
              general_receipt_id: "receipt-1",
              line_no: 1,
              quantity: new Prisma.Decimal("2"),
              stock_before: new Prisma.Decimal("8"),
              stock_after: new Prisma.Decimal("6"),
            })],
          },
        }),
      }));
    });

    it("returns an existing issue before reserving another reference", async () => {
      mocks.findFirst.mockResolvedValue({ id: "issue-existing", issue_no: "FG-ISS-1" });

      const result = await createFgMaterialIssue(prisma, {
        organizationId: "internal-org-1",
        sourceType: FGMaterialIssueSource.POS_INVOICE,
        movement: FGMaterialIssueMovement.ISSUE,
        posInvoiceId: "invoice-1",
        idempotencyKey: "pos-invoice:invoice-1:issue",
        issuedBy: "user-1",
        lines: [{
          stockType: FGMaterialIssueStockType.GENERAL,
          generalReceiptId: "receipt-1",
          styleName: "Classic Shirt",
          quantity: new Prisma.Decimal("2"),
          uomCode: "PCS",
          stockBefore: new Prisma.Decimal("8"),
          stockAfter: new Prisma.Decimal("6"),
        }],
      });

      expect(result).toEqual({ id: "issue-existing", issue_no: "FG-ISS-1" });
      expect(mocks.reserveNumber).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("rejects a snapshot that does not match the stock movement", async () => {
      await expect(createFgMaterialIssue(prisma, {
        organizationId: "internal-org-1",
        sourceType: FGMaterialIssueSource.POS_INVOICE,
        movement: FGMaterialIssueMovement.ISSUE,
        posInvoiceId: "invoice-1",
        idempotencyKey: "pos-invoice:invoice-1:issue",
        issuedBy: "user-1",
        lines: [{
          stockType: FGMaterialIssueStockType.GENERAL,
          generalReceiptId: "receipt-1",
          styleName: "Classic Shirt",
          quantity: new Prisma.Decimal("2"),
          uomCode: "PCS",
          stockBefore: new Prisma.Decimal("8"),
          stockAfter: new Prisma.Decimal("8"),
        }],
      })).rejects.toThrow("stock snapshots do not match");

      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.reserveNumber).not.toHaveBeenCalled();
  });
});
