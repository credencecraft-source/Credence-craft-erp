export const GST_TYPE_INTRA_STATE = "CGST & SGST";
export const GST_TYPE_INTER_STATE = "IGST";

export function normalizeVendorName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function normalizeGstNumber(value: string) {
  return value.trim().toUpperCase();
}

export function isValidGstNumber(value: string) {
  return /^[0-9A-Z]{15}$/.test(value);
}

export function getGstType(
  entityStateId: string | null | undefined,
  vendorStateId: string | null | undefined
) {
  if (!entityStateId || !vendorStateId) {
    return null;
  }

  return entityStateId === vendorStateId
    ? GST_TYPE_INTRA_STATE
    : GST_TYPE_INTER_STATE;
}

type GstLookupResponse = {
  flag?: boolean;
  data?: {
    tradeNam?: string | null;
    pradr?: {
      adr?: string | null;
      addr?: {
        dst?: string | null;
        stcd?: string | null;
        pncd?: string | null;
      } | null;
    } | null;
  } | null;
};

export type GstLookupResult = {
  vendorName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string;
};

export async function fetchGstDetails(gstNumber: string): Promise<GstLookupResult> {
  const apiKey = process.env.GSTIN_API_KEY;
  if (!apiKey) {
    throw new Error("GSTIN_API_KEY is not configured");
  }

  const response = await fetch(
    `https://sheet.gstincheck.co.in/check/${apiKey}/${gstNumber}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("GST lookup service is unavailable");
  }

  const result = (await response.json()) as GstLookupResponse;
  if (!result.flag || !result.data) {
    throw new Error("GST number was not found");
  }

  const address = result.data.pradr?.addr;
  const addressParts = (result.data.pradr?.adr ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    vendorName: result.data.tradeNam?.trim() || null,
    addressLine1: addressParts[0] ?? null,
    addressLine2: addressParts.slice(1).join(", ") || null,
    city: address?.dst?.trim() || null,
    stateProvince: address?.stcd?.trim() || null,
    postalCode: address?.pncd?.trim() || null,
    country: "India",
  };
}
