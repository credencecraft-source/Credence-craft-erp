import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";

import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import { prisma } from "@/lib/database/prisma-client";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

const MODULES = {
  configuration: ["essl-integration-configuration", "ESSL Integration Configuration"],
  machines: ["essl-biometric-machines", "ESSL Biometric Machines"],
  templates: ["essl-biometric-templates", "ESSL Biometric Templates"],
  attendance: ["essl-attendance-logs", "ESSL Attendance Logs"],
} as const;
export const ESSL_ATTENDANCE_RECEIVER_PATH = "/api/integrations/essl/attendance";
const MAX_PUSH_BYTES = 64 * 1024;

type EsslMachine = {
  id: string;
  serialNumber: string;
  entityId: string;
  entityName: string;
  location: string;
  isActive: boolean;
};

type EsslTemplate = {
  id: string;
  name: string;
  entityId: string;
  entityName: string;
  machineIds: string[];
};

type EsslPushLog = {
  id: string;
  receivedAt: string;
  payload: string;
};

type EsslConfiguration = {
  attendanceApiUrl: string;
  receiverToken: string;
  isActive: boolean;
};

function moduleId(moduleKey: string, organizationId: string) {
  return prisma.masterModule.findUnique({
    where: { organization_id_module_key: { organization_id: organizationId, module_key: moduleKey } },
    select: { id: true },
  });
}

async function ensureModule(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  [moduleKey, moduleName]: readonly [string, string],
) {
  return transaction.masterModule.upsert({
    where: {
      organization_id_module_key: {
        organization_id: organizationId,
        module_key: moduleKey,
      },
    },
    create: {
      organization_id: organizationId,
      module_key: moduleKey,
      module_name: moduleName,
      status: "active",
    },
    update: { status: "active", module_name: moduleName },
    select: { id: true },
  });
}

async function authorize(workspaceUserId: string, publicOrganizationId: string) {
  const organization = await getOrganizationForUser(
    workspaceUserId,
    publicOrganizationId,
  );
  if (!organization) {
    throw new Error("Access denied: You are not a member of this organization.");
  }
  await requireOrganizationPermission(
    workspaceUserId,
    organization.id,
    "MANAGE_MASTER_DATA",
  );
  return organization;
}

function metadataObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function recordId(prefix: string, organizationId: string, uniqueValue: string) {
  const digest = createHash("sha256")
    .update(`${organizationId}\0${uniqueValue}`)
    .digest("hex");
  return `${prefix}-${digest}`;
}

