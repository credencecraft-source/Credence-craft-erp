import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { domainToASCII } from "node:url";

import { prisma } from "@/lib/database/prisma-client";
import type { OrganizationContext } from "@/lib/services/organizations/organization-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

const MAX_PRESENTATION_SLIDES = 5;
const MAX_SLIDE_IMAGE_BYTES = 600 * 1024;
const MAX_BLUR_PIXELS = 20;
const MAX_STORE_DOMAINS = 10;
const DOMAIN_VERIFICATION_PREFIX = "credencecraft-store-verification=";
const DOMAIN_VERIFICATION_LABEL = "_cc-store-verification";
const VERCEL_API_TIMEOUT_MS = 8_000;

export type OnlineStoreDomainProvider = "MANUAL" | "VERCEL";
export type OnlineStoreDomainStatus = "PENDING_VERIFICATION" | "VERIFIED";
export type OnlineStoreDnsRecord = {
  type: "TXT" | "CNAME" | "A";
  name: string;
  value: string;
  purpose: string;
};
export type OnlineStoreDomain = {
  id: string;
  hostname: string;
  provider: OnlineStoreDomainProvider;
  status: OnlineStoreDomainStatus;
  isPrimary: boolean;
  verifiedAt: string | null;
  ownershipRecord: OnlineStoreDnsRecord;
  providerDnsRecords: OnlineStoreDnsRecord[];
};

export type OnlineStoreSlide = {
  id: string;
  imageDataUrl: string;
  headline: string;
  caption: string;
};

export type OnlineStorePresentation = {
  slides: OnlineStoreSlide[];
  fontFamily: "sans" | "serif" | "rounded";
  blur: number;
  themeId: "vibrant-editorial" | "fashion-atelier";
};

export const DEFAULT_ONLINE_STORE_PRESENTATION: OnlineStorePresentation = {
  slides: [],
  fontFamily: "sans",
  blur: 0,
  themeId: "vibrant-editorial",
};

function isRecord(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function imageByteLength(dataUrl: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("Use a JPEG, PNG, or WebP slide image.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_SLIDE_IMAGE_BYTES) {
    throw new Error("Each slide image must be 600 KB or smaller.");
  }
  const validSignature = match[1] === "jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === "png"
      ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.length >= 12
        && bytes.toString("ascii", 0, 4) === "RIFF"
        && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!validSignature) throw new Error("The slide image does not match its file type.");
  return bytes.length;
}

export function parseOnlineStorePresentation(value: unknown): OnlineStorePresentation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Enter valid slideshow settings.");
  }
  const settings = value as Record<string, unknown>;
  if (!Array.isArray(settings.slides) || settings.slides.length > MAX_PRESENTATION_SLIDES) {
    throw new Error("A slideshow can contain up to five slides.");
  }
  if (!["sans", "serif", "rounded"].includes(String(settings.fontFamily))) {
    throw new Error("Select an available slideshow font.");
  }
  if (!Number.isInteger(settings.blur) || Number(settings.blur) < 0 || Number(settings.blur) > MAX_BLUR_PIXELS) {
    throw new Error("Slideshow image blur must be between 0 and 20.");
  }
  const themeId = settings.themeId ?? "vibrant-editorial";
  if (!["vibrant-editorial", "fashion-atelier"].includes(String(themeId))) {
    throw new Error("Select an available storefront theme.");
  }

  const ids = new Set<string>();
  const slides = settings.slides.map((value): OnlineStoreSlide => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Enter valid slideshow slide details.");
    }
    const slide = value as Record<string, unknown>;
    if (typeof slide.id !== "string" || !/^[A-Za-z0-9_-]{1,60}$/.test(slide.id) || ids.has(slide.id)) {
      throw new Error("Each slideshow slide must have a unique valid ID.");
    }
    ids.add(slide.id);
    if (typeof slide.imageDataUrl !== "string") {
      throw new Error("Upload an image for every slideshow slide.");
    }
    imageByteLength(slide.imageDataUrl);
    if (typeof slide.headline !== "string" || slide.headline.trim().length > 120) {
      throw new Error("Slide headlines must be 120 characters or fewer.");
    }
    if (typeof slide.caption !== "string" || slide.caption.trim().length > 240) {
      throw new Error("Slide captions must be 240 characters or fewer.");
    }
    return {
      id: slide.id,
      imageDataUrl: slide.imageDataUrl,
      headline: normalizeUppercase(slide.headline.trim()),
      caption: normalizeUppercase(slide.caption.trim()),
    };
  });

  return {
    slides,
    fontFamily: settings.fontFamily as OnlineStorePresentation["fontFamily"],
    blur: Number(settings.blur),
    themeId: themeId as OnlineStorePresentation["themeId"],
  };
}

