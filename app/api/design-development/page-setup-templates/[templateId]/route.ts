import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma-client";

import {
  getPageSetupTemplate,
  updatePageSetupTemplate,
} from "@/lib/services/design-development/page-setup-template-service";
import { getPageSetupTemplateApiErrorResponse } from "@/lib/services/design-development/page-setup-template-api-errors";
import { parsePageSetupTemplateInput } from "@/lib/services/design-development/page-setup-template-contract";
import { getPageSetupTemplateRequestContext } from "@/lib/services/design-development/page-setup-template-api-access";

function getErrorResponse(error: unknown, action: "load" | "save") {
  return getPageSetupTemplateApiErrorResponse(
    error,
    action,
    Reflect.get(prisma, "designDevelopmentPageSetupTemplate") !== undefined,
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  try {
    const requestContext = await getPageSetupTemplateRequestContext(request);
    if (!requestContext.authorized) return requestContext.response;
    const { templateId } = await context.params;
    const template = await getPageSetupTemplate(
      requestContext.user.id,
      requestContext.organizationId,
      templateId,
    );
    if (!template) {
      return NextResponse.json({ error: "Page Setup template not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    return getErrorResponse(error, "load");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  try {
    const requestContext = await getPageSetupTemplateRequestContext(request);
    if (!requestContext.authorized) return requestContext.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = parsePageSetupTemplateInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { templateId } = await context.params;
    const template = await updatePageSetupTemplate(
      requestContext.user.id,
      requestContext.organizationId,
      templateId,
      parsed.data,
    );
    if (!template) {
      return NextResponse.json({ error: "Page Setup template not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    return getErrorResponse(error, "save");
  }
}
