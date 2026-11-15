import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma-client";

import {
  createPageSetupTemplate,
  deletePageSetupTemplates,
  listPageSetupTemplates,
  PageSetupTemplateDeleteConflictError,
} from "@/lib/services/design-development/page-setup-template-service";
import { getPageSetupTemplateApiErrorResponse } from "@/lib/services/design-development/page-setup-template-api-errors";
import { parsePageSetupTemplateInput } from "@/lib/services/design-development/page-setup-template-contract";
import { getPageSetupTemplateRequestContext } from "@/lib/services/design-development/page-setup-template-api-access";

function getErrorResponse(error: unknown, action: "load" | "save" | "delete") {
  return getPageSetupTemplateApiErrorResponse(
    error,
    action,
    Reflect.get(prisma, "designDevelopmentPageSetupTemplate") !== undefined,
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const context = await getPageSetupTemplateRequestContext(request);
    if (!context.authorized) return context.response;
    const templates = await listPageSetupTemplates(context.user.id, context.organizationId);
    return NextResponse.json({ templates });
  } catch (error) {
    return getErrorResponse(error, "load");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const context = await getPageSetupTemplateRequestContext(request);
    if (!context.authorized) return context.response;

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

    const template = await createPageSetupTemplate(
      context.user.id,
      context.organizationId,
      parsed.data,
    );
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return getErrorResponse(error, "save");
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const context = await getPageSetupTemplateRequestContext(request);
    if (!context.authorized) return context.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const ids = typeof body === "object" && body !== null && "ids" in body
      ? body.ids
      : undefined;
    if (
      !Array.isArray(ids)
      || ids.length < 1
      || ids.length > 100
      || ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 100)
      || new Set(ids).size !== ids.length
    ) {
      return NextResponse.json(
        { error: "Select between 1 and 100 unique Page Setup templates." },
        { status: 400 },
      );
    }

    const result = await deletePageSetupTemplates(
      context.user.id,
      context.organizationId,
      ids,
    );
    if (!result.success) {
      return NextResponse.json(
        { error: "One or more Page Setup templates were not found in this organization." },
        { status: 404 },
      );
    }
    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (error) {
    if (error instanceof PageSetupTemplateDeleteConflictError) {
      return NextResponse.json(
        { error: "The selection changed during deletion. Refresh the report and try again." },
        { status: 409 },
      );
    }
    return getErrorResponse(error, "delete");
  }
}
