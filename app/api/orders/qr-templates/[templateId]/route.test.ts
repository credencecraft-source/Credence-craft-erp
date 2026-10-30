import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getOrderQrTemplate: vi.fn(),
  updateOrderQrTemplate: vi.fn(),
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
  getOrderQrTemplate: mocks.getOrderQrTemplate,
  updateOrderQrTemplate: mocks.updateOrderQrTemplate,
  OrderQrTemplatePageSetupNotFoundError: mocks.OrderQrTemplatePageSetupNotFoundError,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: mocks.isDatabaseUnavailableError,
}));

import { GET, PATCH } from "./route";

const requestUrl =
  "http://localhost/api/orders/qr-templates/template-1?organizationId=public-org&workspaceId=workspace-1";
const routeContext = { params: Promise.resolve({ templateId: "template-1" }) };

describe("order QR template record API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({
      id: "internal-org-1",
      organizationId: "public-org",
    });
    mocks.getOrderQrTemplate.mockResolvedValue({
      id: "template-1",
      name: "BASIC",
      fieldKeys: ["orderNo", "buyer"],
      qrSize: 320,
    });
    mocks.updateOrderQrTemplate.mockResolvedValue({
      id: "template-1",
      name: "BASIC UPDATED",
      fieldKeys: ["orderNo", "buyer"],
      qrSize: 320,
    });
  });

  it("reads a template using the authorized internal organization ID", async () => {
    const response = await GET(new Request(requestUrl), routeContext);

    expect(response.status).toBe(200);
    expect(mocks.getOrderQrTemplate).toHaveBeenCalledWith("internal-org-1", "template-1");
    await expect(response.json()).resolves.toMatchObject({
      template: { id: "template-1", name: "BASIC" },
    });
  });

  it("rejects workspace mismatch before record lookup", async () => {
    const response = await GET(
      new Request(requestUrl.replace("workspace-1", "other-workspace")),
      routeContext,
    );

    expect(response.status).toBe(403);
    expect(mocks.getOrderQrTemplate).not.toHaveBeenCalled();
  });

  it("returns not found for a record outside the authorized organization", async () => {
    mocks.getOrderQrTemplate.mockResolvedValue(null);
    const response = await GET(new Request(requestUrl), routeContext);

    expect(response.status).toBe(404);
  });

  it("validates before updating a tenant-scoped template", async () => {
    const response = await PATCH(
      new Request(requestUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "INVALID", fieldKeys: ["unknown"], qrSize: 192 }),
      }),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.updateOrderQrTemplate).not.toHaveBeenCalled();
  });

  it("updates the record for the authorized organization and actor", async () => {
    const response = await PATCH(
      new Request(requestUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Basic updated",
          pageSetupTemplateId: "setup-1",
          fieldKeys: ["orderNo", "buyer"],
          qrSize: 320,
        }),
      }),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mocks.updateOrderQrTemplate).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "template-1",
      {
        name: "BASIC UPDATED",
        pageSetupTemplateId: "setup-1",
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "buyer"],
        displayFieldStyles: {
          orderNo: { fontSize: 12, bold: false, underline: false, color: "#111827" },
          buyer: { fontSize: 12, bold: false, underline: false, color: "#111827" },
        },
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
        stickerWidthMm: 50,
        stickerLengthMm: 30,
      },
    );
  });

  it("reports when the selected Page Setup is unavailable in this organization", async () => {
    mocks.updateOrderQrTemplate.mockRejectedValue(
      new mocks.OrderQrTemplatePageSetupNotFoundError(),
    );
    const response = await PATCH(
      new Request(requestUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Basic updated",
          pageSetupTemplateId: "foreign-setup",
          fieldKeys: ["orderNo"],
          qrSize: 320,
        }),
      }),
      routeContext,
    );

    expect(response.status).toBe(404);
  });
});