export function hasMatchingEsslPushToken(
  candidateToken: string,
  encryptedToken: string,
) {
  if (!candidateToken || candidateToken.length > 255 || !encryptedToken) return false;
  const expected = Buffer.from(decryptSecret(encryptedToken));
  const actual = Buffer.from(candidateToken);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function validateEsslPushPayload(payload: string) {
  const byteLength = Buffer.byteLength(payload, "utf8");
  if (byteLength === 0) throw new Error("ESSL attendance push cannot be empty.");
  if (byteLength > MAX_PUSH_BYTES) {
    throw new Error("ESSL attendance push exceeds the 64 KB limit.");
  }
}

export async function getEsslIntegrationData(
  workspaceUserId: string,
  publicOrganizationId: string,
) {
  const organization = await authorize(workspaceUserId, publicOrganizationId);
  const keys = Object.values(MODULES).map(([key]) => key);
  const [rows, entities] = await Promise.all([
    prisma.masterModuleValue.findMany({
      where: {
        module: {
          organization_id: organization.id,
          module_key: { in: keys },
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: {
        id: true,
        label: true,
        code: true,
        is_active: true,
        metadata: true,
      },
    }),
    prisma.masterEntity.findMany({
      where: { organization_id: organization.id },
      orderBy: { entity_name: "asc" },
      select: { id: true, entity_name: true },
    }),
  ]);
  let configuration: EsslConfiguration = {
    attendanceApiUrl: "",
    receiverToken: "",
    isActive: false,
  };
  const machines: EsslMachine[] = [];
  const templates: EsslTemplate[] = [];
  const attendanceLogs: EsslPushLog[] = [];
  for (const row of rows) {
    const data = metadataObject(row.metadata);
    switch (data.kind) {
      case "configuration":
        configuration = {
          attendanceApiUrl: stringValue(data.attendanceApiUrl),
          receiverToken: stringValue(data.receiverTokenEncrypted)
            ? decryptSecret(stringValue(data.receiverTokenEncrypted))
            : "",
          isActive: row.is_active && data.isActive === true,
        };
        break;
      case "machine":
        machines.push({
          id: row.id,
          serialNumber: stringValue(data.serialNumber),
          entityId: stringValue(data.entityId),
          entityName: stringValue(data.entityName),
          location: stringValue(data.location),
          isActive: row.is_active,
        });
        break;
      case "template":
        templates.push({
          id: row.id,
          name: row.label,
          entityId: stringValue(data.entityId),
          entityName: stringValue(data.entityName),
          machineIds: Array.isArray(data.machineIds)
            ? data.machineIds.filter((id): id is string => typeof id === "string")
            : [],
        });
        break;
      case "attendance":
        attendanceLogs.push({
          id: row.id,
          receivedAt: stringValue(data.receivedAt),
          payload: stringValue(data.payload),
        });
        break;
    }
  }
  attendanceLogs.sort((left, right) =>
    right.receivedAt.localeCompare(left.receivedAt),
  );
  return {
    organizationName: organization.organization_name,
    configuration,
    machines,
    templates,
    attendanceLogs: attendanceLogs.slice(0, 100),
    entities,
  };
}

export async function saveEsslIntegrationConfiguration(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  attendanceApiUrl?: string;
  isActive: boolean;
}) {
  const organization = await authorize(
    input.workspaceUserId,
    input.publicOrganizationId,
  );
  const attendanceApiUrl = String(input.attendanceApiUrl ?? "").trim();
  if (attendanceApiUrl && attendanceApiUrl.length > 2048) {
    throw new Error("Attendance API URL must be 2048 characters or fewer.");
  }
  await prisma.$transaction(async (transaction) => {
    const configurationModule = await ensureModule(
      transaction,
      organization.id,
      MODULES.configuration,
    );
    await ensureModule(transaction, organization.id, MODULES.machines);
    await ensureModule(transaction, organization.id, MODULES.templates);
    await ensureModule(transaction, organization.id, MODULES.attendance);
    const configurationId = recordId("essl-config", organization.id, "configuration");
    const current = await transaction.masterModuleValue.findFirst({
      where: {
        id: configurationId,
        module_id: configurationModule.id,
        module: { organization_id: organization.id },
      },
      select: { metadata: true },
    });
    const currentData = metadataObject(current?.metadata ?? null);
    const receiverTokenEncrypted =
      stringValue(currentData.receiverTokenEncrypted) ||
      encryptSecret(randomBytes(32).toString("base64url"));
    await transaction.masterModuleValue.upsert({
      where: { id: configurationId },
      create: {
        id: configurationId,
        module_id: configurationModule.id,
        label: "ESSL Push Receiver Configuration",
        is_active: input.isActive,
        metadata: {
          kind: "configuration",
          attendanceApiUrl,
          receiverTokenEncrypted,
          isActive: input.isActive,
        },
      },
      update: {
        is_active: input.isActive,
        metadata: {
          kind: "configuration",
          attendanceApiUrl,
          receiverTokenEncrypted,
          isActive: input.isActive,
        },
      },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: input.workspaceUserId,
        module: "INTEGRATIONS",
        action: "UPDATE",
        entity_type: "ESSL_CONFIGURATION",
        entity_id: configurationModule.id,
        details: { attendanceApiUrl, isActive: input.isActive },
      },
    });
  });
}

export async function saveEsslMachine(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  machineId?: string;
  serialNumber: string;
  entityId: string;
  location: string;
}) {
  const organization = await authorize(
    input.workspaceUserId,
    input.publicOrganizationId,
  );
  const serialNumber = input.serialNumber.trim();
  const location = input.location.trim();
  if (!serialNumber || serialNumber.length > 100) {
    throw new Error("Machine serial number is required and must be 100 characters or fewer.");
  }
  if (location.length > 255) {
    throw new Error("Machine location must be 255 characters or fewer.");
  }
  const entity = await prisma.masterEntity.findFirst({
    where: { organization_id: organization.id, id: input.entityId },
    select: { id: true, entity_name: true },
  });
  if (!entity) throw new Error("Select an entity belonging to this organization.");
  await prisma.$transaction(async (transaction) => {
    const machinesModule = await ensureModule(
      transaction,
      organization.id,
      MODULES.machines,
    );
    const existing = input.machineId
      ? await transaction.masterModuleValue.findFirst({
          where: {
            id: input.machineId,
            module_id: machinesModule.id,
            module: { organization_id: organization.id },
          },
          select: { id: true },
        })
      : null;
    if (input.machineId && !existing) {
      throw new Error("The selected biometric machine was not found.");
    }
    const machineId = existing?.id ?? recordId("essl-machine", organization.id, serialNumber);
    const duplicate = await transaction.masterModuleValue.findFirst({
      where: {
        module_id: machinesModule.id,
        module: { organization_id: organization.id },
        code: serialNumber,
        id: { not: machineId },
      },
      select: { id: true },
    });
    if (duplicate) throw new Error("A machine with this serial number already exists.");
    await transaction.masterModuleValue.upsert({
      where: { id: machineId },
      create: {
        id: machineId,
        module_id: machinesModule.id,
        label: serialNumber,
        code: serialNumber,
        description: location || null,
        metadata: {
          kind: "machine",
          serialNumber,
          entityId: entity.id,
          entityName: entity.entity_name,
          location,
        },
      },
      update: {
        label: serialNumber,
        code: serialNumber,
        description: location || null,
        is_active: true,
        metadata: {
          kind: "machine",
          serialNumber,
          entityId: entity.id,
          entityName: entity.entity_name,
          location,
        },
      },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: input.workspaceUserId,
        module: "INTEGRATIONS",
        action: existing ? "UPDATE" : "CREATE",
        entity_type: "ESSL_BIOMETRIC_MACHINE",
        entity_id: machineId,
        details: { serialNumber, entityId: entity.id },
      },
    });
  });
}

