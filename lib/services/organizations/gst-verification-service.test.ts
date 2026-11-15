import { describe, expect, it, vi } from "vitest";
import { fetchGstRegistration, normalizeGstRegistration } from "./gst-verification-service";

const gstNumber = "27ABCDE1234F1Z5";

describe("GST registration normalization", () => {
  it("uses the trade name and maps registration and principal-address fields", () => {
    expect(normalizeGstRegistration(gstNumber, {
      tradeNam: "Northwind Apparel",
      lgnm: "Northwind Private Limited",
      sts: "Active",
      dty: "Regular",
      rgdt: "01/01/2020",
      pradr: {
        adr: "Unit 4, Market Road, Mumbai, Maharashtra, 400001",
        addr: {
          bno: "4",
          bnm: "Northwind House",
          st: "Market Road",
          loc: "Fort",
          dst: "Mumbai",
          stcd: "Maharashtra",
          pncd: "400001",
        },
      },
    })).toEqual({
      gstNumber,
      organizationName: "Northwind Apparel",
      tradeName: "Northwind Apparel",
      legalName: "Northwind Private Limited",
      registrationStatus: "Active",
      businessType: "Regular",
      registrationDate: "01/01/2020",
      addressLine1: "4, Northwind House, Market Road",
      addressLine2: "Fort",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      pinCode: "400001",
      registeredAddress: "Unit 4, Market Road, Mumbai, Maharashtra, 400001",
    });
  });

  it("uses the legal name when trade name is absent and allows a partial address", () => {
    expect(normalizeGstRegistration(gstNumber, { lgnm: "Legal Company" })).toMatchObject({
      organizationName: "Legal Company",
      tradeName: null,
      legalName: "Legal Company",
      addressLine1: "",
      registeredAddress: "",
    });
  });

  it("rejects provider data without either organization name", () => {
    expect(normalizeGstRegistration(gstNumber, { sts: "Active" })).toBeNull();
    expect(normalizeGstRegistration(gstNumber, null)).toBeNull();
  });
});

describe("GST provider verification", () => {
  it("fails closed when provider configuration is missing", async () => {
    const fetcher = vi.fn();

    await expect(fetchGstRegistration(gstNumber, { apiKey: "", fetcher: fetcher as typeof fetch }))
      .rejects.toThrow("GST verification is temporarily unavailable.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the documented GSTIN_API_KEY environment variable", async () => {
    vi.stubEnv("GSTIN_API_KEY", "test-key");
    vi.stubEnv("GST_CHECK_API_KEY", "");
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: true, data: { lgnm: "Example Company" } }),
    }) as unknown as typeof fetch;

    await fetchGstRegistration(gstNumber, { endpoint: "https://gst.example/check", fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      `https://gst.example/check/test-key/${gstNumber}`,
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    vi.unstubAllEnvs();
  });

  it("rejects a successful provider response without identity data", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: true, data: {} }),
    }) as unknown as typeof fetch;

    await expect(fetchGstRegistration(gstNumber, { apiKey: "test-key", fetcher }))
      .rejects.toThrow("did not return an organization name");
  });
});