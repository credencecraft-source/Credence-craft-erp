import { GSTIN_PATTERN } from "./organization-validators";

export type GstRegistrationDetails = {
  gstNumber: string;
  organizationName: string;
  tradeName: string | null;
  legalName: string | null;
  registrationStatus: string | null;
  businessType: string | null;
  registrationDate: string | null;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  registeredAddress: string;
};

type GstVerificationOptions = {
  apiKey?: string;
  endpoint?: string;
  fetcher?: typeof fetch;
};

export class GstVerificationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function joinAddress(values: unknown[]) {
  return values.map(cleanText).filter(Boolean).join(", ");
}

export function normalizeGstRegistration(gstNumber: string, value: unknown): GstRegistrationDetails | null {
  const data = asRecord(value);
  const tradeName = cleanText(data.tradeNam) || null;
  const legalName = cleanText(data.lgnm) || null;
  const organizationName = tradeName || legalName;
  if (!organizationName) return null;

  const principal = asRecord(data.pradr);
  const address = asRecord(principal.addr);
  const addressLine1 = joinAddress([address.flno, address.bno, address.bnm, address.st]);
  const addressLine2 = joinAddress([address.loc, address.landMark]);
  const city = cleanText(address.dst);
  const state = cleanText(address.stcd);
  const pinCode = cleanText(address.pncd);
  const registeredAddress = cleanText(principal.adr)
    || joinAddress([addressLine1, addressLine2, city, state, pinCode]);

  return {
    gstNumber,
    organizationName,
    tradeName,
    legalName,
    registrationStatus: cleanText(data.sts) || null,
    businessType: cleanText(data.dty) || null,
    registrationDate: cleanText(data.rgdt) || null,
    addressLine1: addressLine1 || registeredAddress,
    addressLine2,
    city,
    state,
    country: "India",
    pinCode,
    registeredAddress,
  };
}

export async function fetchGstRegistration(
  gstNumber: string,
  options: GstVerificationOptions = {},
): Promise<GstRegistrationDetails> {
  const normalizedGstNumber = gstNumber.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(normalizedGstNumber)) {
    throw new GstVerificationError("GST number must be in valid GSTIN format.", 400);
  }

  const apiKey = options.apiKey
    ?? [process.env.GSTIN_API_KEY, process.env.GST_CHECK_API_KEY].find((value) => value?.trim())?.trim();
  if (!apiKey) {
    throw new GstVerificationError("GST verification is temporarily unavailable. Please try again later.", 503);
  }

  const endpoint = options.endpoint ?? process.env.GST_CHECK_URL ?? "https://sheet.gstincheck.co.in/check";
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${endpoint}/${apiKey}/${normalizedGstNumber}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new GstVerificationError("GST verification service is unavailable. Please try again.", 502);
  }

  if (!response.ok) {
    throw new GstVerificationError("GST verification service is unavailable. Please try again.", 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GstVerificationError("GST verification returned an invalid response. Please try again.", 502);
  }

  const result = asRecord(payload);
  if (result.flag !== true) {
    throw new GstVerificationError("GST number could not be verified.", 400);
  }

  const details = normalizeGstRegistration(normalizedGstNumber, result.data);
  if (!details) {
    throw new GstVerificationError("GST verification did not return an organization name. Please contact support.", 422);
  }

  return details;
}