export async function saveEsslTemplate(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  templateId?: string;
  name: string;
  entityId: string;
  machineIds: string[];
}) {
  const organization = await authorize(
    input.workspaceUserId,
    input.publicOrganizationId,
  );
  const name = input.name.trim();
  if (!name || name.length > 255) {
    throw new Error("Template name is required and must be 255 characters or fewer.");
  }
  const entity = await prisma.masterEntity.findFirst({
    where: { organization_id: organization.id, id: input.entityId },
    select: { id: true, entity_name: true },
  });
  if (!entity) throw new Error("Select an entity belonging to this organization.");
  const machineIds = [...new Set(input.machineIds)];
  if (machineIds.length === 0) {
    throw new Error("Select at least one biometric machine for this template.");
  }
  await prisma.$transaction(async (transaction) => {
    const templatesModule = await ensureModule(
      transaction,
      organization.id,
      MODULES.templates,
    );
    const machinesModule = await ensureModule(
      transaction,
      organization.id,
      MODULES.machines,
    );
    const machines = await transaction.masterModuleValue.findMany({
      where: {
        id: { in: machineIds },
        module_id: machinesModule.id,
        module: { organization_id: organization.id },
        is_active: true,
      },
      select: { id: true },
    });
    if (machines.length !== machineIds.length) {
      throw new Error("Templates can only include active machines from this organization.");
    }
    const existing = input.templateId
      ? await transaction.masterModuleValue.findFirst({
          where: {
            id: input.templateId,
            module_id: templatesModule.id,
            module: { organization_id: organization.id },
          },
          select: { id: true },
        })
      : null;
    if (input.templateId && !existing) {
      throw new Error("The selected biometric template was not found.");
    }
    const id = existing?.id ?? `essl-template-${randomUUID()}`;
    await transaction.masterModuleValue.upsert({
      where: { id },
      create: {
        id,
        module_id: templatesModule.id,
        label: name,
        description: entity.entity_name,
        metadata: {
          kind: "template",
          entityId: entity.id,
          entityName: entity.entity_name,
          machineIds,
        },
      },
      update: {
        label: name,
        description: entity.entity_name,
        metadata: {
          kind: "template",
          entityId: entity.id,
          entityName: entity.entity_name,
          machineIds,
        },
      },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: input.workspaceUserId,
        module: "INTEGRATIONS",
        action: existing ? "UPDATE" : "CREATE",
        entity_type: "ESSL_BIOMETRIC_TEMPLATE",
        entity_id: id,
        details: { entityId: entity.id, machineCount: machineIds.length },
      },
    });
  });
}

