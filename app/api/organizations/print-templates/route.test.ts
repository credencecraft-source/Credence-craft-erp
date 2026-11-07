import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createOrganizationPrintTemplate: vi.fn(),
  getOrganizationPrintTemplateForDocument: vi.fn(),
  listOrganizationPrintTemplates: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/organization-print-template-service", () => ({
  createOrganizationPrintTemplate: mocks.createOrganizationPrintTemplate,
  getOrganizationPrintTemplateForDocument: mocks.getOrganizationPrintTemplateForDocument,
  listOrganizationPrintTemplates: mocks.listOrganizationPrintTemplates,
}));

import { GET, POST } from "./route";

const validInput = {
  name: "STANDARD",
  documentType: "SALES_ORDER",
  designConfig: {
    pageSize: "A4",
    orientation: "PORTRAIT",
    margins: { top: 12, right: 12, bottom: 18, left: 12 },
    fontFamily: "helvetica",
    bodyFontSize: 8,
    headingFontSize: 15,
    textColor: "#0F172A",
    accentColor: "#4F46E5",
    tableHeaderColor: "#4F46E5",
    tableHeaderTextColor: "#FFFFFF",
    headerText: "",
    footerText: "",
    showPageNumbers: true,
  },
  isActive: true,
  isDefault: true,
};

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost/api/organizations/print-templates${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
  mocks.requireOrganizationContext.mockResolvedValue({ organizationId: "public-org-1" });
  mocks.getOrganizationPrintTemplateForDocument.mockResolvedValue(null);
  mocks.listOrganizationPrintTemplates.mockResolvedValue([]);
  mocks.createOrganizationPrintTemplate.mockResolvedValue({ id: "template-1" });
});

describe("organization print-template collection route", () => {
  it("rejects requests from a different workspace before organization lookup", async () => {
    const response = await GET(request("?workspaceId=other-workspace&organizationId=public-org-1"));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
  });

  it("returns the active document default through the authorized service", async () => {
    const response = await GET(request(
      "?workspaceId=workspace-1&organizationId=public-org-1&defaultFor=QUOTATION",
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ designConfig: null });
    expect(mocks.getOrganizationPrintTemplateForDocument).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "QUOTATION",
    );
  });

  it("loads an authorized POS invoice default template", async () => {
    const response = await GET(request(
      "?workspaceId=workspace-1&organizationId=public-org-1&defaultFor=POS_INVOICE",
    ));

    expect(response.status).toBe(200);
    expect(mocks.getOrganizationPrintTemplateForDocument).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "POS_INVOICE",
    );
  });

  it("rejects unsupported document types and invalid template input", async () => {
    const invalidType = await GET(request(
      "?workspaceId=workspace-1&organizationId=public-org-1&defaultFor=PURCHASE_ORDER",
    ));
    expect(invalidType.status).toBe(400);

    mocks.createOrganizationPrintTemplate.mockRejectedValue(
      new Error("Choose Sales Order, Quotation, or POS Invoice as the document type."),
    );
    const invalidTemplate = await POST(request("?workspaceId=workspace-1&organizationId=public-org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validInput, documentType: "PURCHASE_ORDER" }),
    }));
    expect(invalidTemplate.status).toBe(400);
    expect(mocks.createOrganizationPrintTemplate).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      expect.objectContaining({ documentType: "PURCHASE_ORDER" }),
    );
  });

  it("creates a template only after workspace and organization authorization", async () => {
    const response = await POST(request("?workspaceId=workspace-1&organizationId=public-org-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validInput),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ template: { id: "template-1" } });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org-1");
    expect(mocks.createOrganizationPrintTemplate).toHaveBeenCalledWith("user-1", "public-org-1", validInput);
  });
});
