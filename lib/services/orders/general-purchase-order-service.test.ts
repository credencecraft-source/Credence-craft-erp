import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  rawMaterialFindMany: vi.fn(),
  rawMaterialUpdateMany: vi.fn(),
  entityFindFirst: vi.fn(),
  requestCreate: vi.fn(),
  requestFindFirst: vi.fn(),
  requestFindMany: vi.fn(),
  requestUpdateMany: vi.fn(),
  groupFindMany: vi.fn(),
  groupCreate: vi.fn(),
  groupUpdateMany: vi.fn(),
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
  masterEntity: { findFirst: mocks.entityFindFirst },
  masterRawMaterial: { findMany: mocks.rawMaterialFindMany, updateMany: mocks.rawMaterialUpdateMany },
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
  generalPurchaseOrderGroup: {
    findMany: mocks.groupFindMany,
    create: mocks.groupCreate,
    updateMany: mocks.groupUpdateMany,
  },
  masterState: { findFirst: vi.fn() },
  purchaseOrder: { create: mocks.purchaseOrderCreate },
  auditEvent: { create: mocks.auditEventCreate },
};

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    purchaseOrder: { findFirst: mocks.purchaseOrderFindFirst },
    generalPurchaseOrderRequest: {
      findFirst: mocks.requestFindFirst,
      findMany: mocks.requestFindMany,
    },
    generalPurchaseOrderGroup: {
      findFirst: vi.fn(),
      findMany: mocks.groupFindMany,
    },
  },
}));

import {
  approveGeneralPurchaseOrderPrice,
  createGeneralPurchaseOrder,
  createGeneralPurchaseOrderGroups,
  createGeneralPurchaseOrderFromGroups,
  createGeneralPurchaseOrderRequests,
  listGeneralPurchaseOrderGroups,
  listGeneralPurchaseOrderRequests,
  saveGeneralPurchaseOrderPrice,
} from "./general-purchase-order-service";

