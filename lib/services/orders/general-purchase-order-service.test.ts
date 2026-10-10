import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  rawMaterialFindMany: vi.fn(),
  requestCreate: vi.fn(),
  requestFindFirst: vi.fn(),
  requestFindMany: vi.fn(),
  requestUpdateMany: vi.fn(),
  vendorFindFirst: vi.fn(),
  gstFindFirst: vi.fn(),
  hsnFindFirst: vi.fn(),
  auditEventCreate: vi.fn(),
  organizationFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  subCategoryFindMany: vi.fn(),
  uomFindMany: vi.fn(),
  taxProfileFindFirst: vi.fn(),
  gstFindMany: vi.fn(),
  counterUpsert: vi.fn(),
  purchaseOrderCreate: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
}));

const transaction = {
  masterRawMaterial: { findMany: mocks.rawMaterialFindMany },
  masterRawMaterialCategory: { findMany: mocks.categoryFindMany },
  masterRawMaterialSubCategory: { findMany: mocks.subCategoryFindMany },
  masterUom: { findMany: mocks.uomFindMany },
  masterVendor: { findFirst: mocks.vendorFindFirst },
  masterGst: { findFirst: mocks.gstFindFirst, findMany: mocks.gstFindMany },
  masterHsn: { findFirst: mocks.hsnFindFirst },
  organization: { findUnique: mocks.organizationFindUnique },
  organizationTaxProfile: { findFirst: mocks.taxProfileFindFirst },
  procurementDocumentCounter: { upsert: mocks.counterUpsert },
  generalPurchaseOrderRequest: {
    create: mocks.requestCreate,
    findFirst: mocks.requestFindFirst,
    findMany: mocks.requestFindMany,
    updateMany: mocks.requestUpdateMany,
  },
  purchaseOrder: { create: mocks.purchaseOrderCreate },
  auditEvent: { create: mocks.auditEventCreate },
};

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    purchaseOrder: { findFirst: mocks.purchaseOrderFindFirst },
  },
}));

import {
  approveGeneralPurchaseOrderPrice,
  createGeneralPurchaseOrder,
  createGeneralPurchaseOrderRequests,
  saveGeneralPurchaseOrderPrice,
} from "./general-purchase-order-service";

