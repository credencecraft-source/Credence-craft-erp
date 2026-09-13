import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

export type ProcurementDocumentType = "GROUPED_PO" | "MASTER_GROUP" | "PURCHASE_ORDER";

const documentPrefixes: Record<ProcurementDocumentType, string> = {
  GROUPED_PO: "GP",
  MASTER_GROUP: "MGP",
  PURCHASE_ORDER: "PO",
};

export async function reserveProcurementDocumentNumber(
  organizationId: string,
  documentType: ProcurementDocumentType,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const counter = await database.procurementDocumentCounter.upsert({
    where: { organization_id_document_type: { organization_id: organizationId, document_type: documentType } },
    create: { organization_id: organizationId, document_type: documentType, current_value: 1 },
    update: { current_value: { increment: 1 } },
    select: { current_value: true },
  });

  return `${documentPrefixes[documentType]}-${counter.current_value}`;
}