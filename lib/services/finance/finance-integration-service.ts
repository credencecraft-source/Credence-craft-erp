import { isIP } from "node:net";

import { FinanceExternalProvider, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import { normalizeUppercase } from "@/lib/utilities/text-case";

const ZOHO_REGIONS = ["AU", "CA", "EU", "IN", "JP", "SA", "US"] as const;
export type ZohoRegion = (typeof ZOHO_REGIONS)[number];

export type FinanceIntegrationConfigInput = {
  activeProvider: FinanceExternalProvider;
  autoSync: boolean;
  tallyServerUrl?: string | null;
  tallyCompanyName?: string | null;
  zohoApiRegion?: string;
  zohoOrganizationId?: string | null;
  zohoClientId?: string | null;
  zohoClientSecret?: string | null;
  zohoRefreshToken?: string | null;
  clearZohoCredentials?: boolean;
  ledgerMappings?: unknown;
};

type StoredFinanceIntegrationConfig = NonNullable<Awaited<ReturnType<typeof prisma.financeIntegrationConfig.findUnique>>>;

const zohoDomains: Record<ZohoRegion, string> = {
  AU: "com.au",
  CA: "ca",
  EU: "eu",
  IN: "in",
  JP: "jp",
  SA: "sa",
  US: "com",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateJsonObject(value: unknown): Prisma.InputJsonValue {
  if (!isRecord(value)) throw new Error("Ledger mappings must be a JSON object.");
  const serialized = JSON.stringify(value);
  if (serialized.length > 50_000) throw new Error("Ledger mappings must be 50 KB or smaller.");
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

function validateTallyServerUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Tally server URL must be a valid HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Tally server URL must be HTTP(S), without credentials, query, or fragment.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Tally server URL must not include a path.");
  }

  const hostname = url.hostname.toLowerCase();
  const addressFamily = isIP(hostname);
  const privateIpv4 = addressFamily === 4 && (
    hostname.startsWith("10.")
    || hostname.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || hostname.startsWith("127.")
  );
  const privateIpv6 = addressFamily === 6 && (
    hostname === "::1"
    || /^f[cd]/i.test(hostname)
  );
  if (hostname !== "localhost" && !privateIpv4 && !privateIpv6) {
    throw new Error("Tally server URL must target localhost or a private network address.");
  }
  if (hostname.startsWith("169.254.") || /^fe[89ab]/i.test(hostname)) {
    throw new Error("Tally server URL cannot target a link-local address.");
  }
  return url.toString().replace(/\/$/, "");
}

function normalizeOptionalText(value: string | null | undefined, field: string, maxLength: number) {
  if (value == null || value.trim() === "") return null;
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} must contain ${maxLength} characters or fewer.`);
  return normalizeUppercase(text);
}

function zohoDomain(region: string): string {
  if (!ZOHO_REGIONS.includes(region as ZohoRegion)) {
    throw new Error("Select a supported Zoho Books data-center region.");
  }
  return zohoDomains[region as ZohoRegion];
}

function maskConfig(config: StoredFinanceIntegrationConfig | null) {
  const mappings = config?.ledger_mappings;
  return {
    activeProvider: config?.active_provider ?? FinanceExternalProvider.NONE,
    autoSync: config?.auto_sync ?? false,
    tallyServerUrl: config?.tally_server_url ?? "",
    tallyCompanyName: config?.tally_company_name ?? "",
    zohoApiRegion: config?.zoho_api_region ?? "IN",
    zohoOrganizationId: config?.zoho_organization_id ?? "",
    hasZohoClientId: Boolean(config?.zoho_client_id_encrypted),
    hasZohoClientSecret: Boolean(config?.zoho_client_secret_encrypted),
    hasZohoRefreshToken: Boolean(config?.zoho_refresh_token_encrypted),
    ledgerMappings: mappings ?? {},
    updatedAt: config?.updated_at.toISOString() ?? null,
  };
}

export async function getFinanceIntegrationConfig(organizationId: string) {
  const config = await prisma.financeIntegrationConfig.findUnique({ where: { organization_id: organizationId } });
  return maskConfig(config);
}

export async function saveFinanceIntegrationConfig(
  organizationId: string,
  actorUserId: string,
  input: FinanceIntegrationConfigInput,
) {
  if (!Object.values(FinanceExternalProvider).includes(input.activeProvider)) {
    throw new Error("Select a supported finance provider.");
  }
  if (typeof input.autoSync !== "boolean") throw new Error("Auto-sync must be true or false.");
  const current = await prisma.financeIntegrationConfig.findUnique({ where: { organization_id: organizationId } });
  const tallyServerUrl = input.tallyServerUrl === undefined
    ? current?.tally_server_url ?? null
    : input.tallyServerUrl === null || input.tallyServerUrl.trim() === ""
      ? null
      : validateTallyServerUrl(input.tallyServerUrl.trim());
  const tallyCompanyName = input.tallyCompanyName === undefined
    ? current?.tally_company_name ?? null
    : normalizeOptionalText(input.tallyCompanyName, "Tally company name", 255);
  const zohoApiRegion = input.zohoApiRegion === undefined
    ? current?.zoho_api_region ?? "IN"
    : input.zohoApiRegion.trim().toUpperCase();
  zohoDomain(zohoApiRegion);
  const zohoOrganizationId = input.zohoOrganizationId === undefined
    ? current?.zoho_organization_id ?? null
    : normalizeOptionalText(input.zohoOrganizationId, "Zoho organization ID", 100);
  if (zohoOrganizationId && !/^\d+$/.test(zohoOrganizationId)) {
    throw new Error("Zoho organization ID must contain digits only.");
  }

  const encryptedClientId = input.clearZohoCredentials
    ? null
    : input.zohoClientId?.trim()
      ? encryptSecret(input.zohoClientId.trim())
      : current?.zoho_client_id_encrypted ?? null;
  const encryptedClientSecret = input.clearZohoCredentials
    ? null
    : input.zohoClientSecret?.trim()
      ? encryptSecret(input.zohoClientSecret.trim())
      : current?.zoho_client_secret_encrypted ?? null;
  const encryptedRefreshToken = input.clearZohoCredentials
    ? null
    : input.zohoRefreshToken?.trim()
      ? encryptSecret(input.zohoRefreshToken.trim())
      : current?.zoho_refresh_token_encrypted ?? null;
  const ledgerMappings = input.ledgerMappings === undefined
    ? current?.ledger_mappings ?? Prisma.DbNull
    : validateJsonObject(input.ledgerMappings);

  if (input.activeProvider === FinanceExternalProvider.TALLY && (!tallyServerUrl || !tallyCompanyName)) {
    throw new Error("A private Tally server URL and company name are required before enabling Tally.");
  }
  if (
    input.activeProvider === FinanceExternalProvider.ZOHO_BOOKS
    && (!zohoOrganizationId || !encryptedClientId || !encryptedClientSecret || !encryptedRefreshToken)
  ) {
    throw new Error("Zoho organization ID and OAuth credentials are required before enabling Zoho Books.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const config = await tx.financeIntegrationConfig.upsert({
      where: { organization_id: organizationId },
      create: {
        organization_id: organizationId,
        active_provider: input.activeProvider,
        auto_sync: input.autoSync,
        tally_server_url: tallyServerUrl,
        tally_company_name: tallyCompanyName,
        zoho_api_region: zohoApiRegion,
        zoho_organization_id: zohoOrganizationId,
        zoho_client_id_encrypted: encryptedClientId,
        zoho_client_secret_encrypted: encryptedClientSecret,
        zoho_refresh_token_encrypted: encryptedRefreshToken,
        ledger_mappings: ledgerMappings,
        updated_by_user_id: actorUserId,
      },
      update: {
        active_provider: input.activeProvider,
        auto_sync: input.autoSync,
        tally_server_url: tallyServerUrl,
        tally_company_name: tallyCompanyName,
        zoho_api_region: zohoApiRegion,
        zoho_organization_id: zohoOrganizationId,
        zoho_client_id_encrypted: encryptedClientId,
        zoho_client_secret_encrypted: encryptedClientSecret,
        zoho_refresh_token_encrypted: encryptedRefreshToken,
        ledger_mappings: ledgerMappings,
        updated_by_user_id: actorUserId,
      },
    });
    await tx.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: actorUserId,
        module: "FINANCE_MANAGEMENT",
        action: "FINANCE_INTEGRATION_CONFIG_UPDATED",
        entity_type: "finance_integration_config",
        entity_id: organizationId,
        details: {
          activeProvider: input.activeProvider,
          autoSync: input.autoSync,
          zohoCredentialsChanged: Boolean(input.zohoClientId || input.zohoClientSecret || input.zohoRefreshToken || input.clearZohoCredentials),
        },
      },
    });
    return config;
  });
  return maskConfig(saved);
}

export async function getFinanceIntegrationSecrets(organizationId: string) {
  const config = await prisma.financeIntegrationConfig.findUnique({ where: { organization_id: organizationId } });
  if (!config) return null;
  return {
    activeProvider: config.active_provider,
    autoSync: config.auto_sync,
    tallyServerUrl: config.tally_server_url,
    tallyCompanyName: config.tally_company_name,
    zohoApiRegion: config.zoho_api_region,
    zohoOrganizationId: config.zoho_organization_id,
    zohoClientId: config.zoho_client_id_encrypted ? decryptSecret(config.zoho_client_id_encrypted) : null,
    zohoClientSecret: config.zoho_client_secret_encrypted ? decryptSecret(config.zoho_client_secret_encrypted) : null,
    zohoRefreshToken: config.zoho_refresh_token_encrypted ? decryptSecret(config.zoho_refresh_token_encrypted) : null,
    ledgerMappings: config.ledger_mappings,
  };
}

async function requestWithTimeout(url: string, init: RequestInit) {
  return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8_000) });
}

export async function testFinanceIntegrationConnection(organizationId: string) {
  const config = await getFinanceIntegrationSecrets(organizationId);
  if (!config || config.activeProvider === FinanceExternalProvider.NONE) {
    throw new Error("Choose and save a finance provider before testing the connection.");
  }

  if (config.activeProvider === FinanceExternalProvider.TALLY) {
    if (!config.tallyServerUrl || !config.tallyCompanyName) throw new Error("Tally connection settings are incomplete.");
    const response = await requestWithTimeout(config.tallyServerUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Company</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${config.tallyCompanyName.replace(/[<>&"']/g, "")}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`,
    });
    if (!response.ok) throw new Error(`Tally returned HTTP ${response.status}.`);
    const reader = response.body?.getReader();
    const firstChunk = await reader?.read();
    await reader?.cancel();
    const bodyStart = firstChunk?.value
      ? new TextDecoder().decode(firstChunk.value.slice(0, 512))
      : "";
    if (!bodyStart.includes("<ENVELOPE")) throw new Error("Tally returned an unexpected response.");
    return { ok: true, message: "Tally returned a valid XML response." };
  }

  const domain = zohoDomain(config.zohoApiRegion);
  if (!config.zohoClientId || !config.zohoClientSecret || !config.zohoRefreshToken || !config.zohoOrganizationId) {
    throw new Error("Zoho Books connection settings are incomplete.");
  }
  const tokenResponse = await requestWithTimeout(`https://accounts.zoho.${domain}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.zohoClientId,
      client_secret: config.zohoClientSecret,
      refresh_token: config.zohoRefreshToken,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`Zoho OAuth returned HTTP ${tokenResponse.status}.`);
  const token = await tokenResponse.json() as { access_token?: unknown };
  if (typeof token.access_token !== "string") throw new Error("Zoho OAuth did not return an access token.");

  const organizationResponse = await requestWithTimeout(
    `https://www.zohoapis.${domain}/books/v3/organizations?organization_id=${encodeURIComponent(config.zohoOrganizationId)}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` } },
  );
  if (!organizationResponse.ok) throw new Error(`Zoho Books returned HTTP ${organizationResponse.status}.`);
  const payload = await organizationResponse.json() as { code?: unknown };
  if (payload.code !== 0) throw new Error("Zoho Books rejected the organization lookup.");
  return { ok: true, message: "Zoho Books OAuth and organization access verified." };
}
