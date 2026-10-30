import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    $executeRaw: vi.fn(),
    designDevelopmentPageSetupTemplate: {
      findFirst: vi.fn(),
    },
    merchandisingOrderQrTemplate: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(),
      merchandisingOrderQrTemplate: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));

import {
  createOrderQrTemplate,
  deleteOrderQrTemplates,
  getOrderQrTemplate,
  listOrderQrTemplates,
  OrderQrTemplatePageSetupNotFoundError,
  updateOrderQrTemplate,
} from "./order-qr-template-service";

const pageSetupRow = {
  id: "setup-1",
  name: "A3 STOCK",
  paper_size: "A3",
  orientation: "LANDSCAPE",
  sticker_width_mm: 50,
  sticker_length_mm: 30,
  margin_top_mm: 10,
  margin_bottom_mm: 10,
  margin_left_mm: 15,
  margin_right_mm: 15,
  horizontal_gap_mm: 3,
  vertical_gap_mm: 4,
};

describe("order QR template service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        callback(mocks.transaction),
    );
    mocks.prisma.merchandisingOrderQrTemplate.findMany.mockResolvedValue([
      {
        id: "template-1",
        name: "ORDER TAG",
        type: "ORDER_TAGS",
        field_keys: ["orderNo", "buyer", 3],
        qr_field_key: "orderNo",
        display_fields: ["orderNo", "buyer"],
        display_field_styles: {
          styles: {
            orderNo: { fontSize: 20, bold: true, underline: true, color: "#123456" },
          },
          layout: {
            qr: { x: 72, y: 9 },
            fields: {
              orderNo: { x: 7, y: 21 },
              buyer: { x: 48, y: 74 },
            },
            printerType: "LASER",
            pdfPaperSize: "A4_LANDSCAPE",
          },
        },
        qr_size: 192,
        sticker_width_mm: 50,
        sticker_length_mm: 30,
        updated_at: new Date("2026-10-27T00:00:00.000Z"),
      },
    ]);
    mocks.transaction.merchandisingOrderQrTemplate.create.mockResolvedValue({
      id: "template-2",
      name: "ORDER TAG",
      type: "ORDER_TAGS",
      field_keys: ["orderNo", "styleName"],
      qr_field_key: "orderNo",
      display_fields: ["orderNo", "styleName"],
      display_field_styles: {
        styles: {},
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            styleName: { x: 44, y: 36 },
          },
        },
      },
      qr_size: 256,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
      updated_at: new Date("2026-10-27T00:00:00.000Z"),
    });
    mocks.transaction.designDevelopmentPageSetupTemplate.findFirst.mockResolvedValue(pageSetupRow);
  });

  it("lists records scoped to the authorized organization and returns safe field keys", async () => {
    await expect(listOrderQrTemplates("internal-org-1")).resolves.toEqual([
      {
        id: "template-1",
        name: "ORDER TAG",
        type: "ORDER_TAGS",
        fieldKeys: ["orderNo", "buyer"],
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "buyer"],
        displayFieldStyles: {
          orderNo: { fontSize: 20, bold: true, underline: true, color: "#123456" },
          buyer: { fontSize: 12, bold: false, underline: false, color: "#111827" },
        },
        layout: {
          qr: { x: 72, y: 9 },
          fields: {
            orderNo: { x: 7, y: 21 },
            buyer: { x: 48, y: 74 },
          },
          printerType: "LASER",
          pdfPaperSize: "A4_LANDSCAPE",
        },
        pageSetup: null,
        qrSize: 192,
        stickerWidthMm: 50,
        stickerLengthMm: 30,
        updatedAt: "2026-10-27T00:00:00.000Z",
      },
    ]);
    expect(mocks.prisma.merchandisingOrderQrTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1" },
        take: 100,
      }),
    );
  });

  it("records the actor transaction-locally and persists only the authorized organization's design", async () => {
    await expect(
      createOrderQrTemplate("internal-org-1", "user-1", {
        name: "ORDER TAG",
        pageSetupTemplateId: "setup-1",
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "styleName"],
        displayFieldStyles: {},
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            styleName: { x: 44, y: 36 },
          },
          printerType: "BARCODE",
          pdfPaperSize: "A4_AUTO",
        },
        qrSize: 256,
        stickerWidthMm: 61,
        stickerLengthMm: 42,
      }),
    ).resolves.toMatchObject({
      id: "template-2",
      fieldKeys: ["orderNo", "styleName"],
    });

    expect(mocks.transaction.$executeRaw).toHaveBeenCalled();
    expect(mocks.transaction.merchandisingOrderQrTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "internal-org-1",
          name: "ORDER TAG",
          type: "ORDER_TAGS",
          field_keys: ["orderNo", "styleName"],
          qr_field_key: "orderNo",
          display_fields: ["orderNo", "styleName"],
          display_field_styles: {
            styles: {},
            layout: {
              qr: { x: 3, y: 25 },
              fields: {
                orderNo: { x: 44, y: 16 },
                styleName: { x: 44, y: 36 },
              },
              printerType: "LASER",
              pdfPaperSize: "A4_AUTO",
            },
            pageSetup: {
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
            },
          },
          qr_size: 256,
          sticker_width_mm: 50,
          sticker_length_mm: 30,
        }),
      }),
    );
  });

  it("rejects a Page Setup ID that is not owned by the authorized organization", async () => {
    mocks.transaction.designDevelopmentPageSetupTemplate.findFirst.mockResolvedValue(null);

    await expect(createOrderQrTemplate("internal-org-1", "user-1", {
      name: "ORDER TAG",
      pageSetupTemplateId: "foreign-setup",
      qrFieldKey: "orderNo",
      displayFields: ["orderNo"],
      displayFieldStyles: {},
      layout: {
        qr: { x: 3, y: 25 },
        fields: { orderNo: { x: 44, y: 16 } },
        printerType: "LASER",
        pdfPaperSize: "A4_AUTO",
      },
      qrSize: 256,
      stickerWidthMm: 50,
      stickerLengthMm: 30,
    })).rejects.toBeInstanceOf(OrderQrTemplatePageSetupNotFoundError);
    expect(mocks.transaction.designDevelopmentPageSetupTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "foreign-setup" },
      }),
    );
    expect(mocks.transaction.merchandisingOrderQrTemplate.create).not.toHaveBeenCalled();
  });

  it("loads a template using both its ID and authorized organization ID", async () => {
    mocks.prisma.merchandisingOrderQrTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      name: "ORDER TAG",
      type: "ORDER_TAGS",
      field_keys: ["orderNo", "buyer"],
      qr_field_key: "orderNo",
      display_fields: ["orderNo", "buyer"],
      display_field_styles: {
        styles: {},
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            buyer: { x: 44, y: 36 },
          },
          printerType: "BARCODE",
          pdfPaperSize: "A4_AUTO",
        },
      },
      qr_size: 192,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
      updated_at: new Date("2026-10-27T00:00:00.000Z"),
    });

    await expect(getOrderQrTemplate("internal-org-1", "template-1")).resolves.toMatchObject({
      id: "template-1",
      fieldKeys: ["orderNo", "buyer"],
    });
    expect(mocks.prisma.merchandisingOrderQrTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "template-1" },
      }),
    );
  });

  it("updates the tenant-scoped template and records the actor in the transaction", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.merchandisingOrderQrTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      name: "UPDATED TAG",
      type: "ORDER_TAGS",
      field_keys: ["orderNo", "buyer"],
      qr_field_key: "orderNo",
      display_fields: ["orderNo", "buyer"],
      display_field_styles: {
        styles: {},
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            buyer: { x: 44, y: 36 },
          },
          printerType: "LASER",
          pdfPaperSize: "A4_AUTO",
        },
        pageSetup: {
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
        },
      },
      qr_size: 320,
      sticker_width_mm: 50,
      sticker_length_mm: 30,
      updated_at: new Date("2026-10-27T00:00:00.000Z"),
    });

    await expect(updateOrderQrTemplate("internal-org-1", "user-1", "template-1", {
      name: "UPDATED TAG",
      pageSetupTemplateId: "setup-1",
      qrFieldKey: "orderNo",
      displayFields: ["orderNo", "buyer"],
      displayFieldStyles: {},
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
      stickerWidthMm: 61,
      stickerLengthMm: 42,
    })).resolves.toMatchObject({
      id: "template-1",
      name: "UPDATED TAG",
      qrSize: 320,
    });
    expect(mocks.transaction.$executeRaw).toHaveBeenCalled();
    expect(mocks.transaction.merchandisingOrderQrTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "template-1" },
        data: {
          name: "UPDATED TAG",
          field_keys: ["orderNo", "buyer"],
          qr_field_key: "orderNo",
          display_fields: ["orderNo", "buyer"],
          display_field_styles: {
            styles: {},
            layout: {
              qr: { x: 3, y: 25 },
              fields: {
                orderNo: { x: 44, y: 16 },
                buyer: { x: 44, y: 36 },
              },
              printerType: "LASER",
              pdfPaperSize: "A4_AUTO",
            },
            pageSetup: {
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
            },
          },
          qr_size: 320,
          sticker_width_mm: 50,
          sticker_length_mm: 30,
        },
      }),
    );
  });

  it("deletes the complete QR template selection in the organization and records the actor", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.findMany.mockResolvedValue([
      { id: "template-1" },
      { id: "template-2" },
    ]);
    mocks.transaction.merchandisingOrderQrTemplate.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      deleteOrderQrTemplates("internal-org-1", "user-1", ["template-1", "template-2"]),
    ).resolves.toEqual({ success: true, deletedCount: 2 });
    expect(mocks.transaction.$executeRaw).toHaveBeenCalled();
    expect(mocks.transaction.merchandisingOrderQrTemplate.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["template-1", "template-2"] },
      },
      select: { id: true },
    });
    expect(mocks.transaction.merchandisingOrderQrTemplate.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["template-1", "template-2"] },
      },
    });
  });

  it("does not partially delete QR templates if a selected record is missing", async () => {
    mocks.transaction.merchandisingOrderQrTemplate.findMany.mockResolvedValue([{ id: "template-1" }]);

    await expect(
      deleteOrderQrTemplates("internal-org-1", "user-1", ["template-1", "foreign-template"]),
    ).resolves.toEqual({ success: false, reason: "NOT_FOUND" });
    expect(mocks.transaction.merchandisingOrderQrTemplate.deleteMany).not.toHaveBeenCalled();
  });
});
