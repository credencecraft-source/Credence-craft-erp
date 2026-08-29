import { prisma } from "./prisma";

export async function createDefaultPlans(tenantId: string) {
  console.log(`[bootstrap] createDefaultPlans for tenant ${tenantId}`);
}

export async function createAllGstStates() {
  console.log(`[bootstrap] createAllGstStates`);
}

export async function transactionCurrentMonthOnly(tenantId: string) {
  console.log(`[bootstrap] transactionCurrentMonthOnly for tenant ${tenantId}`);
}

export async function createDefaultSettingRecord(tenantId: string) {
  console.log(`[bootstrap] createDefaultSettingRecord for tenant ${tenantId}`);
}

export async function createDefaultGstTypes(tenantId: string) {
  console.log(`[bootstrap] createDefaultGstTypes for tenant ${tenantId}`);
}

export async function createProcessOperationTemplates(tenantId: string) {
  console.log(`[bootstrap] createProcessOperationTemplates for tenant ${tenantId}`);
}

export async function runTenantBootstrap(tenantId: string) {
  await createDefaultPlans(tenantId);
  await createAllGstStates();
  await transactionCurrentMonthOnly(tenantId);
  await createDefaultSettingRecord(tenantId);
  await createDefaultGstTypes(tenantId);
  await createProcessOperationTemplates(tenantId);
}