import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

export async function requireFinanceOrganizationAccess(userId: string, publicOrganizationId: string) {
  const organization = await requireOrganizationContext(userId, publicOrganizationId);
  await requireOrganizationPermission(userId, organization.id, "ACCESS_MODULE_FINANCE_MANAGEMENT");
  return organization;
}

export function parseFinanceCursor<T extends { id?: unknown; date?: unknown }>(
  value: string | null,
  dateField: "documentDate" | "createdAt",
): T | null {
  if (!value) return null;
  if (value.length > 512) throw new Error("Invalid pagination cursor.");
  let parsed: { id?: unknown; [key: string]: unknown };
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as typeof parsed;
  } catch {
    throw new Error("Invalid pagination cursor.");
  }
  const dateValue = parsed[dateField];
  if (
    typeof parsed.id !== "string"
    || parsed.id.length === 0
    || parsed.id.length > 100
    || typeof dateValue !== "string"
  ) {
    throw new Error("Invalid pagination cursor.");
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== dateValue) {
    throw new Error("Invalid pagination cursor.");
  }
  return { id: parsed.id, [dateField]: date } as T;
}

export function encodeFinanceCursor(input: { id: string; documentDate?: Date; createdAt?: Date }) {
  return Buffer.from(JSON.stringify({
    id: input.id,
    ...(input.documentDate ? { documentDate: input.documentDate.toISOString() } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt.toISOString() } : {}),
  })).toString("base64url");
}