function presentationFromModuleSettings(settings: Prisma.JsonValue | null): OnlineStorePresentation {
  if (!isRecord(settings)) return DEFAULT_ONLINE_STORE_PRESENTATION;
  const value = settings.onlineStorePresentation;
  if (value === undefined) return DEFAULT_ONLINE_STORE_PRESENTATION;
  return parseOnlineStorePresentation(value);
}

export async function publishOrganizationOnlineStore(organization: OrganizationContext) {
  const existing = await prisma.organization.findFirst({
    where: { id: organization.id, is_active: true },
    select: { online_store_public_key: true, online_store_enabled: true },
  });
  if (!existing) throw new Error("The organization storefront is unavailable.");

  const publicKey = existing.online_store_public_key ?? randomBytes(32).toString("base64url");
  if (!existing.online_store_enabled || !existing.online_store_public_key) {
    await prisma.organization.updateMany({
      where: { id: organization.id, is_active: true },
      data: {
        online_store_public_key: publicKey,
        online_store_enabled: true,
      },
    });
  }

  const published = await prisma.organization.findFirst({
    where: { id: organization.id, is_active: true, online_store_enabled: true },
    select: { online_store_public_key: true },
  });
  if (!published?.online_store_public_key) {
    throw new Error("The organization storefront could not be published.");
  }
  return published.online_store_public_key;
}

export async function findPublishedOnlineStore(publicKey: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(publicKey)) return null;

  return prisma.organization.findFirst({
    where: {
      online_store_public_key: publicKey,
      online_store_enabled: true,
      is_active: true,
    },
    select: {
      id: true,
      organization_name: true,
    },
  });
}

export async function setOrganizationOnlineStoreEnabled(
  organization: OrganizationContext,
  enabled: boolean,
) {
  const result = await prisma.organization.updateMany({
    where: { id: organization.id, is_active: true },
    data: enabled
      ? {
          online_store_public_key: randomBytes(32).toString("base64url"),
          online_store_enabled: true,
        }
      : { online_store_enabled: false },
  });
  if (result.count !== 1) throw new Error("The organization storefront could not be updated.");
}

export async function getOrganizationOnlineStoreSettings(organization: OrganizationContext) {
  const settings = await prisma.organization.findFirst({
    where: { id: organization.id, is_active: true },
    select: {
      online_store_public_key: true,
      online_store_enabled: true,
    },
  });
  if (!settings) throw new Error("The organization storefront is unavailable.");
  return settings;
}

async function findOnlineStoreModuleSettings(organizationId: string) {
  return prisma.eRPModule.findFirst({
    where: {
      module_key: "pos",
      software: { is: { organization_id: organizationId } },
    },
    select: { id: true, settings: true },
  });
}

export async function getOrganizationOnlineStorePresentation(organizationId: string) {
  const posModule = await findOnlineStoreModuleSettings(organizationId);
  if (!posModule) throw new Error("The organization POS module is unavailable.");
  return presentationFromModuleSettings(posModule.settings);
}