describe("general purchase-order request workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    mocks.rawMaterialFindMany.mockResolvedValue([{ id: "material-1" }]);
    mocks.requestCreate.mockResolvedValue({ id: "request-1" });
    mocks.requestFindFirst.mockResolvedValue({ id: "request-1" });
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.vendorFindFirst.mockResolvedValue({ id: "vendor-1" });
    mocks.gstFindFirst.mockResolvedValue(null);
    mocks.hsnFindFirst.mockResolvedValue(null);
    mocks.auditEventCreate.mockResolvedValue({});
    mocks.organizationFindUnique.mockResolvedValue({ gst_number: null, state: null, country: "IN" });
    mocks.categoryFindMany.mockResolvedValue([{ id: "category-1", raw_material_category: "Fabric" }]);
    mocks.subCategoryFindMany.mockResolvedValue([{ id: "subcategory-1", raw_material_sub_category: "Woven" }]);
    mocks.uomFindMany.mockResolvedValue([{ id: "uom-1", uom: "PCS" }]);
    mocks.taxProfileFindFirst.mockResolvedValue(null);
    mocks.gstFindMany.mockResolvedValue([]);
    mocks.counterUpsert.mockResolvedValue({ current_value: 4 });
    mocks.purchaseOrderCreate.mockResolvedValue({ id: "po-1", purchase_order_no: "PO-1" });
    mocks.purchaseOrderFindFirst.mockResolvedValue({
      id: "po-1",
      entity_id: null,
      entity: null,
      display_no: 4,
      purchase_order_no: "PO-1",
      status: "DRAFT",
      po_date: new Date("2026-10-03T00:00:00.000Z"),
      delivery_date: null,
      created_at: new Date("2026-10-03T00:00:00.000Z"),
      vendor: { id: "vendor-1", vendor: "Vendor", legacy_metadata: null },
      sources: [],
      lines: [{
        id: "line-1",
        raw_material: "Cotton",
        category: "Fabric",
        sub_category: "Woven",
        source_order_no: null,
        style_name: null,
        stock_uom: "PCS",
        masterPurchaseOrder: null,
        quantity: new Prisma.Decimal("2"),
        price: new Prisma.Decimal("10"),
        gst: new Prisma.Decimal("5"),
        tax_type: "IGST",
        cgst_rate: new Prisma.Decimal("0"),
        sgst_rate: new Prisma.Decimal("0"),
        igst_rate: new Prisma.Decimal("5"),
        cgst_amount: new Prisma.Decimal("0"),
        sgst_amount: new Prisma.Decimal("0"),
        igst_amount: new Prisma.Decimal("1"),
        hsn_code: "1234",
        total: new Prisma.Decimal("20"),
        master_purchase_order_id: null,
      }],
    });
  });

  it("rejects invalid quantities before writing a material request", async () => {
    await expect(createGeneralPurchaseOrderRequests(
      "org-1",
      [{ rawMaterialId: "material-1", quantity: "0" }],
      "Requester",
      "user-1",
    )).rejects.toThrow("Quantity must be greater than zero");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates requests only for active raw materials in the authorized organization", async () => {
    await createGeneralPurchaseOrderRequests(
      "org-1",
      [{ rawMaterialId: "material-1", quantity: "12.50" }],
      "Requester",
      "user-1",
    );

    expect(mocks.rawMaterialFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", id: { in: ["material-1"] }, is_active: true },
    }));
    const createData = mocks.requestCreate.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      organization_id: "org-1",
      raw_material_id: "material-1",
      created_by_user_id: "user-1",
    });
    expect(createData.quantity.toString()).toBe("12.5");
    expect(mocks.auditEventCreate).toHaveBeenCalledOnce();
  });

  it("rejects raw-material IDs that are not active in this organization", async () => {
    mocks.rawMaterialFindMany.mockResolvedValue([]);

    await expect(createGeneralPurchaseOrderRequests(
      "org-1",
      [{ rawMaterialId: "other-org-material", quantity: "1" }],
      "Requester",
      "user-1",
    )).rejects.toThrow("unavailable in this organization");

    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("rejects a vendor outside the organization before saving pricing", async () => {
    mocks.vendorFindFirst.mockResolvedValue(null);

    await expect(saveGeneralPurchaseOrderPrice(
      "org-1",
      "request-1",
      { vendorId: "other-org-vendor", vendorPrice: "10", quantity: "1", gstMasterId: "gst-1", hsnCode: "1234" },
      "user-2",
    )).rejects.toThrow("unavailable in this organization");

    expect(mocks.vendorFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "other-org-vendor", organization_id: "org-1", is_active: true },
    }));
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled();
  });

  it("requires saved vendor pricing before approving the price stage", async () => {
    mocks.requestFindFirst.mockResolvedValue(null);

    await expect(approveGeneralPurchaseOrderPrice(
      "org-1",
      "request-1",
      "Reviewer",
      "user-2",
    )).rejects.toThrow("Save a vendor and price before approving");

    expect(mocks.requestFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "request-1",
        organization_id: "org-1",
        status: "PENDING_PRICE_APPROVAL",
      }),
    }));
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled();
  });

  it("does not combine approved requests from different vendors into one PO", async () => {
    mocks.requestFindMany.mockResolvedValue([
      { id: "request-1", rawMaterial: { is_active: true }, vendor_id: "vendor-1", vendor: { is_active: true } },
      { id: "request-2", rawMaterial: { is_active: true }, vendor_id: "vendor-2", vendor: { is_active: true } },
    ]);

    await expect(createGeneralPurchaseOrder(
      "org-1",
      ["request-1", "request-2"],
      "Creator",
      "user-1",
      "2026-10-03",
    )).rejects.toThrow("one active vendor");

    expect(mocks.requestFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["request-1", "request-2"] },
        organization_id: "org-1",
        status: "PRICE_APPROVED",
        purchase_order_id: null,
      }),
    }));
  });

  it("creates a draft PO from approved, tenant-owned material requests and consumes them atomically", async () => {
    mocks.requestFindMany.mockResolvedValue([{
      id: "request-1",
      raw_material_id: "material-1",
      quantity: new Prisma.Decimal("2"),
      vendor_id: "vendor-1",
      vendor_price: new Prisma.Decimal("10"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "1234",
    }]);
    mocks.vendorFindFirst.mockResolvedValue({ id: "vendor-1", gst_number: null, registered_state: null });
    mocks.rawMaterialFindMany.mockResolvedValue([{
      id: "material-1",
      raw_material_name: "Cotton",
      raw_material_category_id: "category-1",
      raw_material_sub_category_id: "subcategory-1",
      stock_uom_id: "uom-1",
    }]);

    const order = await createGeneralPurchaseOrder(
      "org-1",
      ["request-1"],
      "Creator",
      "user-1",
      "2026-10-03",
    );

    expect(order.purchaseOrderNo).toBe("PO-4");
    const createdData = mocks.purchaseOrderCreate.mock.calls[0][0].data;
    expect(createdData).toMatchObject({
      organization_id: "org-1",
      vendor_id: "vendor-1",
      lines: { create: [expect.objectContaining({
        source_master_line_id: "request-1",
        raw_material: "Cotton",
        stock_uom: "PCS",
        hsn_code: "1234",
      })] },
    });
    expect(createdData.lines.create[0].total.toString()).toBe("20");
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["request-1"] },
        organization_id: "org-1",
        status: "PRICE_APPROVED",
        purchase_order_id: null,
      }),
      data: { status: "PO_CREATED", purchase_order_id: "po-1" },
    }));
  });
});
