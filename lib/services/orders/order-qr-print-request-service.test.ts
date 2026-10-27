import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    $executeRaw: vi.fn(),
    merchandisingOrder: { findFirst: vi.fn() },
    merchandisingOrderQrTemplate: { findFirst: vi.fn() },
    merchandisingOrderQrPrintRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
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
  listOrderQrPrintRequests,
} from "./order-qr-print-request-service";

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
      display_values: { orderNo: "ORD-1", buyer: "BUYER-1" },
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
      },
      qr_size: 320,
      sticker_width_mm: 60,
      sticker_length_mm: 40,
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
        stickerWidthMm: 60,
        stickerLengthMm: 40,
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
          display_values: { orderNo: "ORD-1", buyer: "BUYER-1" },
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
          },
          qr_size: 320,
          sticker_width_mm: 60,
          sticker_length_mm: 40,
          qr_payload: JSON.stringify({ "Order Number": "ORD-1" }),
        }),
      }),
    );
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
        display_values: { orderNo: "ORD-1", buyer: "BUYER-1" },
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
});
