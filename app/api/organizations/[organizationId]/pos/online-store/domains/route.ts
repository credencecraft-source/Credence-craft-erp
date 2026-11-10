import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import {
  createOrganizationOnlineStoreDomain,
  isVercelDomainIntegrationConfigured,
  listOrganizationOnlineStoreDomains,
  OnlineStoreDomainError,
} from "@/lib/services/pos/public-online-store-service";

const MANAGEMENT_ROLES = ["OWNER", "ADMIN"];

async function getAuthorizedOrganization(
  context: { params: Promise<{ organizationId: string }> },
) {
  const user = await requireSessionUser();
  const { organizationId } = await context.params;
  const organization = await requireOrganizationContext(user.id, organizationId, MANAGEMENT_ROLES);
  return { organization, user };
}

function errorResponse(error: unknown) {
  if (error instanceof OnlineStoreDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  }
  if (error instanceof Error && error.message === "Authentication required.") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({ error: "Unable to update custom-domain settings." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organization } = await getAuthorizedOrganization(context);
    const domains = await listOrganizationOnlineStoreDomains(organization.id);
    const vercelConfigured = isVercelDomainIntegrationConfigured();
    return NextResponse.json({
      domains,
      integrations: {
        vercel: {
          configured: vercelConfigured,
          automaticHttps: vercelConfigured,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organization, user } = await getAuthorizedOrganization(context);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 16_000) {
      return NextResponse.json({ error: "The domain request is too large." }, { status: 413 });
    }
    const body = await request.json().catch(() => null) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Enter valid custom-domain details." }, { status: 400 });
    }
    const domain = await createOrganizationOnlineStoreDomain({
      organization,
      actorId: user.id,
      hostname: (body as Record<string, unknown>).hostname,
      provider: (body as Record<string, unknown>).provider,
    });
    return NextResponse.json({ domain }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