export async function deactivateEsslMachine(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  machineId: string;
}) {
  const organization = await authorize(
    input.workspaceUserId,
    input.publicOrganizationId,
  );
  await prisma.$transaction(async (transaction) => {
    const machinesModule = await ensureModule(
      transaction,
      organization.id,
      MODULES.machines,
    );
    const result = await transaction.masterModuleValue.updateMany({
      where: {
        id: input.machineId,
        module_id: machinesModule.id,
        module: { organization_id: organization.id },
      },
      data: { is_active: false },
    });
    if (!result.count) throw new Error("The selected biometric machine was not found.");
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: input.workspaceUserId,
        module: "INTEGRATIONS",
        action: "DEACTIVATE",
        entity_type: "ESSL_BIOMETRIC_MACHINE",
        entity_id: input.machineId,
      },
    });
  });
}

export async function receiveEsslPush(token: string, payload: string) {
  validateEsslPushPayload(payload);
  const configurations = await prisma.masterModuleValue.findMany({
    where: {
      module: {
        module_key: MODULES.configuration[0],
      },
      is_active: true,
    },
    select: {
      id: true,
      metadata: true,
      module: { select: { organization_id: true } },
    },
  });

  const configuration = configurations.find((row) => {
    const data = metadataObject(row.metadata);
    return data.isActive === true &&
      hasMatchingEsslPushToken(token, stringValue(data.receiverTokenEncrypted));
  });
  if (!configuration) {
    throw new Error("Unauthorized ESSL attendance receiver.");
  }

  const organizationId = configuration.module.organization_id;
  const payloadDigest = createHash("sha256").update(payload).digest("hex");
  await prisma.$transaction(async (transaction) => {
    const module = await ensureModule(
      transaction,
      organizationId,
      MODULES.attendance,
    );
    const id = recordId("essl-push", organizationId, payloadDigest);
    const receivedAt = new Date().toISOString();
    await transaction.masterModuleValue.upsert({
      where: { id },
      create: {
        id,
        module_id: module.id,
        label: `ESSL push ${receivedAt}`,
        code: payloadDigest.slice(0, 100),
        metadata: {
          kind: "attendance",
          receivedAt,
          payload,
        },
      },
      update: {},
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        module: "INTEGRATIONS",
        action: "RECEIVE",
        entity_type: "ESSL_ATTENDANCE_PUSH",
        entity_id: id,
        details: { payloadBytes: Buffer.byteLength(payload, "utf8") },
      },
    });
  });
}