export async function saveOrganizationOnlineStorePresentation(
  organization: OrganizationContext,
  value: unknown,
) {
  const presentation = parseOnlineStorePresentation(value);
  await prisma.$transaction(async (transaction) => {
    const posModule = await transaction.eRPModule.findFirst({
      where: {
        module_key: "pos",
        software: { is: { organization_id: organization.id } },
      },
      select: { id: true, settings: true },
    });
    if (!posModule) throw new Error("The organization POS module is unavailable.");

    const settings = isRecord(posModule.settings) ? posModule.settings : {};
    const presentationJson: Prisma.InputJsonObject = {
      slides: presentation.slides.map((slide): Prisma.InputJsonObject => ({
        id: slide.id,
        imageDataUrl: slide.imageDataUrl,
        headline: slide.headline,
        caption: slide.caption,
      })),
      fontFamily: presentation.fontFamily,
      blur: presentation.blur,
      themeId: presentation.themeId,
    };
    await transaction.eRPModule.update({
      where: { id: posModule.id },
      data: {
        settings: {
          ...settings,
          onlineStorePresentation: presentationJson,
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return presentation;
}

export class OnlineStoreDomainError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "OnlineStoreDomainError";
  }
}

export function normalizeOnlineStoreHostname(value: unknown) {
  if (typeof value !== "string" || value.length > 300) {
    throw new OnlineStoreDomainError("Enter a valid custom domain.");
  }
  const trimmed = value.trim().replace(/\.$/, "");
  if (
    !trimmed
    || /[/:?#@\\\s]/.test(trimmed)
    || trimmed.startsWith("*.")
  ) {
    throw new OnlineStoreDomainError("Enter a hostname only, such as shop.example.com.");
  }

  const hostname = domainToASCII(trimmed).toLowerCase();
  const labels = hostname.split(".");
  if (
    hostname.length > 220
    || labels.length < 2
    || labels.some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
    || isIP(hostname)
    || ["localhost", "local", "test", "invalid"].includes(labels.at(-1) ?? "")
  ) {
    throw new OnlineStoreDomainError("Enter a valid public domain name.");
  }
  return hostname;
}

export function isVercelDomainIntegrationConfigured() {
  return Boolean(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID);
}

function providerQuery() {
  const query = new URLSearchParams();
  if (process.env.VERCEL_TEAM_ID) query.set("teamId", process.env.VERCEL_TEAM_ID);
  return query.toString();
}

async function vercelRequest(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, unknown>,
) {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    throw new OnlineStoreDomainError("The Vercel domain integration is not configured by the platform administrator.", 503);
  }
  const query = providerQuery();
  const response = await fetch(`https://api.vercel.com${path}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(VERCEL_API_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new OnlineStoreDomainError(
      response.status === 401 || response.status === 403
        ? "The platform Vercel integration needs administrator attention."
        : "Vercel could not complete this domain operation. Check the domain and retry.",
      response.status === 429 ? 503 : 502,
    );
  }
  return response.status === 204 ? {} : await response.json() as Record<string, unknown>;
}

function parseProviderDnsRecords(value: unknown, hostname: string): OnlineStoreDnsRecord[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const records: OnlineStoreDnsRecord[] = [];
  const data = value as Record<string, unknown>;
  if (Array.isArray(data.verification)) {
    for (const item of data.verification) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const challenge = item as Record<string, unknown>;
      if (
        challenge.type === "TXT"
        && typeof challenge.domain === "string"
        && typeof challenge.value === "string"
        && challenge.domain.length <= 253
        && challenge.value.length <= 512
      ) {
        records.push({
          type: "TXT",
          name: challenge.domain,
          value: challenge.value,
          purpose: "Vercel domain ownership",
        });
      }
    }
  }
  const config = data.config && typeof data.config === "object" && !Array.isArray(data.config)
    ? data.config as Record<string, unknown>
    : data;
  if (Array.isArray(config.recommendedCNAME)) {
    const target = config.recommendedCNAME.find((entry) =>
      entry && typeof entry === "object" && (entry as Record<string, unknown>).rank === 1,
    ) as Record<string, unknown> | undefined;
    if (typeof target?.value === "string" && target.value.length <= 253) {
      records.push({ type: "CNAME", name: hostname, value: target.value, purpose: "Route subdomain traffic to Vercel" });
    }
  }
  if (Array.isArray(config.recommendedIPv4)) {
    const target = config.recommendedIPv4.find((entry) =>
      entry && typeof entry === "object" && (entry as Record<string, unknown>).rank === 1,
    ) as Record<string, unknown> | undefined;
    if (Array.isArray(target?.value)) {
      for (const address of target.value) {
        if (typeof address === "string" && isIP(address) === 4) {
          records.push({ type: "A", name: hostname, value: address, purpose: "Route apex-domain traffic to Vercel" });
        }
      }
    }
  }
  return records.slice(0, 10);
}

async function registerVercelDomain(hostname: string) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) throw new OnlineStoreDomainError("The Vercel domain integration is not configured by the platform administrator.", 503);
  try {
    const configQuery = new URLSearchParams({ projectIdOrName: projectId });
    if (process.env.VERCEL_TEAM_ID) configQuery.set("teamId", process.env.VERCEL_TEAM_ID);
    const configResponse = await fetch(
      `https://api.vercel.com/v6/domains/${encodeURIComponent(hostname)}/config?${configQuery}`,
      {
        headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
        cache: "no-store",
        signal: AbortSignal.timeout(VERCEL_API_TIMEOUT_MS),
      },
    );
    if (!configResponse.ok) {
      throw new OnlineStoreDomainError(
        "Vercel DNS targets could not be loaded. Check the Vercel project configuration before retrying.",
        502,
      );
    }
    const config = await configResponse.json() as Record<string, unknown>;
    const created = await vercelRequest(
      `/v10/projects/${encodeURIComponent(projectId)}/domains`,
      "POST",
      { name: hostname },
    );
    created.config = config;
    return parseProviderDnsRecords(created, hostname);
  } catch (error) {
    if (error instanceof OnlineStoreDomainError) throw error;
    throw new OnlineStoreDomainError(
      "Vercel could not register this domain or load its DNS targets. Check the Vercel project settings and retry.",
      502,
    );
  }
}

async function verifyVercelDomain(hostname: string) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) throw new OnlineStoreDomainError("The Vercel domain integration is not configured by the platform administrator.", 503);
  const result = await vercelRequest(
    `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}/verify`,
    "POST",
  );
  if (result.verified !== true) {
    throw new OnlineStoreDomainError("Vercel has not verified this domain yet. Check its DNS records and retry.", 409);
  }
}

async function removeVercelDomain(hostname: string) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) throw new OnlineStoreDomainError("The Vercel domain integration is not configured by the platform administrator.", 503);
  await vercelRequest(
    `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`,
    "DELETE",
  );
}

