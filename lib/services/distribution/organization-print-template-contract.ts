import type { OrganizationPrintDocumentType } from "@prisma/client";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export type OrganizationPrintTemplateDesign = {
  pageSize: "A4" | "LETTER";
  orientation: "PORTRAIT" | "LANDSCAPE";
  margins: { top: number; right: number; bottom: number; left: number };
  fontFamily: "helvetica" | "times" | "courier";
  bodyFontSize: number;
  headingFontSize: number;
  textColor: string;
  accentColor: string;
  tableHeaderColor: string;
  tableHeaderTextColor: string;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
  logoDataUrl: string;
  sections: {
    headerFields: string[];
    itemFields: string[];
    summaryFields: string[];
    paymentTermsText: string;
    showPaymentTerms: boolean;
    showSpecialNotes: boolean;
  };
};

export type OrganizationPrintTemplateInput = {
  name: string;
  documentType: OrganizationPrintDocumentType;
  designConfig: OrganizationPrintTemplateDesign;
  isActive: boolean;
  isDefault: boolean;
};

export const DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN: OrganizationPrintTemplateDesign = {
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
  logoDataUrl: "",
  sections: {
    headerFields: ["companyLogo", "companyName", "documentNumber", "documentDate", "billTo", "shipTo", "status"],
    itemFields: [
      "description", "booking", "order", "sizeBreakdown", "quantity",
      "unitPrice", "beforeTax", "tax", "amount",
    ],
    summaryFields: [
      "totalQuantity", "beforeTax", "deliveryCharge", "cgst", "sgst",
      "igst", "vatSalesTax", "totalTax", "grandTotal", "linkedQuotations",
    ],
    paymentTermsText: "",
    showPaymentTerms: true,
    showSpecialNotes: true,
  },
};

