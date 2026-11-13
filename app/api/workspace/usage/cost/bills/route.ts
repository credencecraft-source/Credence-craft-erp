import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  createTenantUsageBills,
  listTenantUsageBillMonths,
  TenantUsageBillMonthError,
  TenantUsageBillPermissionError,
} from "@/lib/services/workspace/tenant-usage-billing-service";

export const maxDuration = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorResponse(error: unknown) {
  if (error instanceof TenantUsageBillPermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof TenantUsageBillMonthError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2002" || error.code === "P2034")
  ) {
    return NextResponse.json(
      { error: "This month's bills changed concurrently. Refresh and try again." },
      { status: 409 },
    );
  }

  console.error("Unable to process workspace usage bills.", {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({ error: "Unable to process workspace usage bills." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId || workspaceId !== user.workspace_id) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    const result = await listTenantUsageBillMonths(user.id);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "A valid JSON request is required." }, { status: 400 });
    }
    if (
      !isRecord(body)
      || body.workspaceId !== user.workspace_id
      || typeof body.month !== "string"
    ) {
      return NextResponse.json({ error: "Workspace and billing month are required." }, { status: 400 });
    }

    const result = await createTenantUsageBills({
      workspaceUserId: user.id,
      month: body.month,
    });
    return NextResponse.json(result, { status: result.createdCount > 0 ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
