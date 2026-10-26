import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { requirePlatformNavigationPermission } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import {
  getPlatformLeadAssignedReadScope,
  getPlatformLeadReadScope,
  getPlatformLeadScope,
  isPlatformSalesManager,
  requirePlatformLeadAccess,
} from "./platform-lead-access";
import {
  formatIndianMobileNumber,
  getCanonicalIndianMobileNumber,
  getIndianMobileNumberLookupVariants,
  normalizeIndianMobileNumber,
} from "@/lib/phone/indian-mobile-number";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import {
  PLATFORM_LEAD_CLAIM_BLOCKED_STAGES,
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
  quickNote?: string;
};

const MAX_IMPORTED_LEADS = 500;
const GOOGLE_SHEETS_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

function normalizePlatformLeadInput(input: PlatformLeadInput) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const mobileInput = input.mobile.trim().replace(/^p:/i, "");
  const mobile = mobileInput ? normalizeIndianMobileNumber(mobileInput) : "";
  const companyName = input.companyName.trim();
  const city = input.city.trim();
  const source = input.source.trim();
  const stage = input.stage.trim();
  const natureOfBusiness = input.natureOfBusiness?.trim() ?? "";
  const quickNote = normalizeUppercase(input.quickNote?.trim() ?? "");

  if (name.length < 2 || name.length > 255) {
    throw new Error("Enter a name between 2 and 255 characters.");
  }
  if (email.length > 255 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Enter a valid email address.");
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
  if (quickNote.length > 2000) {
    throw new Error("Quick note must be 2000 characters or fewer.");
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
    ...(input.quickNote === undefined ? {} : { quick_note: quickNote || null }),
  };
}

function normalizeImportedPlatformLead(input: PlatformLeadInput, rowNumber: number) {
  try {
    return normalizePlatformLeadInput(input);
  } catch (error) {
    throw new Error(`Row ${rowNumber}: ${error instanceof Error ? error.message : "Invalid lead data."}`);
  }
}

