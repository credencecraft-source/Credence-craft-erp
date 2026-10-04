import { randomUUID } from "node:crypto";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { PLATFORM_LEAD_STAGES, type PlatformLeadStage } from "./platform-lead-constants";

export type PlatformLeadInput = {
  name: string;
  email: string;
  mobile: string;
  companyName: string;
  city: string;
  source: string;
  stage: string;
};

const MAX_IMPORTED_LEADS = 500;

function normalizePlatformLeadInput(input: PlatformLeadInput) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const mobile = input.mobile.trim().replace(/[()\s.-]/g, "");
  const companyName = input.companyName.trim();
  const city = input.city.trim();
  const source = input.source.trim();
  const stage = input.stage.trim();

  if (name.length < 2 || name.length > 255) {
    throw new Error("Enter a name between 2 and 255 characters.");
  }
  if (email.length > 255 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Enter a valid email address.");
  }
  if (mobile.length > 20 || (mobile && !/^\+?[1-9]\d{6,14}$/.test(mobile))) {
    throw new Error("Enter a valid mobile number with country code.");
  }
  if (!email && !mobile) {
    throw new Error("Provide an email address or mobile number.");
  }
  if (companyName.length > 255) {
    throw new Error("Company name must be 255 characters or fewer.");
  }
  if (city.length > 120) {
    throw new Error("City must be 120 characters or fewer.");
  }
  if (source.length > 120) {
    throw new Error("Source must be 120 characters or fewer.");
  }
  if (!PLATFORM_LEAD_STAGES.includes(stage as PlatformLeadStage)) {
    throw new Error("Select a valid lead stage.");
  }

  return {
    name,
    email: email || null,
    mobile: mobile || null,
    company_name: companyName || null,
    city: city || null,
    source: source || null,
    stage: stage as PlatformLeadStage,
  };
}

function normalizeImportedPlatformLead(input: PlatformLeadInput, rowNumber: number) {
  try {
    return normalizePlatformLeadInput(input);
  } catch (error) {
    throw new Error(`Row ${rowNumber}: ${error instanceof Error ? error.message : "Invalid lead data."}`);
  }
}

export async function listPlatformLeads() {
  await requirePlatformSessionAdmin();
  return prisma.platformLead.findMany({
    orderBy: [{ updated_at: "desc" }, { name: "asc" }],
  });
}

export async function importPlatformLeads(inputs: PlatformLeadInput[]) {
  const admin = await requirePlatformSessionAdmin();
  if (inputs.length === 0) throw new Error("The workbook does not contain any lead rows.");
  if (inputs.length > MAX_IMPORTED_LEADS) {
    throw new Error(`Import up to ${MAX_IMPORTED_LEADS} leads at a time.`);
  }

  const normalizedRows = inputs.map((input, index) =>
    normalizeImportedPlatformLead(input, index + 2),
  );

  const leads = normalizedRows.map((normalized) => ({
    id: randomUUID(),
    ...normalized,
  }));
  const auditEvents = leads.map((lead) => ({
    platform_admin_id: admin.id,
    action: "PLATFORM_LEAD_IMPORTED",
    entity_type: "PlatformLead",
    entity_id: lead.id,
    details: {
      companyName: lead.company_name,
      source: lead.source,
      stage: lead.stage,
    },
  }));

  await prisma.$transaction([
    prisma.platformLead.createMany({ data: leads }),
    prisma.platformAuditEvent.createMany({ data: auditEvents }),
  ]);
  return leads.map(({ id }) => id);
}

export async function createPlatformLead(input: PlatformLeadInput) {
  const admin = await requirePlatformSessionAdmin();
  const normalized = normalizePlatformLeadInput(input);

  return prisma.$transaction(async (transaction) => {
    const lead = await transaction.platformLead.create({ data: normalized });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_CREATED",
        entity_type: "PlatformLead",
        entity_id: lead.id,
        details: { companyName: normalized.company_name, source: normalized.source },
      },
    });
    return lead;
  });
}

export async function updatePlatformLead(leadId: string, input: PlatformLeadInput) {
  const admin = await requirePlatformSessionAdmin();
  const id = leadId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid lead.");
  const normalized = normalizePlatformLeadInput(input);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.platformLead.findUnique({ where: { id } });
    if (!existing) throw new Error("Lead not found.");

    const lead = await transaction.platformLead.update({
      where: { id: existing.id },
      data: normalized,
    });
    const changedFields = [
      normalized.name !== existing.name ? "name" : null,
      normalized.email !== existing.email ? "email" : null,
      normalized.mobile !== existing.mobile ? "mobile" : null,
      normalized.company_name !== existing.company_name ? "companyName" : null,
      normalized.city !== existing.city ? "city" : null,
      normalized.source !== existing.source ? "source" : null,
      normalized.stage !== existing.stage ? "stage" : null,
    ].filter((field): field is string => field !== null);
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_UPDATED",
        entity_type: "PlatformLead",
        entity_id: lead.id,
        details: { changedFields },
      },
    });
    return lead;
  });
}
