import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "./organization-service";

export const CHALLAN_NUMBER_DEFINITIONS = [
  { documentType: "DELIVERY_CHALLAN", label: "Delivery Challan", defaultPrefix: "DC", tables: "Finance delivery challans" },
  { documentType: "RAW_MATERIAL_DC", label: "Raw Material DC", defaultPrefix: "RDC", tables: "Inventory outward raw-material DC" },
  { documentType: "GATE_ENTRY", label: "Gate Entry", defaultPrefix: "GE", tables: "Security gate entries" },
  { documentType: "RM_GRN", label: "RM GRN", defaultPrefix: "GRN", tables: "Inventory receipts" },
  { documentType: "FACTORY_GRN", label: "Factory GRN", defaultPrefix: "FGRN", tables: "Factory GRN records" },
  { documentType: "PURCHASE_BILL", label: "Purchase Bill", defaultPrefix: "PB", tables: "POS purchase bills" },
] as const;

type NumberDefinition = (typeof CHALLAN_NUMBER_DEFINITIONS)[number];
type Database = Prisma.TransactionClient | typeof prisma;

function getDefinition(documentType: string): NumberDefinition {
  const definition = CHALLAN_NUMBER_DEFINITIONS.find((item) => item.documentType === documentType);
  if (!definition) throw new Error("Unsupported challan document type.");
  return definition;
}

function cleanPrefix(value: unknown) {
  const prefix = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(prefix)) throw new Error("Prefix must contain 1 to 20 letters, numbers, or hyphens.");
  return prefix;
}

function cleanStartNumber(value: unknown) {
  const startNumber = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(startNumber) || startNumber < 1 || startNumber > 2147483647) throw new Error("Start number must be a whole number greater than zero.");
  return startNumber;
}

async function ensureConfiguration(organizationId: string, definition: NumberDefinition, database: Database = prisma) {
  const where = { organization_id_document_type: { organization_id: organizationId, document_type: definition.documentType } };
  try {
    return await database.challanNumberConfiguration.upsert({
      where,
      create: { organization_id: organizationId, document_type: definition.documentType, label: definition.label, prefix: definition.defaultPrefix, start_number: 1, current_number: 0 },
      update: {},
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return database.challanNumberConfiguration.findUniqueOrThrow({ where });
  }
}

export async function listChallanNumberConfigurations(organizationId: string) {
  return Promise.all(CHALLAN_NUMBER_DEFINITIONS.map(async (definition) => {
    const configuration = await ensureConfiguration(organizationId, definition);
    return {
      ...configuration,
      tables: definition.tables,
      nextNumber: Math.max(configuration.start_number, configuration.current_number + 1),
    };
  }));
}

export async function updateChallanNumberConfiguration(organizationId: string, workspaceUserId: string, documentType: string, input: { prefix: unknown; startNumber: unknown }) {
  await requireOrganizationPermission(workspaceUserId, organizationId, "ORGANIZATION_SETTINGS");
  const definition = getDefinition(documentType);
  const prefix = cleanPrefix(input.prefix);
  const startNumber = cleanStartNumber(input.startNumber);
  const existing = await ensureConfiguration(organizationId, definition);
  const currentNumber = existing.current_number === 0 ? startNumber - 1 : Math.max(existing.current_number, startNumber - 1);
  return prisma.challanNumberConfiguration.update({
    where: { id: existing.id },
    data: { prefix, start_number: startNumber, current_number: currentNumber },
  });
}

export async function reserveChallanNumber(organizationId: string, documentType: string, database: Database = prisma) {
  const definition = getDefinition(documentType);
  const configuration = await ensureConfiguration(organizationId, definition, database);
  const updated = await database.challanNumberConfiguration.update({
    where: { id: configuration.id },
    data: { current_number: { increment: 1 } },
    select: { prefix: true, current_number: true },
  });
  return `${updated.prefix}-${updated.current_number}`;
}
