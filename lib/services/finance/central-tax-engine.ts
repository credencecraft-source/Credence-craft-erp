import { Prisma } from "@prisma/client";

export type CentralTaxMode = "LOCAL" | "INTERSTATE";

export type CentralTaxLineInput = {
  taxableAmount: Prisma.Decimal | string;
  gstRate: Prisma.Decimal | string;
};

export type CentralTaxLine = {
  taxableAmount: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  totalTaxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

export type CentralTaxCalculation = {
  mode: CentralTaxMode;
  placeOfSupplyStateCode: string | null;
  lines: CentralTaxLine[];
  taxableAmount: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  totalTaxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

export async function assertCentralTaxMasters(
  tx: Prisma.TransactionClient,
  organizationId: string,
  lines: readonly { hsnCode?: string | null; gstRate: Prisma.Decimal | string }[],
) {
  const requiredHsnCodes = [...new Set(lines
    .map((line) => line.hsnCode?.trim().toUpperCase())
    .filter((code): code is string => Boolean(code)))];
  const requiredRates = [...new Set(lines.map((line) =>
    decimal(line.gstRate, "GST rate").toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4),
  ).filter((rate) => rate !== "0.0000"))];
  const [hsnMasters, gstMasters] = await Promise.all([
    requiredHsnCodes.length
      ? tx.masterHsn.findMany({
          where: {
            organization_id: organizationId,
            is_active: true,
            hsn_code: { in: requiredHsnCodes },
          },
          select: { hsn_code: true },
        })
      : Promise.resolve([]),
    requiredRates.length
      ? tx.masterGst.findMany({
          where: { organization_id: organizationId, is_active: true },
          select: { gst: true, cgst_rate: true, sgst_rate: true, igst_rate: true },
        })
      : Promise.resolve([]),
  ]);
  const activeHsnCodes = new Set(hsnMasters.map((master) => master.hsn_code.trim().toUpperCase()));
  const missingHsn = requiredHsnCodes.find((code) => !activeHsnCodes.has(code));
  if (missingHsn) throw new Error(`HSN code ${missingHsn} is not active in this organization's HSN master.`);

  const activeRates = new Set<string>();
  for (const master of gstMasters) {
    const totalRate = master.gst
      ?? (master.cgst_rate && master.sgst_rate
        ? master.cgst_rate.plus(master.sgst_rate)
        : master.igst_rate);
    if (totalRate) {
      activeRates.add(totalRate.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4));
    }
  }
  const missingRate = requiredRates.find((rate) => !activeRates.has(rate));
  if (missingRate) throw new Error(`GST rate ${missingRate}% is not active in this organization's GST master.`);
}

function decimal(value: Prisma.Decimal | string, field: string) {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value);
  } catch {
    throw new Error(`${field} must be a valid decimal value.`);
  }
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new Error(`${field} must be a finite non-negative value.`);
  }
  return parsed;
}

function normalizeStateCode(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const stateCode = value.trim();
  if (!/^\d{2}$/.test(stateCode)) {
    throw new Error("Place-of-supply state code must contain two digits.");
  }
  return stateCode;
}

function stateCodeFromGstin(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const gstin = value.trim().toUpperCase();
  if (!/^\d{2}[A-Z0-9]{13}$/.test(gstin)) {
    throw new Error("GSTIN must contain a valid two-digit state code and 13-character identifier.");
  }
  return gstin.slice(0, 2);
}

export function resolveCentralTaxMode(input: {
  entityGstin?: string | null;
  partyGstin?: string | null;
  placeOfSupplyStateCode?: string | null;
  fallbackMode?: CentralTaxMode;
}) {
  const entityStateCode = stateCodeFromGstin(input.entityGstin);
  const partyStateCode = stateCodeFromGstin(input.partyGstin);
  const explicitPlaceOfSupplyStateCode = normalizeStateCode(input.placeOfSupplyStateCode);
  const comparisonStateCode = partyStateCode ?? explicitPlaceOfSupplyStateCode;
  const resolvedMode = entityStateCode && comparisonStateCode
    ? entityStateCode === comparisonStateCode ? "LOCAL" : "INTERSTATE"
    : input.fallbackMode;

  if (!resolvedMode) {
    throw new Error("Tax jurisdiction requires entity GSTIN, party/place-of-supply state, or an explicit tax mode.");
  }
  if (input.fallbackMode && entityStateCode && comparisonStateCode && input.fallbackMode !== resolvedMode) {
    throw new Error("Selected tax mode does not match the entity and place-of-supply GSTIN state codes.");
  }

  return {
    mode: resolvedMode,
    placeOfSupplyStateCode: explicitPlaceOfSupplyStateCode
      ?? partyStateCode
      ?? (resolvedMode === "LOCAL" ? entityStateCode : null),
  };
}

export function calculateCentralTax(input: {
  lines: CentralTaxLineInput[];
  entityGstin?: string | null;
  partyGstin?: string | null;
  placeOfSupplyStateCode?: string | null;
  fallbackMode?: CentralTaxMode;
}): CentralTaxCalculation {
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 1000) {
    throw new Error("A central tax calculation requires between 1 and 1,000 lines.");
  }

  const jurisdiction = resolveCentralTaxMode(input);
  const lines = input.lines.map((line) => {
    const taxableAmount = decimal(line.taxableAmount, "Taxable amount")
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const gstRate = decimal(line.gstRate, "GST rate");
    if (gstRate.gt(100)) throw new Error("GST rate cannot exceed 100 percent.");
    const totalTaxAmount = taxableAmount.mul(gstRate).div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const cgstAmount = jurisdiction.mode === "LOCAL"
      ? totalTaxAmount.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal(0);
    const sgstAmount = jurisdiction.mode === "LOCAL"
      ? totalTaxAmount.minus(cgstAmount)
      : new Prisma.Decimal(0);
    const igstAmount = jurisdiction.mode === "INTERSTATE"
      ? totalTaxAmount
      : new Prisma.Decimal(0);

    return {
      taxableAmount,
      gstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTaxAmount,
      totalAmount: taxableAmount.plus(totalTaxAmount),
    };
  });

  const totals = lines.reduce((result, line) => ({
    taxableAmount: result.taxableAmount.plus(line.taxableAmount),
    cgstAmount: result.cgstAmount.plus(line.cgstAmount),
    sgstAmount: result.sgstAmount.plus(line.sgstAmount),
    igstAmount: result.igstAmount.plus(line.igstAmount),
    totalTaxAmount: result.totalTaxAmount.plus(line.totalTaxAmount),
    totalAmount: result.totalAmount.plus(line.totalAmount),
  }), {
    taxableAmount: new Prisma.Decimal(0),
    cgstAmount: new Prisma.Decimal(0),
    sgstAmount: new Prisma.Decimal(0),
    igstAmount: new Prisma.Decimal(0),
    totalTaxAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(0),
  });

  if (!totals.cgstAmount.plus(totals.sgstAmount).plus(totals.igstAmount).eq(totals.totalTaxAmount)) {
    throw new Error("Tax component totals do not reconcile to the calculated tax.");
  }
  if (!totals.taxableAmount.plus(totals.totalTaxAmount).eq(totals.totalAmount)) {
    throw new Error("Taxable and tax totals do not reconcile to the document total.");
  }

  return { ...jurisdiction, lines, ...totals };
}
