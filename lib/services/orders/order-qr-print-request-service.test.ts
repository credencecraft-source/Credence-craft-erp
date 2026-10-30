import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    $executeRaw: vi.fn(),
    merchandisingOrder: { findFirst: vi.fn(), findMany: vi.fn() },
    merchandisingOrderQrTemplate: { findFirst: vi.fn() },
    designDevelopmentPageSetupTemplate: { findFirst: vi.fn() },
    merchandisingOrderQrPrintRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(),
      merchandisingOrderQrPrintRequest: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));

import {
  advanceOrderQrPrintRequestStatus,
  createOrderQrPrintRequest,
  deletePendingOrderQrPrintRequests,
  getOrderQrPrintRequest,
  listOrderQrPrintRequests,
} from "./order-qr-print-request-service";

const pageSetupSnapshot = {
  id: "setup-1",
  name: "A3 STOCK",
  paperSize: "A3",
  orientation: "LANDSCAPE",
  stickerWidthMm: 50,
  stickerLengthMm: 30,
  marginTopMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 15,
  marginRightMm: 15,
  horizontalGapMm: 3,
  verticalGapMm: 4,
} as const;

describe("order QR print request service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        callback(mocks.transaction),
    );
    mocks.transaction.merchandisingOrder.findFirst.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-1",
      entityName: null,
      category: null,
      subCategory: null,
      season: null,
      article: null,
      styleName: "STYLE-1",
      colors: null,
      buyer: "BUYER-1",
      brand: null,
      sizeGroup: null,
      orderQty: 20,
      deliveryDate: null,
    });
    mocks.transaction.merchandisingOrderQrTemplate.findFirst.mockResolvedValue({
      name: "BASIC",
      field_keys: ["orderNo", "buyer"],
      qr_field_key: "orderNo",
      display_fields: ["orderNo", "buyer"],
      display_field_styles: {
        styles: {
          orderNo: { fontSize: 14, bold: true, underline: false, color: "#111827" },
          buyer: { fontSize: 10, bold: false, underline: true, color: "#FF0000" },
        },
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            buyer: { x: 44, y: 36 },
          },
          printerType: "LASER",
          pdfPaperSize: "A4_LANDSCAPE",
        },
        pageSetup: pageSetupSnapshot,
      },
      qr_size: 320,
      sticker_width_mm: 60,
      sticker_length_mm: 40,
    });
    mocks.transaction.merchandisingOrderQrPrintRequest.create.mockResolvedValue({
      id: "request-1",
      order_id: "order-1",
      order_no: "ORD-1",
      request_type: "PRINT",
      status: "PENDING",
      template_name: "BASIC",
      qr_field_key: "orderNo",
      display_fields: ["orderNo", "buyer"],
      display_values: {
        orderNo: "ORD-1",
        buyer: "BUYER-1",
        __printQuantity: 20,
        __pageSetup: pageSetupSnapshot,
      },
      display_field_styles: {
        styles: {
          orderNo: { fontSize: 14, bold: true, underline: false, color: "#111827" },
          buyer: { fontSize: 10, bold: false, underline: true, color: "#FF0000" },
        },
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            buyer: { x: 44, y: 36 },
          },
          printerType: "LASER",
          pdfPaperSize: "A4_LANDSCAPE",
        },
        pageSetup: pageSetupSnapshot,
      },
      qr_size: 320,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
      qr_payload: "{\"Order Number\":\"ORD-1\"}",
      requested_at: new Date("2026-10-27T00:00:00.000Z"),
      updated_at: new Date("2026-10-27T00:00:00.000Z"),
    });
  });

  it("builds a request snapshot from an order and template in the authorized organization", async () => {
    const result = await createOrderQrPrintRequest("internal-org-1", "user-1", {
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
    });

    expect(result).toMatchObject({
      success: true,
      request: {
        id: "request-1",
        orderNo: "ORD-1",
        templateName: "BASIC",
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "buyer"],
        displayValues: { orderNo: "ORD-1", buyer: "BUYER-1" },
        printQuantity: 20,
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            buyer: { x: 44, y: 36 },
          },
          printerType: "LASER",
          pdfPaperSize: "A4_LANDSCAPE",
        },
        qrSize: 320,
        pageSetup: pageSetupSnapshot,
        stickerWidthMm: 50,
        stickerLengthMm: 30,
      },
    });
    expect(mocks.transaction.$executeRaw).toHaveBeenCalled();
    expect(mocks.transaction.merchandisingOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "order-1" },
      }),
    );
    expect(mocks.transaction.merchandisingOrderQrTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "template-1" },
      }),
    );
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "internal-org-1",
          requested_by: "user-1",
          field_keys: ["orderNo", "buyer"],
          qr_field_key: "orderNo",
          display_fields: ["orderNo", "buyer"],
          display_values: {
            orderNo: "ORD-1",
            buyer: "BUYER-1",
            __printQuantity: 20,
            __pageSetup: pageSetupSnapshot,
          },
          display_field_styles: {
            styles: {
              orderNo: { fontSize: 14, bold: true, underline: false, color: "#111827" },
              buyer: { fontSize: 10, bold: false, underline: true, color: "#FF0000" },
            },
            layout: {
              qr: { x: 3, y: 25 },
              fields: {
                orderNo: { x: 44, y: 16 },
                buyer: { x: 44, y: 36 },
              },
              printerType: "LASER",
              pdfPaperSize: "A4_LANDSCAPE",
            },
            pageSetup: pageSetupSnapshot,
          },
          qr_size: 320,
          sticker_width_mm: 50,
          sticker_length_mm: 30,
          qr_payload: JSON.stringify({ "Order Number": "ORD-1" }),
        }),
      }),
    );
  });

  it("creates one tenant-scoped batch request with an individual QR snapshot per order", async () => {
    const firstOrder = {
      id: "order-1",
      orderNo: "ORD-1",
      entityName: null,
      category: null,
      subCategory: null,
      season: null,
      article: null,
      styleName: "STYLE-1",
      colors: null,
      buyer: "BUYER-1",
      brand: null,
      sizeGroup: null,
      orderQty: 20,
      deliveryDate: null,
    };
    const secondOrder = {
      ...firstOrder,
      id: "order-2",
      orderNo: "ORD-2",
      styleName: "STYLE-2",
      buyer: "BUYER-2",
    };
    mocks.transaction.merchandisingOrder.findMany.mockResolvedValue([firstOrder, secondOrder]);

    await expect(createOrderQrPrintRequest("internal-org-1", "user-1", {
      bulkOrders: [
        { orderId: "order-1", quantity: 2 },
        { orderId: "order-2", quantity: 3 },
      ],
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "BULK_QTY",
    })).resolves.toMatchObject({ success: true });

    expect(mocks.transaction.merchandisingOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "internal-org-1",
          id: { in: ["order-1", "order-2"] },
        },
      }),
    );
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "internal-org-1",
          order_id: "order-1",
          order_no: "BULK: 2 ORDERS",
          display_values: expect.objectContaining({
            __printQuantity: 5,
            __displayFields: ["orderNo", "buyer"],
            __bulkItems: [
              {
                orderId: "order-1",
                orderNo: "ORD-1",
                styleName: "STYLE-1",
                quantity: 2,
                qrPayload: JSON.stringify({ "Order Number": "ORD-1" }),
                displayValues: { orderNo: "ORD-1", buyer: "BUYER-1" },
              },
              {
                orderId: "order-2",
                orderNo: "ORD-2",
                styleName: "STYLE-2",
                quantity: 3,
                qrPayload: JSON.stringify({ "Order Number": "ORD-2" }),
                displayValues: { orderNo: "ORD-2", buyer: "BUYER-2" },
              },
            ],
          }),
          qr_payload: JSON.stringify([
            { orderNo: "ORD-1", qrPayload: JSON.stringify({ "Order Number": "ORD-1" }) },
            { orderNo: "ORD-2", qrPayload: JSON.stringify({ "Order Number": "ORD-2" }) },
          ]),
        }),
      }),
    );
  });

  it("rejects a bulk request if any selected order is missing from the authorized organization", async () => {
    mocks.transaction.merchandisingOrder.findMany.mockResolvedValue([
      { id: "order-1", orderNo: "ORD-1" },
    ]);

    await expect(createOrderQrPrintRequest("internal-org-1", "user-1", {
      bulkOrders: [
        { orderId: "order-1", quantity: 1 },
        { orderId: "order-from-other-org", quantity: 1 },
      ],
      templateId: "template-1",
      requestType: "PRINT",
    })).resolves.toEqual({ success: false, reason: "ORDER_NOT_FOUND" });
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).not.toHaveBeenCalled();
  });

  it("does not create a request when the selected template is outside the authorized organization", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.findFirst.mockResolvedValue(null);

    await expect(createOrderQrPrintRequest("internal-org-1", "user-1", {
      orderId: "order-1",
      templateId: "other-org-template",
      requestType: "DOWNLOAD",
    })).resolves.toEqual({ success: false, reason: "TEMPLATE_NOT_FOUND" });
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).not.toHaveBeenCalled();
  });

  it("requires a Page Setup saved on the selected template", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.findFirst.mockResolvedValue({
      name: "LEGACY TEMPLATE",
      field_keys: ["orderNo"],
      qr_field_key: "orderNo",
      display_fields: ["orderNo"],
      display_field_styles: {},
      qr_size: 256,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
    });

    await expect(createOrderQrPrintRequest("internal-org-1", "user-1", {
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
    })).resolves.toEqual({ success: false, reason: "PAGE_SETUP_REQUIRED" });
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).not.toHaveBeenCalled();
  });

  it("does not substitute order number when the selected QR field is empty", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.findFirst.mockResolvedValue({
      name: "BRAND QR",
      field_keys: ["brand"],
      qr_field_key: "brand",
      display_fields: [],
      display_field_styles: { pageSetup: pageSetupSnapshot },
      qr_size: 256,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
    });

    await expect(createOrderQrPrintRequest("internal-org-1", "user-1", {
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
    })).resolves.toEqual({ success: false, reason: "QR_FIELD_VALUE_MISSING" });
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).not.toHaveBeenCalled();
  });

  it("snapshots one piece for PCS requests when the template encodes order quantity", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.findFirst.mockResolvedValue({
      name: "PCS LABEL",
      field_keys: ["orderQty"],
      qr_field_key: "orderQty",
      display_fields: ["orderQty"],
      display_field_styles: { pageSetup: pageSetupSnapshot },
      qr_size: 256,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
    });

    await createOrderQrPrintRequest("internal-org-1", "user-1", {
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "PCS",
    });

    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          display_values: {
            orderQty: "1",
            __printQuantity: 1,
            __pageSetup: pageSetupSnapshot,
          },
          qr_payload: JSON.stringify({ "Order Quantity": "1" }),
        }),
      }),
    );
  });

  it("snapshots the user-entered quantity for Bulk Qty requests", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.findFirst.mockResolvedValue({
      name: "BULK LABEL",
      field_keys: ["orderQty"],
      qr_field_key: "orderQty",
      display_fields: ["orderQty"],
      display_field_styles: { pageSetup: pageSetupSnapshot },
      qr_size: 256,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
    });

    await createOrderQrPrintRequest("internal-org-1", "user-1", {
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "BULK_QTY",
      bulkQuantity: 75,
    });

    expect(mocks.transaction.merchandisingOrderQrPrintRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          display_values: {
            orderQty: "75",
            __printQuantity: 75,
            __pageSetup: pageSetupSnapshot,
          },
          qr_payload: JSON.stringify({ "Order Quantity": "75" }),
        }),
      }),
    );
  });

  it("lists only the requested organization and returns the saved output snapshot", async () => {
    mocks.prisma.merchandisingOrderQrPrintRequest.findMany.mockResolvedValue([
      {
        id: "request-1",
        order_id: "order-1",
        order_no: "ORD-1",
        request_type: "DOWNLOAD",
        status: "PENDING",
        template_name: "BASIC",
        qr_size: 320,
        qr_field_key: "orderNo",
        display_fields: ["orderNo", "buyer"],
        display_values: { orderNo: "ORD-1", buyer: "BUYER-1", __printQuantity: 75 },
        display_field_styles: {},
        sticker_width_mm: 60,
        sticker_length_mm: 40,
        qr_payload: "{\"Order Number\":\"ORD-1\"}",
        requested_at: new Date("2026-10-27T00:00:00.000Z"),
        updated_at: new Date("2026-10-27T00:00:00.000Z"),
      },
    ]);

    await expect(listOrderQrPrintRequests("internal-org-1")).resolves.toMatchObject([
      {
        id: "request-1",
        qrPayload: "{\"Order Number\":\"ORD-1\"}",
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "buyer"],
        displayValues: { orderNo: "ORD-1", buyer: "BUYER-1" },
        printQuantity: 75,
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            buyer: { x: 44, y: 36 },
          },
          printerType: "BARCODE",
          pdfPaperSize: "A4_AUTO",
        },
        qrSize: 320,
        stickerWidthMm: 60,
        stickerLengthMm: 40,
      },
    ]);
    expect(mocks.prisma.merchandisingOrderQrPrintRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: "internal-org-1" }, take: 200 }),
    );
  });

  it("loads a single request using both its ID and authorized organization ID", async () => {
    mocks.prisma.merchandisingOrderQrPrintRequest.findFirst.mockResolvedValue({
      id: "request-1",
      order_id: "order-1",
      order_no: "ORD-1",
      request_type: "PRINT",
      status: "PENDING",
      template_name: "BASIC",
      qr_size: 256,
      qr_field_key: "orderNo",
      display_fields: ["orderNo"],
      display_values: { orderNo: "ORD-1", __printQuantity: 3 },
      display_field_styles: {},
      sticker_width_mm: 50,
      sticker_length_mm: 30,
      qr_payload: "{\"Order Number\":\"ORD-1\"}",
      requested_at: new Date("2026-10-27T00:00:00.000Z"),
      updated_at: new Date("2026-10-27T00:00:00.000Z"),
    });

    await expect(getOrderQrPrintRequest("internal-org-1", "request-1")).resolves.toMatchObject({
      id: "request-1",
      printQuantity: 3,
      displayValues: { orderNo: "ORD-1" },
    });
    expect(mocks.prisma.merchandisingOrderQrPrintRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "request-1" },
      }),
    );
  });

  it("maps the saved per-order batch snapshot for the Design and Development report", async () => {
    mocks.prisma.merchandisingOrderQrPrintRequest.findMany.mockResolvedValue([{
      id: "request-bulk",
      order_id: "order-1",
      order_no: "BULK: 2 ORDERS",
      request_type: "PRINT",
      status: "PENDING",
      template_name: "BASIC",
      qr_size: 256,
      qr_field_key: "orderNo",
      display_fields: ["orderNo", "buyer"],
      display_values: {
        __printQuantity: 5,
        __displayFields: ["orderNo", "buyer"],
        __bulkItems: [
          {
            orderId: "order-1",
            orderNo: "ORD-1",
            styleName: "STYLE-1",
            quantity: 2,
            qrPayload: "{\"Order Number\":\"ORD-1\"}",
            displayValues: { orderNo: "ORD-1", buyer: "BUYER-1" },
          },
          {
            orderId: "order-2",
            orderNo: "ORD-2",
            styleName: "STYLE-2",
            quantity: 3,
            qrPayload: "{\"Order Number\":\"ORD-2\"}",
            displayValues: { orderNo: "ORD-2", buyer: "BUYER-2" },
          },
        ],
      },
      display_field_styles: {},
      sticker_width_mm: 50,
      sticker_length_mm: 30,
      qr_payload: "batch",
      requested_at: new Date("2026-10-27T00:00:00.000Z"),
      updated_at: new Date("2026-10-27T00:00:00.000Z"),
    }]);

    await expect(listOrderQrPrintRequests("internal-org-1")).resolves.toMatchObject([
      {
        id: "request-bulk",
        orderNo: "BULK: 2 ORDERS",
        printQuantity: 5,
        bulkItems: [
          { orderNo: "ORD-1", styleName: "STYLE-1", quantity: 2, qrPayload: "{\"Order Number\":\"ORD-1\"}" },
          { orderNo: "ORD-2", styleName: "STYLE-2", quantity: 3, qrPayload: "{\"Order Number\":\"ORD-2\"}" },
        ],
      },
    ]);
  });

  it("uses a tenant-scoped compare-and-set for legal status progression", async () => {
    mocks.transaction.merchandisingOrderQrPrintRequest.findFirst
      .mockResolvedValueOnce({ status: "PENDING" })
      .mockResolvedValueOnce({
        id: "request-1",
        order_id: "order-1",
        order_no: "ORD-1",
        request_type: "PRINT",
        status: "IN_PROGRESS",
        template_name: "BASIC",
        qr_field_key: "orderNo",
        display_fields: ["orderNo", "buyer"],
        display_values: {},
        display_field_styles: {},
        qr_size: 320,
        sticker_width_mm: 60,
        sticker_length_mm: 40,
        qr_payload: "{\"Order Number\":\"ORD-1\"}",
        requested_at: new Date("2026-10-27T00:00:00.000Z"),
        updated_at: new Date("2026-10-27T00:00:00.000Z"),
      });
    mocks.transaction.merchandisingOrderQrPrintRequest.updateMany.mockResolvedValue({ count: 1 });

    await expect(advanceOrderQrPrintRequestStatus(
      "internal-org-1",
      "user-2",
      "request-1",
      "IN_PROGRESS",
    )).resolves.toMatchObject({
      success: true,
      request: {
        id: "request-1",
        status: "IN_PROGRESS",
        displayFields: ["orderNo", "buyer"],
        displayValues: {},
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            buyer: { x: 44, y: 36 },
          },
          printerType: "BARCODE",
          pdfPaperSize: "A4_AUTO",
        },
        stickerWidthMm: 60,
        stickerLengthMm: 40,
      },
    });
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "internal-org-1",
          id: "request-1",
          status: "PENDING",
        },
        data: { status: "IN_PROGRESS" },
      }),
    );
  });

  it("deletes only a complete set of pending requests from the authorized organization", async () => {
    mocks.transaction.merchandisingOrderQrPrintRequest.findMany.mockResolvedValue([
      { id: "request-1", status: "PENDING" },
      { id: "request-2", status: "PENDING" },
    ]);
    mocks.transaction.merchandisingOrderQrPrintRequest.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      deletePendingOrderQrPrintRequests(
        "internal-org-1",
        "user-1",
        ["request-1", "request-2"],
      ),
    ).resolves.toEqual({ success: true, deletedCount: 2 });
    expect(mocks.transaction.$executeRaw).toHaveBeenCalled();
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["request-1", "request-2"] },
      },
      select: { id: true, status: true },
    });
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["request-1", "request-2"] },
        status: "PENDING",
      },
    });
  });

  it("retains requests when any selected request is no longer pending", async () => {
    mocks.transaction.merchandisingOrderQrPrintRequest.findMany.mockResolvedValue([
      { id: "request-1", status: "PENDING" },
      { id: "request-2", status: "COMPLETED" },
    ]);

    await expect(
      deletePendingOrderQrPrintRequests(
        "internal-org-1",
        "user-1",
        ["request-1", "request-2"],
      ),
    ).resolves.toEqual({ success: false, reason: "LOCKED" });
    expect(mocks.transaction.merchandisingOrderQrPrintRequest.deleteMany).not.toHaveBeenCalled();
  });
});
