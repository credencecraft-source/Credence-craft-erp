import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
  getDefaultOrganizationPrintTemplateDesign,
  parseOrganizationPrintTemplateDesign,
  parseOrganizationPrintTemplateInput,
} from "./organization-print-template-contract";

describe("organization print-template contract", () => {
  it("normalizes names and accepts supported Sales Order template settings", () => {
    expect(parseOrganizationPrintTemplateInput({
      name: "  Standard Order  ",
      documentType: "SALES_ORDER",
      isActive: true,
      isDefault: true,
      designConfig: {
        ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
        headerText: "Acme Corporation",
        footerText: "Thank you for your order",
      },
    })).toMatchObject({
      name: "STANDARD ORDER",
      documentType: "SALES_ORDER",
      isActive: true,
      isDefault: true,
      designConfig: {
        pageSize: "A4",
        orientation: "PORTRAIT",
        headerText: "ACME CORPORATION",
        footerText: "THANK YOU FOR YOUR ORDER",
      },
    });
  });

  it("rejects unsupported document types and inactive defaults", () => {
    expect(() => parseOrganizationPrintTemplateInput({
      name: "STANDARD",
      documentType: "PURCHASE_ORDER",
      isActive: true,
      isDefault: false,
      designConfig: DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
    })).toThrow("Choose Sales Order, Quotation, or POS Invoice");

    expect(() => parseOrganizationPrintTemplateInput({
      name: "STANDARD",
      documentType: "QUOTATION",
      isActive: false,
      isDefault: true,
      designConfig: DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
    })).toThrow("An inactive template cannot be the default");
  });

  it("provides POS invoice defaults without Sales Order-only fields", () => {
    const design = getDefaultOrganizationPrintTemplateDesign("POS_INVOICE");
    expect(design.sections.headerFields).toContain("billTo");
    expect(design.sections.headerFields).not.toContain("shipTo");
    expect(design.sections.itemFields).toContain("hsnCode");
    expect(design.sections.itemFields).toContain("gstRate");
    expect(design.sections.itemFields).not.toContain("booking");
    expect(design.sections.summaryFields).not.toContain("deliveryCharge");
    expect(parseOrganizationPrintTemplateInput({
      name: "POS Standard",
      documentType: "POS_INVOICE",
      isActive: true,
      isDefault: true,
      designConfig: design,
    })).toMatchObject({
      name: "POS STANDARD",
      documentType: "POS_INVOICE",
    });
  });

  it("rejects out-of-range margins, invalid colors, and oversized footer content", () => {
    expect(() => parseOrganizationPrintTemplateDesign({
      ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
      margins: { ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.margins, left: 3 },
    })).toThrow("Each page margin");
    expect(() => parseOrganizationPrintTemplateDesign({
      ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
      accentColor: "red",
    })).toThrow("six-digit hex colors");
    expect(() => parseOrganizationPrintTemplateDesign({
      ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
      footerText: "X".repeat(501),
    })).toThrow("500 characters");
  });

  it("adds the new document sections to existing templates without requiring a data migration", () => {
    const legacyDesign: Record<string, unknown> = {
      ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
    };
    delete legacyDesign.sections;
    delete legacyDesign.logoDataUrl;

    expect(parseOrganizationPrintTemplateDesign(legacyDesign).sections).toEqual(
      DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections,
    );
    expect(parseOrganizationPrintTemplateDesign(legacyDesign).logoDataUrl).toBe("");
  });

  it("keeps legacy combined customer visibility while allowing independent Bill To and Ship To fields", () => {
    const design = DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN;
    expect(parseOrganizationPrintTemplateDesign({
      ...design,
      sections: {
        ...design.sections,
        headerFields: ["customerDetails"],
      },
    }).sections.headerFields).toEqual(["billTo", "shipTo"]);
    expect(parseOrganizationPrintTemplateDesign({
      ...design,
      sections: {
        ...design.sections,
        headerFields: ["billTo"],
      },
    }).sections.headerFields).toEqual(["billTo"]);
  });

  it("rejects unsafe logo formats and a document template with no item fields", () => {
    expect(() => parseOrganizationPrintTemplateDesign({
      ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
      logoDataUrl: "https://example.com/logo.png",
    })).toThrow("PNG or JPEG logo");
    expect(() => parseOrganizationPrintTemplateDesign({
      ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
      sections: {
        ...DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections,
        itemFields: [],
      },
    })).toThrow("Select at least one item table field");
  });
});
