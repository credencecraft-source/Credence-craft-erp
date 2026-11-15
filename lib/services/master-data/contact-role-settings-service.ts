import { ContactRoleCommissionType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

const CONTACT_ROLE_CODES = ["CUSTOMER", "VENDOR", "AGENT", "DISTRIBUTOR", "DEALER"] as const;
const MAPPED_ROLE_CODES = ["AGENT", "DISTRIBUTOR", "DEALER"] as const;

export type ContactRoleCode = typeof CONTACT_ROLE_CODES[number];
export type ContactRoleSettingsValues = {
  enabled: boolean;
  notifications: boolean;
  blockBilling: boolean;
  alwaysBillToDistributor: boolean;
  allowOrders: boolean;
  note: string;
  commissionType: "PERCENTAGE" | "FLAT_PER_PIECE";
  useCommonSettings: boolean;
};

export const DEFAULT_CONTACT_ROLE_SETTINGS: ContactRoleSettingsValues = {
  enabled: true,
  notifications: true,
  blockBilling: false,
  alwaysBillToDistributor: false,
  allowOrders: true,
  note: "",
  commissionType: "PERCENTAGE",
  useCommonSettings: false,
};

export class ContactRoleSettingsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class ContactRoleSettingsUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRoleCode(value: string): ContactRoleCode {
  if (!CONTACT_ROLE_CODES.includes(value as ContactRoleCode)) {
    throw new ContactRoleSettingsError("Contact role is invalid.", 400);
  }
  return value as ContactRoleCode;
}

function parseScope(value: unknown, mappedContactId: unknown) {
  if (value === "common" && mappedContactId === undefined) {
    return { scope: "common" as const, mappedContactId: null };
  }
  if (
    value === "individual"
    && typeof mappedContactId === "string"
    && mappedContactId.trim() === mappedContactId
    && mappedContactId.length > 0
    && mappedContactId.length <= 100
  ) {
    return { scope: "individual" as const, mappedContactId };
  }
  throw new ContactRoleSettingsError("Select valid common or individual role settings.", 400);
}

function parseBooleanSetting(value: Record<string, unknown>, key: string): boolean {
  const setting = value[key];
  if (typeof setting !== "boolean") {
    throw new ContactRoleSettingsError(`Role setting "${key}" must be true or false.`, 400);
  }
  return setting;
}

function parseSettings(value: unknown): Omit<ContactRoleSettingsValues, "useCommonSettings"> {
  if (!isRecord(value)) throw new ContactRoleSettingsError("Role settings must be an object.", 400);
  const keys = [
    "enabled",
    "notifications",
    "blockBilling",
    "alwaysBillToDistributor",
    "allowOrders",
    "note",
    "commissionType",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new ContactRoleSettingsError("Role settings contain an unsupported field.", 400);
  }
  if (typeof value.note !== "string" || value.note.length > 500) {
    throw new ContactRoleSettingsError("Configuration note must be 500 characters or fewer.", 400);
  }
  if (value.commissionType !== "PERCENTAGE" && value.commissionType !== "FLAT_PER_PIECE") {
    throw new ContactRoleSettingsError("Commission type is invalid.", 400);
  }
  return {
    enabled: parseBooleanSetting(value, "enabled"),
    notifications: parseBooleanSetting(value, "notifications"),
    blockBilling: parseBooleanSetting(value, "blockBilling"),
    alwaysBillToDistributor: parseBooleanSetting(value, "alwaysBillToDistributor"),
    allowOrders: parseBooleanSetting(value, "allowOrders"),
    note: normalizeUppercase(value.note.trim()),
    commissionType: value.commissionType,
  };
}

function serializeSettings(record: {
  enabled: boolean;
  notifications: boolean;
  block_billing: boolean;
  always_bill_to_distributor: boolean;
  allow_orders: boolean;
  note: string | null;
  commission_type: ContactRoleCommissionType;
  use_common_settings: boolean;
}): ContactRoleSettingsValues {
  return {
    enabled: record.enabled,
    notifications: record.notifications,
    blockBilling: record.block_billing,
    alwaysBillToDistributor: record.always_bill_to_distributor,
    allowOrders: record.allow_orders,
    note: record.note ?? "",
    commissionType: record.commission_type,
    useCommonSettings: record.use_common_settings,
  };
}

function settingWhere(
  organizationId: string,
  contactId: string,
  roleCode: ContactRoleCode,
  mappedContactId: string | null,
) {
  return {
    organization_id: organizationId,
    contact_id: contactId,
    role_code: roleCode,
    mapped_contact_id: mappedContactId,
  };
}

async function assertRoleAndMapping(
  tx: Prisma.TransactionClient,
  organizationId: string,
  contactId: string,
  roleCode: ContactRoleCode,
  mappedContactId: string | null,
) {
  const assignment = await tx.contactRoleAssignment.findFirst({
    where: { organization_id: organizationId, contact_id: contactId, role_code: roleCode, is_active: true },
    select: { contact_id: true },
  });
  if (!assignment) throw new ContactRoleSettingsError("Contact role was not found.", 404);
  if (!mappedContactId) return;
  if (!MAPPED_ROLE_CODES.includes(roleCode as typeof MAPPED_ROLE_CODES[number])) {
    throw new ContactRoleSettingsError("This contact role does not support individual mapped settings.", 400);
  }

  const mapping = roleCode === "DISTRIBUTOR"
    ? await tx.contactDistributorDealerAssignment.findFirst({
      where: {
        organization_id: organizationId,
        distributor_id: contactId,
        dealer_id: mappedContactId,
      },
      select: { id: true },
    })
    : await tx.contactRoleMapping.findFirst({
      where: {
        organization_id: organizationId,
        parent_role_code: roleCode,
        parent_contact_id: contactId,
        mapped_contact_id: mappedContactId,
      },
      select: { id: true },
    });
  if (!mapping) throw new ContactRoleSettingsError("Mapped contact was not found for this role.", 404);
}

function databaseSettingsData(values: Omit<ContactRoleSettingsValues, "useCommonSettings">) {
  return {
    enabled: values.enabled,
    notifications: values.notifications,
    block_billing: values.blockBilling,
    always_bill_to_distributor: values.alwaysBillToDistributor,
    allow_orders: values.allowOrders,
    note: values.note || null,
    commission_type: values.commissionType as ContactRoleCommissionType,
  };
}

export async function getContactRoleSettings(
  organizationId: string,
  contactId: string,
  roleValue: string,
  scopeValue: unknown,
  mappedContactIdValue?: unknown,
) {
  const roleCode = parseRoleCode(roleValue);
  const { mappedContactId } = parseScope(scopeValue, mappedContactIdValue);
  return prisma.$transaction(async (tx) => {
    await assertRoleAndMapping(tx, organizationId, contactId, roleCode, mappedContactId);
    const record = await tx.contactRoleSetting.findFirst({
      where: settingWhere(organizationId, contactId, roleCode, mappedContactId),
    });
    return record ? serializeSettings(record) : { ...DEFAULT_CONTACT_ROLE_SETTINGS };
  });
}

export async function getContactCommonRoleModes(
  organizationId: string,
  contactId: string,
  activeRoleCodes: string[],
) {
  if (!prisma.contactRoleSetting) {
    throw new ContactRoleSettingsUnavailableError(
      "Contact role settings are unavailable in this server process. Regenerate the Prisma client and restart the application.",
    );
  }
  try {
    const settings = await prisma.contactRoleSetting.findMany({
      where: {
        organization_id: organizationId,
        contact_id: contactId,
        mapped_contact_id: null,
        role_code: { in: activeRoleCodes },
      },
      select: { role_code: true, use_common_settings: true },
    });
    return Object.fromEntries(settings.map(({ role_code, use_common_settings }) => [role_code, use_common_settings]));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2021" || error.code === "P2022")
    ) {
      throw new ContactRoleSettingsUnavailableError(
        "Contact role settings migration is pending on this database. Apply the approved migration before using role settings.",
        { cause: error },
      );
    }
    throw error;
  }
}

