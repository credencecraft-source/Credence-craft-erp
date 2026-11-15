import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  assertCentralTaxMasters,
  calculateCentralTax,
} from "@/lib/services/finance/central-tax-engine";

describe("calculateCentralTax", () => {
  it("splits local GST into reconciling CGST and SGST components", () => {
    const result = calculateCentralTax({
      entityGstin: "27ABCDE1234F1Z5",
      partyGstin: "27FGHIJ6789K1Z2",
      lines: [{ taxableAmount: "5.00", gstRate: "5" }],
    });

    expect(result.mode).toBe("LOCAL");
    expect(result.lines[0].cgstAmount.toFixed(2)).toBe("0.13");
    expect(result.lines[0].sgstAmount.toFixed(2)).toBe("0.12");
    expect(result.lines[0].igstAmount.toFixed(2)).toBe("0.00");
    expect(result.cgstAmount.plus(result.sgstAmount).eq(result.totalTaxAmount)).toBe(true);
  });

  it("allocates interstate GST entirely to IGST and rounds half-up", () => {
    const result = calculateCentralTax({
      entityGstin: "27ABCDE1234F1Z5",
      partyGstin: "29FGHIJ6789K1Z2",
      lines: [{ taxableAmount: "1.00", gstRate: "2.5" }],
    });

    expect(result.mode).toBe("INTERSTATE");
    expect(result.lines[0].cgstAmount.isZero()).toBe(true);
    expect(result.lines[0].sgstAmount.isZero()).toBe(true);
    expect(result.lines[0].igstAmount.toFixed(2)).toBe("0.03");
  });

  it("rejects a client tax mode that conflicts with GSTIN state codes", () => {
    expect(() => calculateCentralTax({
      entityGstin: "27ABCDE1234F1Z5",
      partyGstin: "29FGHIJ6789K1Z2",
      fallbackMode: "LOCAL",
      lines: [{ taxableAmount: "100.00", gstRate: "18" }],
    })).toThrow("Selected tax mode does not match");
  });
});

describe("assertCentralTaxMasters", () => {
  it("uses organization-scoped HSN and GST master reads", async () => {
    const tx = {
      masterHsn: { findMany: vi.fn().mockResolvedValue([{ hsn_code: "6109" }]) },
      masterGst: {
        findMany: vi.fn().mockResolvedValue([{
          gst: new Prisma.Decimal("18"),
          cgst_rate: null,
          sgst_rate: null,
          igst_rate: null,
        }]),
      },
    };

    await expect(assertCentralTaxMasters(
      tx as unknown as Prisma.TransactionClient,
      "org-internal-A",
      [{ hsnCode: "6109", gstRate: "18" }],
    )).resolves.toBeUndefined();

    expect(tx.masterHsn.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "org-internal-A", is_active: true }),
    }));
    expect(tx.masterGst.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal-A", is_active: true },
    }));
  });

  it("rejects HSN codes absent from the active tenant master", async () => {
    const tx = {
      masterHsn: { findMany: vi.fn().mockResolvedValue([]) },
      masterGst: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(assertCentralTaxMasters(
      tx as unknown as Prisma.TransactionClient,
      "org-internal-A",
      [{ hsnCode: "6109", gstRate: "0" }],
    )).rejects.toThrow("not active in this organization's HSN master");
    expect(tx.masterGst.findMany).not.toHaveBeenCalled();
  });

  it("requires nonzero GST rates in the active GST master", async () => {
    const tx = {
      masterHsn: { findMany: vi.fn().mockResolvedValue([]) },
      masterGst: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(assertCentralTaxMasters(
      tx as unknown as Prisma.TransactionClient,
      "org-internal-A",
      [{ gstRate: "12" }],
    )).rejects.toThrow("GST rate 12.0000% is not active");
  });
});