function domainToDto(
  domain: {
    id: string;
    hostname: string;
    provider: string;
    status: string;
    is_primary: boolean;
    verified_at: Date | null;
    verification_token: string;
    provider_dns_records: Prisma.JsonValue | null;
  },
): OnlineStoreDomain {
  const provider = domain.provider === "VERCEL" ? "VERCEL" : "MANUAL";
  const status = domain.status === "VERIFIED" ? "VERIFIED" : "PENDING_VERIFICATION";
  return {
    id: domain.id,
    hostname: domain.hostname,
    provider,
    status,
    isPrimary: domain.is_primary,
    verifiedAt: domain.verified_at?.toISOString() ?? null,
    ownershipRecord: {
      type: "TXT",
      name: `${DOMAIN_VERIFICATION_LABEL}.${domain.hostname}`,
      value: `${DOMAIN_VERIFICATION_PREFIX}${domain.verification_token}`,
      purpose: "Prove you control this domain",
    },
    providerDnsRecords: parseStoredProviderDnsRecords(domain.provider_dns_records),
  };
}

function parseStoredProviderDnsRecords(value: Prisma.JsonValue | null): OnlineStoreDnsRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): OnlineStoreDnsRecord[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Prisma.JsonObject;
    if (
      !["TXT", "CNAME", "A"].includes(String(record.type))
      || typeof record.name !== "string"
      || typeof record.value !== "string"
      || typeof record.purpose !== "string"
      || record.name.length > 253
      || record.value.length > 512
      || record.purpose.length > 100
    ) return [];
    return [{
      type: record.type as OnlineStoreDnsRecord["type"],
      name: record.name,
      value: record.value,
      purpose: record.purpose,
    }];
  });
}

const ONLINE_STORE_DOMAIN_SELECT = {
  id: true,
  hostname: true,
  provider: true,
  status: true,
  is_primary: true,
  verified_at: true,
  verification_token: true,
  provider_dns_records: true,
} satisfies Prisma.OrganizationOnlineStoreDomainSelect;

export async function listOrganizationOnlineStoreDomains(organizationId: string) {
  const domains = await prisma.organizationOnlineStoreDomain.findMany({
    where: { organization_id: organizationId },
    select: ONLINE_STORE_DOMAIN_SELECT,
    orderBy: [{ is_primary: "desc" }, { created_at: "desc" }],
    take: MAX_STORE_DOMAINS,
  });
  return domains.map(domainToDto);
}