const DOCUMENT_TYPES: readonly OrganizationPrintDocumentType[] = ["SALES_ORDER", "QUOTATION"];
const FONT_FAMILIES = ["helvetica", "times", "courier"] as const;
const HEX_COLOR = /^#[\da-fA-F]{6}$/;
const HEADER_FIELDS = ["companyLogo", "companyName", "documentNumber", "documentDate", "billTo", "shipTo", "status"] as const;
const ITEM_FIELDS = [
  "description", "booking", "order", "sizeBreakdown", "quantity",
  "unitPrice", "beforeTax", "tax", "amount",
] as const;
const SUMMARY_FIELDS = [
  "totalQuantity", "beforeTax", "deliveryCharge", "cgst", "sgst",
  "igst", "vatSalesTax", "totalTax", "grandTotal", "linkedQuotations",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function parseOrganizationPrintTemplateDesign(
  value: unknown,
): OrganizationPrintTemplateDesign {
  if (!isRecord(value) || !isRecord(value.margins)) {
    throw new Error("Provide valid print-template settings.");
  }
  const { margins } = value;
  if (value.sections !== undefined && !isRecord(value.sections)) {
    throw new Error("Provide valid settings for the document sections.");
  }
  const rawSections = isRecord(value.sections) ? value.sections : {};
  const parseFieldList = (raw: unknown, allowed: readonly string[], fallback: string[]) => {
    if (raw === undefined) return fallback;
    if (!Array.isArray(raw) || raw.length > allowed.length
      || raw.some((field) => typeof field !== "string" || !allowed.includes(field))
      || new Set(raw).size !== raw.length) {
      throw new Error("Choose valid, unique print fields for each document section.");
    }
    return raw as string[];
  };
  const parseHeaderFields = (raw: unknown) => {
    if (raw === undefined) return DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections.headerFields;
    const allowed = [...HEADER_FIELDS, "customerDetails"];
    if (!Array.isArray(raw) || raw.length > allowed.length
      || raw.some((field) => typeof field !== "string" || !allowed.includes(field))
      || new Set(raw).size !== raw.length) {
      throw new Error("Choose valid, unique print fields for each document section.");
    }
    const fields = (raw as string[]).flatMap((field) =>
      field === "customerDetails" ? ["billTo", "shipTo"] : [field],
    );
    if (new Set(fields).size !== fields.length) {
      throw new Error("Choose valid, unique print fields for each document section.");
    }
    return fields;
  };
  const parseSectionFlag = (raw: unknown, fallback: boolean) => {
    if (raw === undefined) return fallback;
    if (typeof raw !== "boolean") {
      throw new Error("Choose valid visibility settings for the document sections.");
    }
    return raw;
  };
  const paymentTermsText = rawSections.paymentTermsText === undefined
    ? DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections.paymentTermsText
    : typeof rawSections.paymentTermsText === "string"
      ? normalizeUppercase(rawSections.paymentTermsText)
      : null;
  if (paymentTermsText === null) {
    throw new Error("Payment terms must be text.");
  }
  const logoDataUrl = value.logoDataUrl === undefined
    ? ""
    : typeof value.logoDataUrl === "string"
      ? value.logoDataUrl
      : null;
  if (logoDataUrl === null) {
    throw new Error("Select a valid company logo image.");
  }
  const design: OrganizationPrintTemplateDesign = {
    pageSize: value.pageSize as OrganizationPrintTemplateDesign["pageSize"],
    orientation: value.orientation as OrganizationPrintTemplateDesign["orientation"],
    margins: {
      top: margins.top as number,
      right: margins.right as number,
      bottom: margins.bottom as number,
      left: margins.left as number,
    },
    fontFamily: value.fontFamily as OrganizationPrintTemplateDesign["fontFamily"],
    bodyFontSize: value.bodyFontSize as number,
    headingFontSize: value.headingFontSize as number,
    textColor: value.textColor as string,
    accentColor: value.accentColor as string,
    tableHeaderColor: value.tableHeaderColor as string,
    tableHeaderTextColor: value.tableHeaderTextColor as string,
    headerText: typeof value.headerText === "string" ? normalizeUppercase(value.headerText) : value.headerText as string,
    footerText: typeof value.footerText === "string" ? normalizeUppercase(value.footerText) : value.footerText as string,
    showPageNumbers: value.showPageNumbers as boolean,
    logoDataUrl,
    sections: {
      headerFields: parseHeaderFields(rawSections.headerFields),
      itemFields: parseFieldList(rawSections.itemFields, ITEM_FIELDS, DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections.itemFields),
      summaryFields: parseFieldList(rawSections.summaryFields, SUMMARY_FIELDS, DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections.summaryFields),
      paymentTermsText,
      showPaymentTerms: parseSectionFlag(
        rawSections.showPaymentTerms,
        DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections.showPaymentTerms,
      ),
      showSpecialNotes: parseSectionFlag(
        rawSections.showSpecialNotes,
        DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN.sections.showSpecialNotes,
      ),
    },
  };

  if (design.pageSize !== "A4" && design.pageSize !== "LETTER") {
    throw new Error("Select A4 or Letter for the print page size.");
  }
  if (design.orientation !== "PORTRAIT" && design.orientation !== "LANDSCAPE") {
    throw new Error("Select portrait or landscape page orientation.");
  }
  if (!FONT_FAMILIES.includes(design.fontFamily)) {
    throw new Error("Select a supported print font.");
  }
  if (!isIntegerInRange(design.bodyFontSize, 6, 14)
    || !isIntegerInRange(design.headingFontSize, 10, 28)) {
    throw new Error("Font sizes are outside the supported range.");
  }
  if (Object.values(design.margins).some((margin) => !isIntegerInRange(margin, 4, 40))) {
    throw new Error("Each page margin must be between 4 and 40 mm.");
  }
  if (![design.textColor, design.accentColor, design.tableHeaderColor, design.tableHeaderTextColor]
    .every((color) => typeof color === "string" && HEX_COLOR.test(color))) {
    throw new Error("Use valid six-digit hex colors for the print template.");
  }
  if (typeof design.headerText !== "string" || design.headerText.length > 500
    || typeof design.footerText !== "string" || design.footerText.length > 500) {
    throw new Error("Header and footer text must each be 500 characters or fewer.");
  }
  if (design.sections.paymentTermsText.length > 500) {
    throw new Error("Payment terms must be 500 characters or fewer.");
  }
  if (design.sections.itemFields.length === 0) {
    throw new Error("Select at least one item table field.");
  }
  if (typeof design.showPageNumbers !== "boolean") {
    throw new Error("Choose whether the PDF should display page numbers.");
  }
  if (design.logoDataUrl.length > 350_000
    || (design.logoDataUrl !== ""
      && !/^data:image\/(?:png|jpeg);base64,[a-z\d+/]+=*$/i.test(design.logoDataUrl))) {
    throw new Error("Upload a PNG or JPEG logo no larger than 250 KB.");
  }
  return design;
}

export function parseOrganizationPrintTemplateInput(
  value: unknown,
): OrganizationPrintTemplateInput {
  if (!isRecord(value)) throw new Error("Submit a valid print template.");
  if (typeof value.documentType !== "string"
    || !DOCUMENT_TYPES.includes(value.documentType as OrganizationPrintDocumentType)) {
    throw new Error("Choose Sales Order or Quotation as the document type.");
  }
  if (typeof value.name !== "string") throw new Error("Enter a template name.");
  const name = normalizeUppercase(value.name.trim());
  if (name.length < 2 || name.length > 100) {
    throw new Error("Template name must be between 2 and 100 characters.");
  }
  if (typeof value.isActive !== "boolean" || typeof value.isDefault !== "boolean") {
    throw new Error("Choose the template active and default settings.");
  }
  if (value.isDefault && !value.isActive) {
    throw new Error("An inactive template cannot be the default.");
  }
  return {
    name,
    documentType: value.documentType as OrganizationPrintDocumentType,
    designConfig: parseOrganizationPrintTemplateDesign(value.designConfig),
    isActive: value.isActive,
    isDefault: value.isDefault,
  };
}
