import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  listOrderQrTemplates: vi.fn(),
  createOrderQrTemplate: vi.fn(),
  deleteOrderQrTemplates: vi.fn(),
  OrderQrTemplatePageSetupNotFoundError: class extends Error {},
  isDatabaseUnavailableError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/orders/order-qr-template-service", () => ({
  listOrderQrTemplates: mocks.listOrderQrTemplates,
  createOrderQrTemplate: mocks.createOrderQrTemplate,
  deleteOrderQrTemplates: mocks.deleteOrderQrTemplates,
  OrderQrTemplatePageSetupNotFoundError: mocks.OrderQrTemplatePageSetupNotFoundError,
  OrderQrTemplateDeleteConflictError: class OrderQrTemplateDeleteConflictError extends Error {},
}));

vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: mocks.isDatabaseUnavailableError,
}));

import { DELETE, GET, POST } from "./route";

const requestUrl = "http://localhost/api/orders/qr-templates?organizationId=public-org&workspaceId=workspace-1";

describe("order QR template API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({
      id: "internal-org-1",
      organizationId: "public-org",
    });
    mocks.listOrderQrTemplates.mockResolvedValue([]);
    mocks.createOrderQrTemplate.mockResolvedValue({ id: "template-1", name: "ORDER TAG" });
    mocks.deleteOrderQrTemplates.mockResolvedValue({ success: true, deletedCount: 2 });
  });

  it("lists templates using the authorized internal organization id", async () => {
    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.listOrderQrTemplates).toHaveBeenCalledWith("internal-org-1");
    await expect(response.json()).resolves.toEqual({ templates: [] });
  });

  it("blocks workspace mismatch before organization authorization", async () => {
    const response = await GET(
      new Request(`${requestUrl.replace("workspace-1", "other-workspace")}`),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.listOrderQrTemplates).not.toHaveBeenCalled();
  });

  it("blocks organization memberships without an allowed role", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(
      new Error("Access denied: insufficient organization permissions."),
    );

    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(403);
    expect(mocks.listOrderQrTemplates).not.toHaveBeenCalled();
  });

  it("reports missing schema as a migration-readiness error", async () => {
    mocks.listOrderQrTemplates.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Missing table.", {
        code: "P2021",
        clientVersion: "test",
      }),
    );

    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "SCHEMA_NOT_READY",
      error: expect.stringContaining("Apply pending database migrations"),
    });
  });

  it("rejects invalid template fields without writing", async () => {
    const response = await POST(
      new Request(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "BAD", fieldKeys: ["organizationId"], qrSize: 192 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createOrderQrTemplate).not.toHaveBeenCalled();
  });

  it("creates a validated template for the authorized organization and actor", async () => {
    const response = await POST(
      new Request(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Order tags",
          pageSetupTemplateId: "setup-1",
          fieldKeys: ["orderNo", "styleName"],
          qrSize: 192,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createOrderQrTemplate).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      {
        name: "ORDER TAGS",
        pageSetupTemplateId: "setup-1",
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "styleName"],
        displayFieldStyles: {
          orderNo: { fontSize: 12, bold: false, underline: false, color: "#111827" },
          styleName: { fontSize: 12, bold: false, underline: false, color: "#111827" },
        },
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            styleName: { x: 44, y: 36 },
          },
          printerType: "BARCODE",
          pdfPaperSize: "A4_AUTO",
        },
        qrSize: 192,
        stickerWidthMm: 50,
        stickerLengthMm: 30,
      },
    );
  });

  it("reports when the selected Page Setup is unavailable in this organization", async () => {
    mocks.createOrderQrTemplate.mockRejectedValue(
      new mocks.OrderQrTemplatePageSetupNotFoundError(),
    );
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Order tags",
        pageSetupTemplateId: "foreign-setup",
        fieldKeys: ["orderNo"],
        qrSize: 192,
      }),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Select a Page Setup template from this organization.",
    });
  });

  it("tenant-scopes selected template deletion to the authorized organization", async () => {
    const response = await DELETE(new Request(requestUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["template-1", "template-2"] }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.deleteOrderQrTemplates).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["template-1", "template-2"],
    );
    await expect(response.json()).resolves.toEqual({ deletedCount: 2 });
  });

  it("rejects malformed or duplicate template identifiers before deletion", async () => {
    const response = await DELETE(new Request(requestUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["template-1", "template-1"] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.deleteOrderQrTemplates).not.toHaveBeenCalled();
  });
});