export async function createOrganizationOnlineStoreDomain(input: {
  organization: OrganizationContext;
  actorId: string;
  hostname: unknown;
  provider: unknown;
}) {
  const hostname = normalizeOnlineStoreHostname(input.hostname);
  if (input.provider !== "MANUAL" && input.provider !== "VERCEL") {
    throw new OnlineStoreDomainError("Choose a supported domain integration.");
  }
  const provider = input.provider as OnlineStoreDomainProvider;
  if (provider === "VERCEL" && !isVercelDomainIntegrationConfigured()) {
    throw new OnlineStoreDomainError("Vercel integration is not configured. Choose manual DNS setup or contact your platform administrator.", 503);
  }
  const existing = await prisma.organizationOnlineStoreDomain.findFirst({
    where: { hostname },
    select: { id: true },
  });
  if (existing) throw new OnlineStoreDomainError("This domain is already connected to a store.", 409);
  const count = await prisma.organizationOnlineStoreDomain.count({
    where: { organization_id: input.organization.id },
  });
  if (count >= MAX_STORE_DOMAINS) {
    throw new OnlineStoreDomainError("A store can have up to ten custom domains.", 409);
  }

  let providerDnsRecords: OnlineStoreDnsRecord[] = [];
  if (provider === "VERCEL") providerDnsRecords = await registerVercelDomain(hostname);
  const token = randomBytes(32).toString("base64url");
  const providerDnsRecordsJson: Prisma.InputJsonArray = providerDnsRecords.map(
    (record): Prisma.InputJsonObject => ({
      type: record.type,
      name: record.name,
      value: record.value,
      purpose: record.purpose,
    }),
  );
  try {
    const domain = await prisma.$transaction(async (transaction) => {
      const currentCount = await transaction.organizationOnlineStoreDomain.count({
        where: { organization_id: input.organization.id },
      });
      if (currentCount >= MAX_STORE_DOMAINS) {
        throw new OnlineStoreDomainError("A store can have up to ten custom domains.", 409);
      }
      const created = await transaction.organizationOnlineStoreDomain.create({
        data: {
          organization_id: input.organization.id,
          hostname,
          provider,
          verification_token: token,
          provider_dns_records: providerDnsRecords.length ? providerDnsRecordsJson : Prisma.JsonNull,
        },
        select: ONLINE_STORE_DOMAIN_SELECT,
      });
      await createAuditEvent({
        organizationId: input.organization.id,
        userId: input.actorId,
        module: "POS",
        action: "ONLINE_STORE_DOMAIN_CREATED",
        entityType: "OrganizationOnlineStoreDomain",
        entityId: created.id,
        details: { hostname, provider },
      }, transaction);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return domainToDto(domain);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new OnlineStoreDomainError("This domain is already connected to a store.", 409);
    }
    throw error;
  }
}

export async function verifyOrganizationOnlineStoreDomain(input: {
  organization: OrganizationContext;
  actorId: string;
  domainId: string;
}) {
  const domain = await prisma.organizationOnlineStoreDomain.findFirst({
    where: { id: input.domainId, organization_id: input.organization.id },
    select: ONLINE_STORE_DOMAIN_SELECT,
  });
  if (!domain) throw new OnlineStoreDomainError("The custom domain was not found.", 404);
  if (domain.status === "VERIFIED") return domainToDto(domain);

  const resolver = new Resolver({ timeout: 4_000, tries: 1 });
  let txtRecords: string[][];
  try {
    txtRecords = await resolver.resolveTxt(`${DOMAIN_VERIFICATION_LABEL}.${domain.hostname}`);
  } catch {
    throw new OnlineStoreDomainError("The ownership TXT record was not found yet. DNS changes may take time to propagate.", 409);
  } finally {
    resolver.cancel();
  }
  const expectedValue = `${DOMAIN_VERIFICATION_PREFIX}${domain.verification_token}`;
  if (!txtRecords.some((record) => record.join("") === expectedValue)) {
    throw new OnlineStoreDomainError("The ownership TXT record does not match. Copy the exact value and retry.", 409);
  }
  if (domain.provider === "VERCEL") await verifyVercelDomain(domain.hostname);

  const verified = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.organizationOnlineStoreDomain.updateMany({
      where: {
        id: domain.id,
        organization_id: input.organization.id,
        status: "PENDING_VERIFICATION",
      },
      data: { status: "VERIFIED", verified_at: new Date() },
    });
    if (updated.count !== 1) {
      throw new OnlineStoreDomainError("The custom domain changed while verification was running. Refresh and retry.", 409);
    }
    await createAuditEvent({
      organizationId: input.organization.id,
      userId: input.actorId,
      module: "POS",
      action: "ONLINE_STORE_DOMAIN_VERIFIED",
      entityType: "OrganizationOnlineStoreDomain",
      entityId: domain.id,
      details: { hostname: domain.hostname, provider: domain.provider },
    }, transaction);
    return transaction.organizationOnlineStoreDomain.findFirstOrThrow({
      where: { id: domain.id, organization_id: input.organization.id },
      select: ONLINE_STORE_DOMAIN_SELECT,
    });
  });
  return domainToDto(verified);
}

