const STATE_CODES: Record<string, string> = {
  "ANDHRA PRADESH": "37", "ARUNACHAL PRADESH": "12", ASSAM: "18", BIHAR: "10", CHHATTISGARH: "22", GOA: "30",
  GUJARAT: "24", HARYANA: "06", "HIMACHAL PRADESH": "02", "JAMMU AND KASHMIR": "01", JHARKHAND: "20", KARNATAKA: "29",
  KERALA: "32", "MADHYA PRADESH": "23", MAHARASHTRA: "27", MANIPUR: "14", MEGHALAYA: "17", MIZORAM: "15", NAGALAND: "13",
  ODISHA: "21", PUNJAB: "03", RAJASTHAN: "08", SIKKIM: "11", "TAMIL NADU": "33", TELANGANA: "36", TRIPURA: "16",
  "UTTAR PRADESH": "09", UTTARAKHAND: "05", "WEST BENGAL": "19", DELHI: "07", "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "26",
  LADAKH: "38", LAKSHADWEEP: "31", PUDUCHERRY: "34", CHANDIGARH: "04", "ANDAMAN AND NICOBAR ISLANDS": "35",
};

function stateCode(state: string | null | undefined, gstin: string | null | undefined) {
  const normalizedGstin = String(gstin ?? "").trim().toUpperCase();
  if (/^\d{2}[A-Z0-9]{13}$/.test(normalizedGstin)) return normalizedGstin.slice(0, 2);
  const normalizedState = String(state ?? "").trim().toUpperCase().replace(/[.\-]+/g, " ").replace(/\s+/g, " ");
  if (!normalizedState) return null;
  return /^\d{2}$/.test(normalizedState) ? normalizedState : STATE_CODES[normalizedState] ?? normalizedState;
}

export type TaxRegime = "GST" | "VAT" | "SALES_TAX" | "NONE";

export type GstCalculationInput = {
  taxableAmount: number;
  totalRate?: number;
  taxRegime?: TaxRegime | string | null;
  country?: string | null;
  cgstRate?: number | null;
  sgstRate?: number | null;
  igstRate?: number | null;
  vatRate?: number | null;
  salesTaxRate?: number | null;
  organizationState?: string | null;
  organizationGstin?: string | null;
  vendorState?: string | null;
  vendorGstin?: string | null;
};

export function calculateTax(input: GstCalculationInput) {
  const normalizedRegime = String(input.taxRegime ?? "GST").trim().toUpperCase();
  const country = String(input.country ?? "IN").trim().toUpperCase();
  const taxableAmount = Number(input.taxableAmount || 0);

  if (normalizedRegime === "VAT") {
    const vatRate = Number(input.vatRate ?? input.totalRate ?? 0);
    return {
      taxType: "VAT",
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      vatRate,
      salesTaxRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      vatAmount: taxableAmount * vatRate / 100,
      salesTaxAmount: 0,
      totalTaxAmount: taxableAmount * vatRate / 100,
    };
  }

  if (normalizedRegime === "SALES_TAX") {
    const salesTaxRate = Number(input.salesTaxRate ?? input.totalRate ?? 0);
    return {
      taxType: "SALES_TAX",
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      vatRate: 0,
      salesTaxRate,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      vatAmount: 0,
      salesTaxAmount: taxableAmount * salesTaxRate / 100,
      totalTaxAmount: taxableAmount * salesTaxRate / 100,
    };
  }

  const totalRate = Number(input.totalRate ?? input.igstRate ?? input.cgstRate ?? input.sgstRate ?? 0);
  const organizationStateCode = stateCode(input.organizationState, input.organizationGstin);
  const vendorStateCode = stateCode(input.vendorState, input.vendorGstin);
  const sameState = Boolean(organizationStateCode && vendorStateCode && organizationStateCode === vendorStateCode);
  const cgstRate = Number(input.cgstRate ?? totalRate / 2);
  const sgstRate = Number(input.sgstRate ?? totalRate / 2);
  const igstRate = Number(input.igstRate ?? totalRate);
  const taxType = country === "IN" && sameState ? "CGST_SGST" : country === "IN" ? "IGST" : "VAT";

  return {
    taxType,
    cgstRate: country === "IN" && sameState ? cgstRate : 0,
    sgstRate: country === "IN" && sameState ? sgstRate : 0,
    igstRate: country === "IN" && !sameState ? igstRate : 0,
    vatRate: 0,
    salesTaxRate: 0,
    cgstAmount: taxableAmount * (country === "IN" && sameState ? cgstRate : 0) / 100,
    sgstAmount: taxableAmount * (country === "IN" && sameState ? sgstRate : 0) / 100,
    igstAmount: taxableAmount * (country === "IN" && !sameState ? igstRate : 0) / 100,
    vatAmount: 0,
    salesTaxAmount: 0,
    totalTaxAmount: taxableAmount * (country === "IN" && sameState ? (cgstRate + sgstRate) : country === "IN" ? igstRate : 0) / 100,
  };
}

export function calculateGst(input: GstCalculationInput) {
  return calculateTax({ ...input, taxRegime: input.taxRegime ?? "GST" });
}