export async function saveContactRoleSettings(
  organizationId: string,
  actorId: string,
  contactId: string,
  roleValue: string,
  value: unknown,
) {
  if (!isRecord(value)) throw new ContactRoleSettingsError("Role settings request must be an object.", 400);
  const roleCode = parseRoleCode(roleValue);
  const { scope, mappedContactId } = parseScope(value.scope, value.mappedContactId);
  const settings = value.settings === undefined ? undefined : parseSettings(value.settings);
  const useCommonSettings = value.useCommonSettings;
  if (useCommonSettings !== undefined && typeof useCommonSettings !== "boolean") {
    throw new ContactRoleSettingsError("Common settings mode must be true or false.", 400);
  }
  if (!settings && useCommonSettings === undefined) {
    throw new ContactRoleSettingsError("Provide role settings to save.", 400);
  }
  if (scope === "individual" && useCommonSettings !== undefined) {
    throw new ContactRoleSettingsError("Common settings mode can only be changed on common settings.", 400);
  }

  return prisma.$transaction(async (tx) => {
    await assertRoleAndMapping(tx, organizationId, contactId, roleCode, mappedContactId);
    const where = settingWhere(organizationId, contactId, roleCode, mappedContactId);
    const existing = await tx.contactRoleSetting.findFirst({ where, select: { id: true } });
    const data = {
      ...(settings ? databaseSettingsData(settings) : {}),
      ...(useCommonSettings !== undefined ? { use_common_settings: useCommonSettings } : {}),
    };
    if (existing) {
      const updated = await tx.contactRoleSetting.updateMany({
        where: { organization_id: organizationId, id: existing.id },
        data,
      });
      if (updated.count !== 1) throw new ContactRoleSettingsError("Role settings changed while being saved. Refresh and retry.", 409);
    } else {
      await tx.contactRoleSetting.create({
        data: {
          ...where,
          ...databaseSettingsData(settings ?? {
            enabled: DEFAULT_CONTACT_ROLE_SETTINGS.enabled,
            notifications: DEFAULT_CONTACT_ROLE_SETTINGS.notifications,
            blockBilling: DEFAULT_CONTACT_ROLE_SETTINGS.blockBilling,
            alwaysBillToDistributor: DEFAULT_CONTACT_ROLE_SETTINGS.alwaysBillToDistributor,
            allowOrders: DEFAULT_CONTACT_ROLE_SETTINGS.allowOrders,
            note: DEFAULT_CONTACT_ROLE_SETTINGS.note,
            commissionType: DEFAULT_CONTACT_ROLE_SETTINGS.commissionType,
          }),
          use_common_settings: useCommonSettings ?? false,
        },
      });
    }
    const saved = await tx.contactRoleSetting.findFirst({ where });
    if (!saved) throw new Error("Saved contact role settings could not be loaded.");
    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "MASTER_DATA",
      action: "CONTACT_ROLE_SETTINGS_UPDATED",
      entityType: "ContactRoleSetting",
      entityId: saved.id,
      details: {
        contactId,
        roleCode,
        scope,
        ...(mappedContactId ? { mappedContactId } : {}),
        changedFields: [
          ...(settings ? Object.keys(settings).filter((key) => key !== "note") : []),
          ...(settings && settings.note !== "" ? ["note"] : []),
          ...(useCommonSettings !== undefined ? ["useCommonSettings"] : []),
        ],
      },
    }, tx);
    return serializeSettings(saved);
  }, { maxWait: 10000, timeout: 30000 });
}