export async function setOrganizationOnlineStorePrimaryDomain(input: {
  organization: OrganizationContext;
  actorId: string;
  domainId: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const domain = await transaction.organizationOnlineStoreDomain.findFirst({
      where: { id: input.domainId, organization_id: input.organization.id },
      select: ONLINE_STORE_DOMAIN_SELECT,
    });
    if (!domain) throw new OnlineStoreDomainError("The custom domain was not found.", 404);
    if (domain.status !== "VERIFIED") {
      throw new OnlineStoreDomainError("Verify the domain before making it primary.", 409);
    }
    await transaction.organizationOnlineStoreDomain.updateMany({
      where: { organization_id: input.organization.id, is_primary: true },
      data: { is_primary: false },
    });
    const updated = await transaction.organizationOnlineStoreDomain.update({
      where: { id: domain.id },
      data: { is_primary: true },
      select: ONLINE_STORE_DOMAIN_SELECT,
    });
    await createAuditEvent({
      organizationId: input.organization.id,
      userId: input.actorId,
      module: "POS",
      action: "ONLINE_STORE_PRIMARY_DOMAIN_CHANGED",
      entityType: "OrganizationOnlineStoreDomain",
      entityId: domain.id,
      details: { hostname: domain.hostname },
    }, transaction);
    return domainToDto(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteOrganizationOnlineStoreDomain(input: {
  organization: OrganizationContext;
  actorId: string;
  domainId: string;
}) {
  const domain = await prisma.organizationOnlineStoreDomain.findFirst({
    where: { id: input.domainId, organization_id: input.organization.id },
    select: { id: true, hostname: true, provider: true },
  });
  if (!domain) throw new OnlineStoreDomainError("The custom domain was not found.", 404);
  if (domain.provider === "VERCEL") await removeVercelDomain(domain.hostname);

  await prisma.$transaction(async (transaction) => {
    await transaction.organizationOnlineStoreDomain.deleteMany({
      where: { id: domain.id, organization_id: input.organization.id },
    });
    await createAuditEvent({
      organizationId: input.organization.id,
      userId: input.actorId,
      module: "POS",
      action: "ONLINE_STORE_DOMAIN_REMOVED",
      entityType: "OrganizationOnlineStoreDomain",
      entityId: domain.id,
      details: { hostname: domain.hostname, provider: domain.provider },
    }, transaction);
  });
}

export async function findPublishedOnlineStoreByHostname(value: string) {
  let hostname: string;
  try {
    hostname = normalizeOnlineStoreHostname(value);
  } catch {
    return null;
  }
  const domain = await prisma.organizationOnlineStoreDomain.findFirst({
    where: {
      hostname,
      status: "VERIFIED",
      organization: {
        is: { online_store_enabled: true, is_active: true },
      },
    },
    select: {
      hostname: true,
      organization: {
        select: {
          id: true,
          organization_name: true,
          online_store_public_key: true,
          onlineStoreDomains: {
            where: { status: "VERIFIED", is_primary: true },
            select: { hostname: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!domain?.organization.online_store_public_key) return null;
  return {
    hostname: domain.hostname,
    id: domain.organization.id,
    organization_name: domain.organization.organization_name,
    publicKey: domain.organization.online_store_public_key,
    primaryHostname: domain.organization.onlineStoreDomains[0]?.hostname ?? domain.hostname,
  };
}
