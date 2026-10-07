import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

export type ProcurementDocumentType =
  | "GROUPED_PO"
  | "MASTER_GROUP"
  | "PURCHASE_ORDER"
  | "RM_OUTWARD_REQUEST"
  | "RM_OUTWARD_BOX"
  | "RM_OUTWARD_PACKING_LIST"
  | "FG_OUTWARD_REQUEST"
  | "FG_OUTWARD_BOX"
  | "FG_OUTWARD_PACKING_LIST"
  | "ADVANCE_BOOKING"
  | "DISTRIBUTION_QUOTATION"
  | "DISTRIBUTION_MASTER_QUOTATION"
  | "POS_SALES_INVOICE";

const documentPrefixes: Record<ProcurementDocumentType, string> = {
  GROUPED_PO: "GP",
  MASTER_GROUP: "MGP",
  PURCHASE_ORDER: "PO",
  RM_OUTWARD_REQUEST: "RMR",
  RM_OUTWARD_BOX: "RM-BOX",
  RM_OUTWARD_PACKING_LIST: "RM-PL",
  FG_OUTWARD_REQUEST: "FGR",
  FG_OUTWARD_BOX: "FG-BOX",
  FG_OUTWARD_PACKING_LIST: "FG-PL",
  ADVANCE_BOOKING: "BK",
  DISTRIBUTION_QUOTATION: "QT",
  DISTRIBUTION_MASTER_QUOTATION: "MQT",
  POS_SALES_INVOICE: "POS",
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