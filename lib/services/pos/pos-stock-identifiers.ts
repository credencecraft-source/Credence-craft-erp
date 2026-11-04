import { normalizeUppercase } from "@/lib/utilities/text-case";

type PosStockIdentifierDatabase = {
  procurementDocumentCounter: {
    upsert(args: {
      where: {
        organization_id_document_type: {
          organization_id: string;
          document_type: string;
        };
      };
      create: {
        organization_id: string;
        document_type: string;
        current_value: number;
      };
      update: { current_value: { increment: number } };
      select: { current_value: true };
    }): Promise<{ current_value: number }>;
  };
  finishedGoodsSkuStock: {
    findFirst(args: {
      where: { organization_id: string; barcode: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

const POS_BARCODE_COUNTER_TYPE = "POS_BARCODE";
const MAX_BARCODE_RESERVATIONS = 1000;

function normalizeSkuPart(value: string) {
  return normalizeUppercase(value)
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPosStockSkuCode(
  styleName: string,
  colour: string,
  size: string,
) {
  const parts = [styleName, colour, size].map(normalizeSkuPart);
  if (parts.some((part) => !part)) return null;
  const skuCode = parts.join("-");
  return skuCode.length <= 50 ? skuCode : null;
}

export async function reserveNextPosBarcode(
  database: PosStockIdentifierDatabase,
  organizationId: string,
) {
  for (let attempt = 0; attempt < MAX_BARCODE_RESERVATIONS; attempt += 1) {
    const counter = await database.procurementDocumentCounter.upsert({
      where: {
        organization_id_document_type: {
          organization_id: organizationId,
          document_type: POS_BARCODE_COUNTER_TYPE,
        },
      },
      create: {
        organization_id: organizationId,
        document_type: POS_BARCODE_COUNTER_TYPE,
        current_value: 1,
      },
      update: { current_value: { increment: 1 } },
      select: { current_value: true },
    });
    const barcode = `POS${counter.current_value}`;
    const existing = await database.finishedGoodsSkuStock.findFirst({
      where: { organization_id: organizationId, barcode },
      select: { id: true },
    });
    if (!existing) return barcode;
  }

  throw new Error("Unable to reserve a unique POS barcode. Try again.");
}