function readGoogleSheetsLeads(payload: unknown): PlatformLeadInput[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Google Sheets returned an invalid response.");
  }

  const response = payload as Record<string, unknown>;
  if (response.ok !== true || !Array.isArray(response.leads)) {
    throw new Error("Google Sheets could not provide lead data. Check that the Apps Script is saved and redeployed.");
  }
  if (response.leads.length > MAX_IMPORTED_LEADS) {
    throw new Error(`Google Sheets returned more than ${MAX_IMPORTED_LEADS} leads. Sync a smaller sheet batch.`);
  }

  return response.leads.flatMap((value, index) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Google Sheets row ${index + 2} is invalid.`);
    }

    const row = value as Record<string, unknown>;
    if (Object.values(row).some((cell) => typeof cell === "string" && /<test lead:/i.test(cell))) {
      return [];
    }
    const readText = (key: string) => {
      const cell = row[key];
      if (cell === undefined || cell === null) return "";
      if (key === "mobile" && typeof cell === "number" && Number.isSafeInteger(cell)) {
        return String(cell);
      }
      if (typeof cell !== "string") {
        throw new Error(`Google Sheets row ${index + 2} has an invalid ${key} value.`);
      }
      return cell;
    };

    return [{
      name: normalizeUppercase(readText("name")),
      email: readText("email"),
      mobile: readText("mobile"),
      companyName: normalizeUppercase(readText("companyName")),
      city: normalizeUppercase(readText("city")),
      source: normalizeUppercase(readText("source") || "Google Sheets"),
      stage: "1-new",
      natureOfBusiness: normalizeUppercase(readText("natureOfBusiness")),
    }];
  });
}

function buildPlatformLeadImports(
  adminId: string,
  normalizedRows: ReturnType<typeof normalizePlatformLeadInput>[],
  action: string,
) {
  const leads = normalizedRows.map((normalized) => ({
    id: randomUUID(),
    ...normalized,
  }));
  const auditEvents = leads.map((lead) => ({
    platform_admin_id: adminId,
    action,
    entity_type: "PlatformLead",
    entity_id: lead.id,
    details: {
      companyName: lead.company_name,
      source: lead.source,
      stage: lead.stage,
    },
  }));
  return { leads, auditEvents };
}

function validateGoogleSheetsConfiguration(webAppUrl: string) {
  const endpoint = webAppUrl.trim();
  if (!endpoint) throw new Error("Enter the Google Apps Script web-app URL.");

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("Enter a valid Google Apps Script web-app URL.");
  }
  if (
    parsedEndpoint.protocol !== "https:" ||
    parsedEndpoint.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(parsedEndpoint.pathname) ||
    parsedEndpoint.username ||
    parsedEndpoint.password ||
    parsedEndpoint.search ||
    parsedEndpoint.hash
  ) {
    throw new Error("The URL must be a Google Apps Script web-app URL ending in /exec.");
  }
  return parsedEndpoint;
}

async function requestGoogleSheetsLeads(endpoint: URL) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Google Sheets sync timed out. Try again.");
    }
    throw new Error("Unable to reach Google Sheets. Check the Apps Script deployment and try again.");
  }
  if (!response.ok) {
    throw new Error(`Google Sheets sync endpoint returned HTTP ${response.status}.`);
  }

  const responseText = await response.text();
  if (new TextEncoder().encode(responseText).byteLength > GOOGLE_SHEETS_RESPONSE_MAX_BYTES) {
    throw new Error("Google Sheets returned too much data. Sync a smaller sheet batch.");
  }
  try {
    return readGoogleSheetsLeads(JSON.parse(responseText));
  } catch (error) {
    if (error instanceof SyntaxError) {
      if (
        response.headers.get("content-type")?.toLowerCase().includes("text/html") ||
        /^\s*<(?:!doctype|html|head|body)\b/i.test(responseText)
      ) {
        throw new Error(
          "Google Apps Script returned an HTML page instead of JSON. Replace its code with the provided doGet script, save, then update the web-app deployment to execute as you with access set to Anyone.",
        );
      }
      throw new Error("Google Sheets returned an unreadable response. Check the Apps Script deployment.");
    }
    throw error;
  }
}

export async function testPlatformGoogleSheetsLeadConnection(webAppUrl: string) {
  await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
  const endpoint = validateGoogleSheetsConfiguration(webAppUrl);
  const leads = await requestGoogleSheetsLeads(endpoint);
  return { connected: true, availableLeads: leads.length };
}

export async function listPlatformLeads() {
  const admin = await requirePlatformLeadAccess();
  const leads = await prisma.platformLead.findMany({
    where: getPlatformLeadReadScope(admin),
    orderBy: [{ created_at: "desc" }, { name: "asc" }],
    include: {
      assignedSalesManager: { select: { id: true, full_name: true, email: true } },
      campaignEntries: {
        orderBy: { added_at: "desc" },
        take: 1,
        select: {
          added_at: true,
          campaign: { select: { campaign_date: true } },
        },
      },
    },
  });
  return leads.map((lead) => ({
    ...lead,
    mobile: formatIndianMobileNumber(lead.mobile),
  }));
}

export async function listOtherAssignedPlatformLeads() {
  const admin = await requirePlatformLeadAccess();
  if (!isPlatformSalesManager(admin)) {
    throw new Error("Only Sales Managers can view the other-assigned lead queue.");
  }
  const leads = await prisma.platformLead.findMany({
    where: {
      assigned_sales_manager_id: { not: null, notIn: [admin.id] },
    },
    orderBy: [{ created_at: "desc" }, { name: "asc" }],
    include: {
      assignedSalesManager: { select: { id: true, full_name: true, email: true } },
      campaignEntries: {
        orderBy: { added_at: "desc" },
        take: 1,
        select: {
          added_at: true,
          campaign: { select: { campaign_date: true } },
        },
      },
    },
  });
  return leads.map((lead) => ({
    ...lead,
    mobile: formatIndianMobileNumber(lead.mobile),
  }));
}

export async function listPlatformLeadAppLogins() {
  await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
  const users = await prisma.workspaceUser.findMany({
    where: { last_login_at: { not: null } },
    orderBy: [{ created_at: "desc" }, { full_name: "asc" }],
    select: {
      id: true,
      full_name: true,
      email: true,
      mobile_number: true,
      created_at: true,
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
      created_at: user.created_at,
      last_login_at: user.last_login_at,
    };
  });
}

export async function importPlatformLeads(inputs: PlatformLeadInput[]) {
  const admin = await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
  if (inputs.length === 0) throw new Error("The workbook does not contain any lead rows.");
  if (inputs.length > MAX_IMPORTED_LEADS) {
    throw new Error(`Import up to ${MAX_IMPORTED_LEADS} leads at a time.`);
  }

  const normalizedRows = inputs.map((input, index) =>
    normalizeImportedPlatformLead(input, index + 2),
  );

  const { leads, auditEvents } = buildPlatformLeadImports(
    admin.id,
    normalizedRows,
    "PLATFORM_LEAD_IMPORTED",
  );

  await prisma.$transaction([
    prisma.platformLead.createMany({ data: leads }),
    prisma.platformAuditEvent.createMany({ data: auditEvents }),
  ]);
  return leads.map(({ id }) => id);
}

export async function syncPlatformLeadsFromGoogleSheet(webAppUrl: string) {
  const admin = await requirePlatformNavigationPermission("canAccessLeadsAndSubscriptions");
  const endpoint = validateGoogleSheetsConfiguration(webAppUrl);
  const inputs = await requestGoogleSheetsLeads(endpoint);
  if (inputs.length === 0) {
    return { imported: 0, skippedDuplicates: 0 };
  }
  const normalizedRows = inputs.map((input, index) =>
    normalizeImportedPlatformLead(input, index + 2),
  );
  const emails = [...new Set(normalizedRows.map(({ email }) => email).filter((value): value is string => value !== null))];
  const mobiles = [...new Set(normalizedRows.map(({ mobile }) => mobile).filter((value): value is string => value !== null))];
  const mobileLookupVariants = [...new Set(mobiles.flatMap(getIndianMobileNumberLookupVariants))];
  const existingContacts = await prisma.platformLead.findMany({
    where: {
      OR: [
        ...(emails.length ? [{ email: { in: emails } }] : []),
        ...(mobileLookupVariants.length ? [{ mobile: { in: mobileLookupVariants } }] : []),
      ],
    },
    select: { email: true, mobile: true },
  });
  const seenEmails = new Set(existingContacts.map(({ email }) => email).filter((value): value is string => Boolean(value)));
  const seenMobiles = new Set(existingContacts
    .map(({ mobile }) => getCanonicalIndianMobileNumber(mobile))
    .filter((value): value is string => value !== null));
  const newRows: ReturnType<typeof normalizePlatformLeadInput>[] = [];
  let skippedDuplicates = 0;

  for (const row of normalizedRows) {
    const isDuplicate = Boolean(
      (row.email && seenEmails.has(row.email)) ||
      (row.mobile && seenMobiles.has(row.mobile)),
    );
    if (isDuplicate) skippedDuplicates += 1;
    else newRows.push(row);
    if (row.email) seenEmails.add(row.email);
    if (row.mobile) seenMobiles.add(row.mobile);
  }

  if (newRows.length > 0) {
    const { leads, auditEvents } = buildPlatformLeadImports(
      admin.id,
      newRows,
      "PLATFORM_LEAD_GOOGLE_SHEET_IMPORTED",
    );
    await prisma.$transaction([
      prisma.platformLead.createMany({ data: leads }),
      prisma.platformAuditEvent.createMany({ data: auditEvents }),
    ]);
  }

  return { imported: newRows.length, skippedDuplicates };
}

export async function createPlatformLead(input: PlatformLeadInput) {
  const admin = await requirePlatformLeadAccess();
  const normalized = normalizePlatformLeadInput(input);

  return prisma.$transaction(async (transaction) => {
    const lead = await transaction.platformLead.create({
      data: {
        ...normalized,
        ...(isPlatformSalesManager(admin) ? { assigned_sales_manager_id: admin.id } : {}),
      },
    });
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
  const admin = await requirePlatformLeadAccess();
  const scope = getPlatformLeadScope(admin);
  const id = leadId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid lead.");
  const normalized = normalizePlatformLeadInput(input);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.platformLead.findFirst({ where: { id, ...scope } });
    if (!existing) throw new Error("Lead not found.");

    const updated = await transaction.platformLead.updateMany({
      where: { id: existing.id, ...scope },
      data: normalized,
    });
    if (updated.count !== 1) throw new Error("Lead assignment changed. Refresh and try again.");
    const lead = await transaction.platformLead.findFirst({ where: { id: existing.id, ...scope } });
    if (!lead) throw new Error("Lead not found.");
    const changedFields = [
      normalized.name !== existing.name ? "name" : null,
      normalized.email !== existing.email ? "email" : null,
      normalized.mobile !== existing.mobile ? "mobile" : null,
      normalized.company_name !== existing.company_name ? "companyName" : null,
      normalized.city !== existing.city ? "city" : null,
      normalized.source !== existing.source ? "source" : null,
      normalized.stage !== existing.stage ? "stage" : null,
      normalized.nature_of_business !== existing.nature_of_business ? "natureOfBusiness" : null,
      normalized.quick_note !== undefined && normalized.quick_note !== existing.quick_note ? "quickNote" : null,
    ].filter((field): field is string => field !== null);
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_UPDATED",
        entity_type: "PlatformLead",
        entity_id: lead.id,
        details: {
          changedFields,
          ...(normalized.stage !== existing.stage
            ? { previousStage: existing.stage, stage: normalized.stage }
            : {}),
        },
      },
    });
    return lead;
  });
}

export async function updatePlatformLeadStage(leadId: string, stage: string) {
  const admin = await requirePlatformLeadAccess();
  const scope = getPlatformLeadScope(admin);
  const id = leadId.trim();
  const normalizedStage = stage.trim();
  if (!id || id.length > 255) throw new Error("Select a valid lead.");
  if (!PLATFORM_LEAD_STAGES.includes(normalizedStage as PlatformLeadStage)) {
    throw new Error("Select a valid lead stage.");
  }

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.platformLead.findFirst({
      where: { id, ...scope },
      select: { id: true, stage: true },
    });
    if (!existing) throw new Error("Lead not found.");

    const result = await transaction.platformLead.updateMany({
      where: { id: existing.id, stage: existing.stage, ...scope },
      data: { stage: normalizedStage as PlatformLeadStage },
    });
    if (result.count !== 1) {
      throw new Error("This lead status changed. Refresh and try again.");
    }
    const lead = await transaction.platformLead.findFirst({ where: { id: existing.id, ...scope } });
    if (!lead) throw new Error("Lead not found.");
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_STAGE_UPDATED",
        entity_type: "PlatformLead",
        entity_id: existing.id,
        details: { previousStage: existing.stage, stage: normalizedStage },
      },
    });
    return lead;
  });
}

export async function assignPlatformLead(leadId: string, salesManagerId: string | null) {
  const admin = await requirePlatformNavigationPermission("canManageSalesTeam");
  const id = leadId.trim();
  const managerId = salesManagerId?.trim() || null;
  if (!id || id.length > 255 || (managerId && managerId.length > 255)) {
    throw new Error("Select a valid lead and sales manager.");
  }

  return prisma.$transaction(async (transaction) => {
    const lead = await transaction.platformLead.findFirst({
      where: { id, ...getPlatformLeadScope(admin) },
      select: { id: true, assigned_sales_manager_id: true },
    });
    if (!lead) throw new Error("Lead not found.");

    if (managerId) {
      const manager = await transaction.platformAdmin.findFirst({
        where: {
          id: managerId,
          role: "ADMIN",
          team_role: "SALES_MANAGER",
          is_active: true,
          ...(admin.actualRole === "SUPER_ADMIN" ? {} : { manager_id: admin.id }),
        },
        select: { id: true },
      });
      if (!manager) throw new Error("Select an active sales manager on your team.");
    }

    const updated = await transaction.platformLead.updateMany({
      where: { id, assigned_sales_manager_id: lead.assigned_sales_manager_id },
      data: { assigned_sales_manager_id: managerId },
    });
    if (updated.count !== 1) throw new Error("This lead assignment changed. Refresh and try again.");

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: managerId ? "PLATFORM_LEAD_ASSIGNED" : "PLATFORM_LEAD_UNASSIGNED",
        entity_type: "PlatformLead",
        entity_id: id,
        details: {
          previousSalesManagerId: lead.assigned_sales_manager_id,
          salesManagerId: managerId,
        },
      },
    });
    return { id, assigned_sales_manager_id: managerId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function claimPlatformLead(leadId: string) {
  const admin = await requirePlatformLeadAccess();
  if (!isPlatformSalesManager(admin)) {
    throw new Error("Only a Sales Manager can accept an unassigned lead.");
  }
  const id = leadId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid lead.");

  return prisma.$transaction(async (transaction) => {
    const eligibleLead = await transaction.platformLead.findFirst({
      where: {
        id,
        assigned_sales_manager_id: null,
        stage: { notIn: [...PLATFORM_LEAD_CLAIM_BLOCKED_STAGES] },
      },
      select: { stage: true },
    });
    if (!eligibleLead) {
      throw new Error("This lead is not eligible for self-assignment. Ask a CMO to assign it.");
    }
    const result = await transaction.platformLead.updateMany({
      where: {
        id,
        assigned_sales_manager_id: null,
        stage: eligibleLead.stage,
      },
      data: {
        assigned_sales_manager_id: admin.id,
        stage: "Need To Call",
      },
    });
    if (result.count !== 1) {
      throw new Error("This lead is not eligible for self-assignment. Ask a CMO to assign it.");
    }
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_LEAD_CLAIMED",
        entity_type: "PlatformLead",
        entity_id: id,
        details: { salesManagerId: admin.id },
      },
    });
    if (eligibleLead.stage !== "Need To Call") {
      await transaction.platformAuditEvent.create({
        data: {
          platform_admin_id: admin.id,
          action: "PLATFORM_LEAD_STAGE_UPDATED",
          entity_type: "PlatformLead",
          entity_id: id,
          details: {
            previousStage: eligibleLead.stage,
            stage: "Need To Call",
          },
        },
      });
    }
    const lead = await transaction.platformLead.findFirst({
      where: { id, assigned_sales_manager_id: admin.id },
      include: {
        assignedSalesManager: { select: { id: true, full_name: true, email: true } },
        campaignEntries: {
          orderBy: { added_at: "desc" },
          take: 1,
          select: { added_at: true, campaign: { select: { campaign_date: true } } },
        },
      },
    });
    if (!lead) throw new Error("The lead was accepted, but could not be reloaded.");
    return { ...lead, mobile: formatIndianMobileNumber(lead.mobile) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listPlatformLeadStatusHistory(leadId: string) {
  const admin = await requirePlatformLeadAccess();
  const scope = getPlatformLeadAssignedReadScope(admin);
  const id = leadId.trim();
  if (!id || id.length > 255) throw new Error("Select a valid lead.");

  const lead = await prisma.platformLead.findFirst({
    where: { id, ...scope },
    select: { id: true },
  });
  if (!lead) throw new Error("Lead not found.");

  const events = await prisma.platformAuditEvent.findMany({
    where: {
      entity_type: "PlatformLead",
      entity_id: lead.id,
      action: {
        in: [
          "PLATFORM_LEAD_STAGE_UPDATED",
          "PLATFORM_LEAD_STAGE_MOVED",
          "PLATFORM_LEAD_UPDATED",
        ],
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      action: true,
      details: true,
      created_at: true,
      platformAdmin: { select: { full_name: true } },
    },
  });

  return events.flatMap((event) => {
    const details = typeof event.details === "object"
      && event.details !== null
      && !Array.isArray(event.details)
      ? event.details
      : {};
    const changedFields = "changedFields" in details && Array.isArray(details.changedFields)
      ? details.changedFields
      : [];
    if (event.action === "PLATFORM_LEAD_UPDATED" && !changedFields.includes("stage")) {
      return [];
    }

    return [{
      id: event.id,
      previousStage: "previousStage" in details && typeof details.previousStage === "string"
        ? details.previousStage
        : null,
      stage: "stage" in details && typeof details.stage === "string" ? details.stage : null,
      actor: event.platformAdmin?.full_name ?? "Platform team",
      created_at: event.created_at,
    }];
  });
}

export async function listPlatformLeadActivityPage(cursor?: string) {
  const admin = await requirePlatformLeadAccess();
  const scope = getPlatformLeadScope(admin);
  const scopedLeadIds = isPlatformSalesManager(admin)
    ? (await prisma.platformLead.findMany({ where: scope, select: { id: true } })).map(({ id }) => id)
    : null;
  const scopedVoiceNoteIds = scopedLeadIds
    ? scopedLeadIds.length
      ? (await prisma.platformLeadVoiceNote.findMany({
        where: { lead_id: { in: scopedLeadIds } },
        select: { id: true },
      })).map(({ id }) => id)
      : []
    : null;

  const events = await prisma.platformAuditEvent.findMany({
    where: {
      entity_type: { in: ["PlatformLead", "PlatformLeadVoiceNote"] },
      ...(scopedLeadIds
        ? {
          OR: [
            { entity_type: "PlatformLead", entity_id: { in: scopedLeadIds } },
            { entity_type: "PlatformLeadVoiceNote", entity_id: { in: scopedVoiceNoteIds ?? [] } },
          ],
        }
        : {}),
    },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 101,
    select: {
      id: true,
      action: true,
      entity_type: true,
      entity_id: true,
      details: true,
      created_at: true,
      platformAdmin: { select: { full_name: true, email: true } },
    },
  });

  const hasMore = events.length > 100;
  const pageEvents = events.slice(0, 100);
  const activity = pageEvents.map((event) => {
    const details = typeof event.details === "object"
      && event.details !== null
      && !Array.isArray(event.details)
      ? event.details
      : {};
    const leadId = event.entity_type === "PlatformLead"
      ? event.entity_id
      : "leadId" in details && typeof details.leadId === "string"
        ? details.leadId
        : null;
    const changedFields = "changedFields" in details && Array.isArray(details.changedFields)
      ? details.changedFields.filter((field): field is string => typeof field === "string")
      : [];
    const previousStage = "previousStage" in details && typeof details.previousStage === "string"
      ? details.previousStage
      : null;
    const stage = "stage" in details && typeof details.stage === "string"
      ? details.stage
      : null;

    let category: "STATUS" | "VOICE_NOTE" | "LEAD" | "IMPORT" | "OTHER" = "OTHER";
    let summary = event.action
      .replace(/^PLATFORM_LEAD_/, "")
      .toLowerCase()
      .replace(/_/g, " ");
    if (event.action === "PLATFORM_LEAD_VOICE_NOTE_CREATED") {
      category = "VOICE_NOTE";
      summary = "Voice note uploaded";
      if ("source" in details && details.source === "RECORDED") {
        summary = "Voice note recorded";
      }
    } else if (
      event.action === "PLATFORM_LEAD_STAGE_UPDATED"
      || event.action === "PLATFORM_LEAD_STAGE_MOVED"
      || (event.action === "PLATFORM_LEAD_UPDATED" && changedFields.includes("stage"))
    ) {
      category = "STATUS";
      summary = previousStage && stage
        ? `Status changed from ${previousStage} to ${stage}`
        : `Status set to ${stage ?? "updated"}`;
    } else if (event.action === "PLATFORM_LEAD_CREATED") {
      category = "LEAD";
      summary = "Lead created";
    } else if (
      event.action === "PLATFORM_LEAD_IMPORTED"
      || event.action === "PLATFORM_LEAD_GOOGLE_SHEET_IMPORTED"
    ) {
      category = "IMPORT";
      summary = event.action === "PLATFORM_LEAD_GOOGLE_SHEET_IMPORTED"
        ? "Lead imported from Google Sheets"
        : "Lead imported";
    } else if (event.action === "PLATFORM_LEAD_UPDATED") {
      category = "LEAD";
      const fieldLabels: Record<string, string> = {
        name: "name",
        email: "email",
        mobile: "mobile",
        companyName: "company",
        city: "city",
        source: "source",
        natureOfBusiness: "business details",
        quickNote: "quick note",
      };
      const changedLabels = changedFields
        .map((field) => fieldLabels[field])
        .filter((field): field is string => Boolean(field));
      summary = changedLabels.length
        ? `Lead updated: ${changedLabels.join(", ")}`
        : "Lead updated";
    }

    return {
      id: event.id,
      leadId,
      category,
      summary,
      leadName: null as string | null,
      actor: event.platformAdmin?.full_name ?? "Platform team",
      actorEmail: event.platformAdmin?.email ?? null,
      created_at: event.created_at,
    };
  });
  const leadIds = [...new Set(activity
    .map(({ leadId }) => leadId)
    .filter((leadId): leadId is string => leadId !== null))];
  const leads = leadIds.length
    ? await prisma.platformLead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, name: true },
    })
    : [];
  const namesByLeadId = new Map(leads.map((lead) => [lead.id, lead.name]));

  const items = activity.map((item) => ({
    ...item,
    leadName: item.leadId ? namesByLeadId.get(item.leadId) ?? null : null,
  }));
  return {
    activity: items,
    nextCursor: hasMore ? pageEvents[pageEvents.length - 1]?.id ?? null : null,
  };
}

export async function listPlatformLeadActivity() {
  const page = await listPlatformLeadActivityPage();
  return page.activity;
}

export async function movePlatformLeadStages(
  leadIds: string[],
  direction: "NEXT" | "PREVIOUS",
) {
  const admin = await requirePlatformLeadAccess();
  const scope = getPlatformLeadScope(admin);
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
      where: { id: { in: ids }, ...scope },
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
          ...scope,
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
  const admin = await requirePlatformLeadAccess();
  const scope = getPlatformLeadScope(admin);
  if (!Array.isArray(leadIds) || leadIds.length === 0 || leadIds.length > 500) {
    throw new Error("Select between 1 and 500 new leads.");
  }
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length !== leadIds.length || ids.some((id) => id.length > 255)) {
    throw new Error("Select valid leads.");
  }
  if (stage !== "Verification" && stage !== "MARK AS FROUD") {
    throw new Error("Select a valid status for new leads.");
  }

  return prisma.$transaction(async (transaction) => {
    const records = await transaction.platformLead.findMany({
      where: { id: { in: ids }, ...scope },
      select: { id: true, stage: true },
    });
    if (records.length !== ids.length || records.some((lead) => lead.stage !== "1-new")) {
      throw new Error("Only leads currently in New can use these actions. Refresh and try again.");
    }

    const result = await transaction.platformLead.updateMany({
      where: { id: { in: ids }, stage: "1-new", ...scope },
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
  const admin = await requirePlatformLeadAccess();
  const scope = getPlatformLeadScope(admin);
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
      where: { id: { in: ids }, ...scope },
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
          ...scope,
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