describe("general purchase-order request workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    mocks.rawMaterialFindMany.mockResolvedValue([{
      id: "material-1",
      is_asset: false,
      raw_material_category: {
        organization_id: "org-1",
        raw_material_type: { organization_id: "org-1", is_asset: false },
      },
    }]);
    mocks.rawMaterialUpdateMany.mockResolvedValue({ count: 1 });
    mocks.entityFindFirst.mockResolvedValue({
      id: "entity-1",
      organization_id: "org-1",
      entity_name: "Factory",
      is_active: true,
    });
    mocks.requestCreate.mockResolvedValue({ id: "request-1" });
    mocks.requestFindFirst.mockResolvedValue({ id: "request-1" });
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.groupUpdateMany.mockResolvedValue({ count: 1 });
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
      procurement_type: "GENERAL",
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
        general_purchase_order_group_id: null,
        generalPurchaseOrderGroup: null,
      }],
    });
  });

  it("rejects invalid quantities before writing a material request", async () => {
    await expect(createGeneralPurchaseOrderRequests(
      "org-1",
      [{ entityId: "entity-1", rawMaterialId: "material-1", quantity: "0" }],
      "Requester",
      "user-1",
    )).rejects.toThrow("Quantity must be greater than zero");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates requests only for active raw materials in the authorized organization", async () => {
    await createGeneralPurchaseOrderRequests(
      "org-1",
      [{ entityId: "entity-1", rawMaterialId: "material-1", quantity: "12.50" }],
      "Requester",
      "user-1",
    );

    expect(mocks.rawMaterialFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", id: { in: ["material-1"] }, is_active: true },
    }));
    const createData = mocks.requestCreate.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      organization_id: "org-1",
      entity_id: "entity-1",
      raw_material_id: "material-1",
      created_by_user_id: "user-1",
    });
    expect(createData.quantity.toString()).toBe("12.5");
    expect(mocks.auditEventCreate).toHaveBeenCalledOnce();
  });

  it("derives asset purchase status from the raw-material type", async () => {
    mocks.rawMaterialFindMany.mockResolvedValue([{
      id: "material-1",
      is_asset: true,
      raw_material_category: {
        organization_id: "org-1",
        raw_material_type: { organization_id: "org-1", is_asset: true },
      },
    }]);
    await createGeneralPurchaseOrderRequests(
      "org-1",
      [{ entityId: "entity-1", rawMaterialId: "material-1", quantity: "1" }],
      "Requester",
      "user-1",
    );

    expect(mocks.auditEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "CREATE_GENERAL_PO_REQUEST",
        details: expect.objectContaining({ is_asset: true }),
      }),
    }));
    expect(mocks.rawMaterialUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a General PO asset classification that differs from the type", async () => {
    mocks.rawMaterialFindMany.mockResolvedValue([{
      id: "material-1",
      is_asset: true,
      raw_material_category: {
        organization_id: "org-1",
        raw_material_type: { organization_id: "org-1", is_asset: true },
      },
    }]);

    await expect(createGeneralPurchaseOrderRequests(
      "org-1",
      [{ entityId: "entity-1", rawMaterialId: "material-1", quantity: "1", isAsset: false }],
      "Requester",
      "user-1",
    )).rejects.toThrow("controlled by the Raw Material Type");

    expect(mocks.rawMaterialUpdateMany).not.toHaveBeenCalled();
    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("rejects type and raw-material asset classification drift", async () => {
    mocks.rawMaterialFindMany.mockResolvedValue([{
      id: "material-1",
      is_asset: false,
      raw_material_category: {
        organization_id: "org-1",
        raw_material_type: { organization_id: "org-1", is_asset: true },
      },
    }]);

    await expect(createGeneralPurchaseOrderRequests(
      "org-1",
      [{ entityId: "entity-1", rawMaterialId: "material-1", quantity: "1" }],
      "Requester",
      "user-1",
    )).rejects.toThrow("out of sync with its type");

    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("rejects conflicting asset classifications for the same material in one request batch", async () => {
    await expect(createGeneralPurchaseOrderRequests(
      "org-1",
      [
        { entityId: "entity-1", rawMaterialId: "material-1", quantity: "1", isAsset: false },
        { entityId: "entity-1", rawMaterialId: "material-1", quantity: "1", isAsset: true },
      ],
      "Requester",
      "user-1",
    )).rejects.toThrow("one asset classification");

    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("rejects raw-material IDs that are not active in this organization", async () => {
    mocks.rawMaterialFindMany.mockResolvedValue([]);

    await expect(createGeneralPurchaseOrderRequests(
      "org-1",
      [{ entityId: "entity-1", rawMaterialId: "other-org-material", quantity: "1" }],
      "Requester",
      "user-1",
    )).rejects.toThrow("unavailable in this organization");

    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("loads paged General PO rows with tenant-checked relations in one query", async () => {
    mocks.requestFindMany.mockResolvedValue([{
      id: "request-1",
      status: "PENDING_PRICE_APPROVAL",
      raw_material_id: "material-1",
      quantity: new Prisma.Decimal("12.5"),
      vendor_id: "vendor-1",
      vendor_price: new Prisma.Decimal("4.25"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "1234",
      created_by: "Requester",
      created_at: new Date("2026-10-03T00:00:00.000Z"),
      approved_by: null,
      approved_at: null,
      purchase_order_id: null,
      rawMaterial: {
        id: "material-1",
        organization_id: "org-1",
        is_asset: false,
        raw_material_name: "Cotton",
        raw_material_category: { organization_id: "org-1", raw_material_category: "Fabric" },
        raw_material_sub_category: { organization_id: "org-1", raw_material_sub_category: "Woven" },
        stock_uom: { organization_id: "org-1", uom: "MTR" },
      },
      vendor: { id: "vendor-1", organization_id: "org-1", vendor: "Vendor" },
      purchaseOrder: null,
    }]);

    await expect(listGeneralPurchaseOrderRequests("org-1", ["PENDING_PRICE_APPROVAL"], { limit: 25, unGroupedOnly: true }))
      .resolves.toMatchObject({
        requests: [{
          id: "request-1",
          rawMaterial: "Cotton",
          category: "Fabric",
          subCategory: "Woven",
          stockUom: "MTR",
          vendor: { id: "vendor-1", name: "Vendor" },
          quantity: 12.5,
        }],
        nextCursor: null,
      });
    expect(mocks.requestFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-1",
        status: { in: ["PENDING_PRICE_APPROVAL"] },
        general_purchase_order_group_id: null,
      },
      take: 26,
      select: expect.objectContaining({
        rawMaterial: expect.objectContaining({
          select: expect.objectContaining({
            raw_material_category: expect.any(Object),
            raw_material_sub_category: expect.any(Object),
            stock_uom: expect.any(Object),
          }),
        }),
      }),
    }));
    expect(mocks.categoryFindMany).not.toHaveBeenCalled();
    expect(mocks.subCategoryFindMany).not.toHaveBeenCalled();
    expect(mocks.uomFindMany).not.toHaveBeenCalled();
  });

  it("loads one pending price request by tenant-scoped record ID", async () => {
    mocks.requestFindMany.mockResolvedValue([]);

    await listGeneralPurchaseOrderRequests(
      "org-1",
      ["PENDING_PRICE_APPROVAL"],
      { requestId: "request-1", limit: 1 },
    );

    expect(mocks.requestFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-1",
        id: "request-1",
        status: { in: ["PENDING_PRICE_APPROVAL"] },
      },
      take: 2,
    }));
  });

  it("filters General PO requests by the organization-owned raw material type asset classification", async () => {
    mocks.requestFindMany.mockResolvedValue([]);

    await listGeneralPurchaseOrderRequests("org-1", undefined, { isAsset: true });

    expect(mocks.requestFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        rawMaterial: {
          is: {
            organization_id: "org-1",
            raw_material_category: {
              is: {
                organization_id: "org-1",
                raw_material_type: {
                  is: { organization_id: "org-1", is_asset: true },
                },
              },
            },
          },
        },
      }),
    }));
  });

  it("filters General PO groups by the requested asset classification", async () => {
    mocks.groupFindMany.mockResolvedValue([]);

    await listGeneralPurchaseOrderGroups("org-1", undefined, { isAsset: true });

    expect(mocks.groupFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", is_asset: true },
    }));
  });

  it("rejects related master data outside the authorized organization", async () => {
    mocks.requestFindMany.mockResolvedValue([{
      id: "request-1",
      status: "PENDING_PRICE_APPROVAL",
      raw_material_id: "material-1",
      quantity: new Prisma.Decimal("1"),
      vendor_id: null,
      vendor_price: null,
      gst: null,
      hsn_code: null,
      created_by: null,
      created_at: new Date("2026-10-03T00:00:00.000Z"),
      approved_by: null,
      approved_at: null,
      purchase_order_id: null,
      rawMaterial: {
        id: "material-1",
        organization_id: "org-1",
        is_asset: false,
        raw_material_name: "Cotton",
        raw_material_category: { organization_id: "other-org", raw_material_category: "Fabric" },
        raw_material_sub_category: { organization_id: "org-1", raw_material_sub_category: "Woven" },
        stock_uom: { organization_id: "org-1", uom: "MTR" },
      },
      vendor: null,
      purchaseOrder: null,
    }]);

    await expect(listGeneralPurchaseOrderRequests("org-1"))
      .rejects.toThrow("unavailable organization master data");
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

  it("allows the request creator to approve their own General PO price", async () => {
    mocks.requestFindFirst.mockResolvedValue({
      id: "request-1",
      vendor_id: "vendor-1",
      vendor_price: new Prisma.Decimal("10"),
      created_by_user_id: "user-1",
    });

    await expect(approveGeneralPurchaseOrderPrice(
      "org-1",
      "request-1",
      "Requester",
      "user-1",
    )).resolves.toEqual({ id: "request-1", status: "PRICE_APPROVED" });

    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "request-1",
        organization_id: "org-1",
        status: "PENDING_PRICE_APPROVAL",
      }),
      data: expect.objectContaining({
        status: "PRICE_APPROVED",
        approved_by_user_id: "user-1",
      }),
    }));
  });

  it("does not combine Master Groups from different vendors into one PO", async () => {
    const makeGroup = (id: string, vendorId: string) => ({
      id,
      entity_id: "entity-1",
      vendor_id: vendorId,
      quantity: new Prisma.Decimal("2"),
      vendor_price: new Prisma.Decimal("10"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "1234",
      is_asset: true,
      raw_material: "Cotton",
      category: "Fabric",
      sub_category: "Woven",
      stock_uom: "PCS",
      entity: { organization_id: "org-1", is_active: true },
      vendor: { organization_id: "org-1", is_active: true, gst_number: null, registered_state: null, registered_state_id: null },
      rawMaterial: { organization_id: "org-1", is_active: true },
      requests: [{ id: `${id}-request` }],
    });
    mocks.groupFindMany.mockResolvedValue([makeGroup("group-1", "vendor-1"), makeGroup("group-2", "vendor-2")]);

    await expect(createGeneralPurchaseOrderFromGroups(
      "org-1",
      ["group-1", "group-2"],
      "Creator",
      "user-1",
      "2026-10-03",
    )).rejects.toThrow("same Entity and vendor");

    expect(mocks.groupFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["group-1", "group-2"] },
        organization_id: "org-1",
        status: "MASTER_GROUPED",
        purchaseOrderLine: null,
      }),
    }));
  });

  it("rejects asset and non-asset requests selected for the same Master Group batch", async () => {
    const makeRequest = (id: string, isAsset: boolean) => ({
      id,
      status: "PRICE_APPROVED",
      entity_id: "entity-1",
      general_purchase_order_group_id: null,
      raw_material_id: `material-${id}`,
      rawMaterial: { is_asset: isAsset },
    });
    mocks.requestFindMany.mockResolvedValue([
      makeRequest("asset", true),
      makeRequest("standard", false),
    ]);

    await expect(createGeneralPurchaseOrderGroups(
      "org-1",
      ["asset", "standard"],
      "Creator",
      "user-1",
    )).rejects.toThrow("Asset and non-asset requests must be grouped separately");

    expect(mocks.groupCreate).not.toHaveBeenCalled();
  });

  it("creates compatible Master Groups from price-approved requests", async () => {
    mocks.requestFindMany.mockResolvedValue([{
      id: "request-1",
      status: "PRICE_APPROVED",
      entity_id: "entity-1",
      general_purchase_order_group_id: null,
      raw_material_id: "material-1",
      quantity: new Prisma.Decimal("2"),
      vendor_id: "vendor-1",
      vendor_price: new Prisma.Decimal("10"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "1234",
      rawMaterial: {
        id: "material-1",
        organization_id: "org-1",
        is_active: true,
        is_asset: true,
        raw_material_name: "Cotton",
        raw_material_category: { organization_id: "org-1", raw_material_category: "Fabric" },
        raw_material_sub_category: { organization_id: "org-1", raw_material_sub_category: "Woven" },
        stock_uom: { organization_id: "org-1", uom: "PCS" },
      },
      vendor: { id: "vendor-1", organization_id: "org-1", is_active: true },
      entity: { id: "entity-1", organization_id: "org-1", is_active: true },
    }]);
    mocks.groupCreate.mockResolvedValue({ id: "group-1" });
    mocks.counterUpsert.mockResolvedValue({ current_value: 4 });

    await createGeneralPurchaseOrderGroups(
      "org-1",
      ["request-1"],
      "Creator",
      "user-1",
    );

    expect(mocks.groupCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-1",
        entity_id: "entity-1",
        vendor_id: "vendor-1",
        raw_material_id: "material-1",
        quantity: new Prisma.Decimal("2"),
        is_asset: true,
      }),
    }));
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["request-1"] }, organization_id: "org-1" }),
      data: { general_purchase_order_group_id: "group-1" },
    }));
  });

  it("assigns an Entity to legacy approved requests before grouping", async () => {
    mocks.requestFindMany.mockResolvedValue([{
      id: "legacy-request",
      status: "PRICE_APPROVED",
      entity_id: null,
      general_purchase_order_group_id: null,
      raw_material_id: "material-1",
      quantity: new Prisma.Decimal("2"),
      vendor_id: "vendor-1",
      vendor_price: new Prisma.Decimal("10"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "1234",
      rawMaterial: {
        id: "material-1",
        organization_id: "org-1",
        is_active: true,
        is_asset: true,
        raw_material_name: "Cotton",
        raw_material_category: { organization_id: "org-1", raw_material_category: "Fabric" },
        raw_material_sub_category: { organization_id: "org-1", raw_material_sub_category: "Woven" },
        stock_uom: { organization_id: "org-1", uom: "PCS" },
      },
      vendor: { id: "vendor-1", organization_id: "org-1", is_active: true },
      entity: null,
    }]);
    mocks.groupCreate.mockResolvedValue({ id: "group-1" });

    await createGeneralPurchaseOrderGroups("org-1", ["legacy-request"], "Creator", "user-1", "entity-1");

    expect(mocks.requestUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["legacy-request"] },
        organization_id: "org-1",
        entity_id: null,
      }),
      data: { entity_id: "entity-1" },
    }));
    expect(mocks.groupCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entity_id: "entity-1" }),
    }));
  });

  it("creates a draft General PO from approved, tenant-owned Master Groups and consumes them atomically", async () => {
    mocks.groupFindMany.mockResolvedValue([{
      id: "group-1",
      entity_id: "entity-1",
      vendor_id: "vendor-1",
      quantity: new Prisma.Decimal("2"),
      vendor_price: new Prisma.Decimal("10"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "1234",
      is_asset: true,
      raw_material: "Cotton",
      category: "Fabric",
      sub_category: "Woven",
      stock_uom: "PCS",
      entity: { organization_id: "org-1", is_active: true },
      vendor: { organization_id: "org-1", is_active: true, gst_number: null, registered_state: null, registered_state_id: null },
      rawMaterial: { organization_id: "org-1", is_active: true },
      requests: [{ id: "request-1" }],
    }]);

    const order = await createGeneralPurchaseOrder(
      "org-1",
      ["group-1"],
      "Creator",
      "user-1",
      "2026-10-03",
    );

    expect(order.purchaseOrderNo).toBe("PO-4");
    const createdData = mocks.purchaseOrderCreate.mock.calls[0][0].data;
    expect(createdData).toMatchObject({
      organization_id: "org-1",
      entity_id: "entity-1",
      vendor_id: "vendor-1",
      procurement_type: "GENERAL",
      is_asset_purchase: true,
      lines: { create: [expect.objectContaining({
        source_master_line_id: "group-1",
        general_purchase_order_group_id: "group-1",
        raw_material: "Cotton",
        stock_uom: "PCS",
        hsn_code: "1234",
      })] },
    });
    expect(createdData.lines.create[0].total.toString()).toBe("20");
    expect(mocks.groupUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["group-1"] }, organization_id: "org-1", status: "MASTER_GROUPED" },
      data: { status: "PO_CREATED" },
    }));
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["request-1"] },
        organization_id: "org-1",
        status: "PRICE_APPROVED",
        purchase_order_id: null,
        general_purchase_order_group_id: { in: ["group-1"] },
      }),
      data: { status: "PO_CREATED", purchase_order_id: "po-1" },
    }));
  });

  it("rejects asset and non-asset Master Groups for the same Purchase Order", async () => {
    const makeGroup = (id: string, isAsset: boolean) => ({
      id,
      entity_id: "entity-1",
      vendor_id: "vendor-1",
      is_asset: isAsset,
      entity: { organization_id: "org-1", is_active: true },
      vendor: { organization_id: "org-1", is_active: true, gst_number: null, registered_state: null, registered_state_id: null },
      rawMaterial: { organization_id: "org-1", is_active: true },
      requests: [],
    });
    mocks.groupFindMany.mockResolvedValue([
      makeGroup("asset-group", true),
      makeGroup("standard-group", false),
    ]);

    await expect(createGeneralPurchaseOrderFromGroups(
      "org-1",
      ["asset-group", "standard-group"],
      "Creator",
      "user-1",
      "2026-10-03",
    )).rejects.toThrow("Asset and non-asset Master Groups must be used in separate Purchase Orders");

    expect(mocks.purchaseOrderCreate).not.toHaveBeenCalled();
  });
});
