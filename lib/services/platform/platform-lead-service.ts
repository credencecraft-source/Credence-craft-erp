import { randomUUID } from "node:crypto";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import {
  PLATFORM_LEAD_STAGES,
  PLATFORM_LEAD_THIRD_PARTY_STAGES,
  type PlatformLeadStage,
} from "./platform-lead-constants";

export type PlatformLeadInput = {
  name: string;
  email: string;
  mobile: string;
  companyName: string;
  city: string;
  source: string;
  stage: string;
  natureOfBusiness?: string;
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
  const natureOfBusiness = input.natureOfBusiness?.trim() ?? "";

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
  if (natureOfBusiness.length > 2000) {
    throw new Error("Nature of business must be 2000 characters or fewer.");
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
    nature_of_business: natureOfBusiness || null,
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

export async function listPlatformLeadAppLogins() {
  await requirePlatformSessionAdmin();
  const users = await prisma.workspaceUser.findMany({
    where: { last_login_at: { not: null } },
    orderBy: [{ last_login_at: "desc" }, { full_name: "asc" }],
    select: {
      id: true,
      full_name: true,
      email: true,
      mobile_number: true,
      last_login_at: true,
      organizationMemberships: {
        where: { is_active: true },
        select: {
          organization: {
            select: {
              organization_name: true,
              city: true,
              is_active: true,
            },
          },
        },
      },
    },
  });

  return users.map((user) => {
    const activeOrganizations = user.organizationMemberships
      .map(({ organization }) => organization)
      .filter((organization) => organization.is_active);
    const cities = [...new Set(
      activeOrganizations.map(({ city }) => city?.trim()).filter((city): city is string => Boolean(city)),
    )];

    return {
      id: user.id,
      name: user.full_name,
      email: user.email,
      mobile: user.mobile_number,
      company_name: activeOrganizations.map(({ organization_name }) => organization_name).join(", ") || null,
      city: cities.join(", ") || null,
      source: "App login",
      stage: "Logged in",
      last_login_at: user.last_login_at,
    };
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
      normalized.nature_of_business !== existing.nature_of_business ? "natureOfBusiness" : null,
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

export async function updatePlatformLeadStage(leadId: string, stage: string) {
  const admin = await requirePlatformSessionAdmin();
  const id = leadId.trim();
  const normalizedStage = stage.trim();
  if (!id || id.length > 255) throw new Error("Select a valid lead.");
  if (!PLATFORM_LEAD_STAGES.includes(normalizedStage as PlatformLeadStage)) {
    throw new Error("Select a valid lead stage.");
  }

  const existing = await prisma.platformLead.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new Error("Lead not found.");

  const update = prisma.platformLead.update({
    where: { id: existing.id },
    data: { stage: normalizedStage as PlatformLeadStage },
  });
  const audit = prisma.platformAuditEvent.create({
    data: {
      platform_admin_id: admin.id,
      action: "PLATFORM_LEAD_STAGE_UPDATED",
      entity_type: "PlatformLead",
      entity_id: existing.id,
      details: { stage: normalizedStage },
    },
  });
  const [lead] = await prisma.$transaction([update, audit]);
  return lead;
}

export async function movePlatformLeadStages(
  leadIds: string[],
  direction: "NEXT" | "PREVIOUS",
) {
  const admin = await requirePlatformSessionAdmin();
  if (!Array.isArray(leadIds) || leadIds.length === 0 || leadIds.length > 500) {
    throw new Error("Select between 1 and 500 leads to move.");
  }
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length !== leadIds.length || ids.some((id) => id.length > 255)) {
    throw new Error("Select valid leads.");
  }
  if (direction !== "NEXT" && direction !== "PREVIOUS") {
    throw new Error("Select a valid status movement.");
  }

  return prisma.$transaction(async (transaction) => {
    const records = await transaction.platformLead.findMany({
      where: { id: { in: ids } },
      select: { id: true, stage: true },
    });
    if (records.length !== ids.length) throw new Error("One or more selected leads were not found.");
    if (records.some((lead) => !PLATFORM_LEAD_THIRD_PARTY_STAGES.includes(lead.stage as (typeof PLATFORM_LEAD_THIRD_PARTY_STAGES)[number]))) {
      throw new Error("Only 3rd Party leads can be moved between statuses.");
    }

    const changes = records.flatMap((lead) => {
      const currentIndex = PLATFORM_LEAD_THIRD_PARTY_STAGES.indexOf(
        lead.stage as (typeof PLATFORM_LEAD_THIRD_PARTY_STAGES)[number],
      );
      const nextIndex = currentIndex + (direction === "NEXT" ? 1 : -1);
      const nextStage = PLATFORM_LEAD_THIRD_PARTY_STAGES[nextIndex];
      return nextStage ? [{ leadId: lead.id, previousStage: lead.stage, nextStage }] : [];
    });
    const skippedCount = records.length - changes.length;
    if (changes.length === 0) return { updatedCount: 0, skippedCount };

    const stageGroups = new Map<string, typeof changes>();
    for (const change of changes) {
      const group = stageGroups.get(change.previousStage) ?? [];
      group.push(change);
      stageGroups.set(change.previousStage, group);
    }
    for (const [previousStage, group] of stageGroups) {
      const result = await transaction.platformLead.updateMany({
        where: {
          id: { in: group.map(({ leadId }) => leadId) },
          stage: previousStage,
        },
        data: { stage: group[0].nextStage },
      });
      if (result.count !== group.length) {
        throw new Error("A selected lead changed status. Refresh and try again.");
      }
    }

    await transaction.platformAuditEvent.createMany({
      data: changes.map(({ leadId, previousStage, nextStage }) => ({
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_STAGE_MOVED",
        entity_type: "PlatformLead",
        entity_id: leadId,
        details: { previousStage, stage: nextStage, direction },
      })),
    });
    return { updatedCount: changes.length, skippedCount };
  });
}

export async function updateNewPlatformLeadStages(leadIds: string[], stage: string) {
  const admin = await requirePlatformSessionAdmin();
  if (!Array.isArray(leadIds) || leadIds.length === 0 || leadIds.length > 500) {
    throw new Error("Select between 1 and 500 new leads.");
  }
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length !== leadIds.length || ids.some((id) => id.length > 255)) {
    throw new Error("Select valid leads.");
  }
  if (stage !== "Interested For Demo" && stage !== "MARK AS FROUD") {
    throw new Error("Select a valid status for new leads.");
  }

  return prisma.$transaction(async (transaction) => {
    const records = await transaction.platformLead.findMany({
      where: { id: { in: ids } },
      select: { id: true, stage: true },
    });
    if (records.length !== ids.length || records.some((lead) => lead.stage !== "1-new")) {
      throw new Error("Only leads currently in New can use these actions. Refresh and try again.");
    }

    const result = await transaction.platformLead.updateMany({
      where: { id: { in: ids }, stage: "1-new" },
      data: { stage },
    });
    if (result.count !== ids.length) {
      throw new Error("A selected lead changed status. Refresh and try again.");
    }
    await transaction.platformAuditEvent.createMany({
      data: records.map((lead) => ({
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_STAGE_UPDATED",
        entity_type: "PlatformLead",
        entity_id: lead.id,
        details: { previousStage: lead.stage, stage },
      })),
    });
    return { updatedCount: result.count };
  });
}

export async function updatePlatformLeadStages(leadIds: string[], stage: string) {
  const admin = await requirePlatformSessionAdmin();
  if (!Array.isArray(leadIds) || leadIds.length === 0 || leadIds.length > 500) {
    throw new Error("Select between 1 and 500 leads.");
  }
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length !== leadIds.length || ids.some((id) => id.length > 255)) {
    throw new Error("Select valid leads.");
  }
  const normalizedStage = stage.trim();
  if (!PLATFORM_LEAD_STAGES.includes(normalizedStage as PlatformLeadStage)) {
    throw new Error("Select a valid lead stage.");
  }

  return prisma.$transaction(async (transaction) => {
    const records = await transaction.platformLead.findMany({
      where: { id: { in: ids } },
      select: { id: true, stage: true },
    });
    if (records.length !== ids.length) throw new Error("One or more selected leads were not found.");

    const changes = records.filter((lead) => lead.stage !== normalizedStage);
    if (changes.length === 0) {
      return { updatedCount: 0, unchangedCount: records.length };
    }

    const stageGroups = new Map<string, typeof changes>();
    for (const change of changes) {
      const group = stageGroups.get(change.stage) ?? [];
      group.push(change);
      stageGroups.set(change.stage, group);
    }
    for (const [previousStage, group] of stageGroups) {
      const result = await transaction.platformLead.updateMany({
        where: {
          id: { in: group.map(({ id }) => id) },
          stage: previousStage,
        },
        data: { stage: normalizedStage },
      });
      if (result.count !== group.length) {
        throw new Error("A selected lead changed status. Refresh and try again.");
      }
    }

    await transaction.platformAuditEvent.createMany({
      data: changes.map((lead) => ({
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_STAGE_UPDATED",
        entity_type: "PlatformLead",
        entity_id: lead.id,
        details: { previousStage: lead.stage, stage: normalizedStage },
      })),
    });
    return {
      updatedCount: changes.length,
      unchangedCount: records.length - changes.length,
    };
  });
}
