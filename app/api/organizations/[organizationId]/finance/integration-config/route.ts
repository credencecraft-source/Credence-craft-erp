import { FinanceExternalProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getFinanceIntegrationConfig,
  saveFinanceIntegrationConfig,
  testFinanceIntegrationConnection,
  type FinanceIntegrationConfigInput,
} from "@/lib/services/finance/finance-integration-service";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

const ALLOWED_FIELDS = new Set([
  "activeProvider",
  "autoSync",
  "tallyServerUrl",
  "tallyCompanyName",
  "zohoApiRegion",
  "zohoOrganizationId",
  "zohoClientId",
  "zohoClientSecret",
  "zohoRefreshToken",
  "clearZohoCredentials",
  "ledgerMappings",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfigInput(value: unknown): FinanceIntegrationConfigInput {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALLOWED_FIELDS.has(key))) {
    throw new Error("Integration settings contain unsupported fields.");
  }
  if (!Object.values(FinanceExternalProvider).includes(value.activeProvider as FinanceExternalProvider)) {
    throw new Error("Select a supported finance provider.");
  }
  if (typeof value.autoSync !== "boolean") throw new Error("Auto-sync must be true or false.");
  for (const key of ["tallyServerUrl", "tallyCompanyName", "zohoApiRegion", "zohoOrganizationId", "zohoClientId", "zohoClientSecret", "zohoRefreshToken"]) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== "string") {
      throw new Error(`${key} must be a string.`);
    }
  }
  if (value.clearZohoCredentials !== undefined && typeof value.clearZohoCredentials !== "boolean") {
    throw new Error("The credential-clear flag must be true or false.");
  }
  return {
    activeProvider: value.activeProvider as FinanceExternalProvider,
    autoSync: value.autoSync,
    tallyServerUrl: value.tallyServerUrl as string | null | undefined,
    tallyCompanyName: value.tallyCompanyName as string | null | undefined,
    zohoApiRegion: value.zohoApiRegion as string | undefined,
    zohoOrganizationId: value.zohoOrganizationId as string | null | undefined,
    zohoClientId: value.zohoClientId as string | null | undefined,
    zohoClientSecret: value.zohoClientSecret as string | null | undefined,
    zohoRefreshToken: value.zohoRefreshToken as string | null | undefined,
    clearZohoCredentials: value.clearZohoCredentials as boolean | undefined,
    ledgerMappings: value.ledgerMappings,
  };
}

function failure(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Error && !error.message.includes("Prisma") && error.name === "Error") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Finance integration settings request failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({ error: "Unable to process finance integration settings." }, { status: 500 });
}

async function authorize(organizationId: string) {
  const user = await requireSessionUser();
  const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_FINANCE_INTEGRATIONS");
  return { user, organization };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await context.params;
    const { organization } = await authorize(organizationId);
    return NextResponse.json(await getFinanceIntegrationConfig(organization.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await context.params;
    const { user, organization } = await authorize(organizationId);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 60_000) {
      return NextResponse.json({ error: "Integration settings payload is too large." }, { status: 413 });
    }
    const body = parseConfigInput(await request.json());
    const config = await saveFinanceIntegrationConfig(
      organization.id,
      user.id,
      body,
    );
    return NextResponse.json(config, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await context.params;
    const { organization } = await authorize(organizationId);
    const body: unknown = await request.json();
    if (!isRecord(body) || body.action !== "test-connection") {
      return NextResponse.json({ error: "Select a valid integration action." }, { status: 400 });
    }
    return NextResponse.json(await testFinanceIntegrationConnection(organization.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && !error.message.includes("Prisma")) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Finance integration connection test failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to test the finance integration." }, { status: 500 });
  }
}
