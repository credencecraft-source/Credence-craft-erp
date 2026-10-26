import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import type { CopilotChatTurn } from "@/components/organizations/ai-copilot-chat-state";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_MESSAGE_LENGTH = 4000;

function isChatHistory(value: unknown): value is CopilotChatTurn[] {
  return Array.isArray(value)
    && value.length <= MAX_HISTORY_TURNS
    && value.every((turn) =>
      typeof turn === "object"
      && turn !== null
      && "role" in turn
      && (turn.role === "user" || turn.role === "assistant")
      && "content" in turn
      && typeof turn.content === "string"
      && turn.content.length > 0
      && turn.content.length <= MAX_HISTORY_MESSAGE_LENGTH,
    );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.workspace_id) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid Copilot chat request is required." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (
    typeof input.message !== "string"
    || !input.message.trim()
    || input.message.trim().length > MAX_MESSAGE_LENGTH
    || typeof input.organization_id !== "string"
    || !input.organization_id.trim()
    || input.organization_id.length > 100
    || typeof input.current_module !== "string"
    || !input.current_module.trim()
    || input.current_module.length > 120
    || !isChatHistory(input.history)
  ) {
    return NextResponse.json({ error: "The Copilot chat request is invalid." }, { status: 400 });
  }

  let organizationContext;
  try {
    organizationContext = await requireOrganizationContext(user.id, input.organization_id.trim());
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: "You do not have access to this organization." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to verify organization access." }, { status: 500 });
  }

  let organization;
  try {
    organization = await prisma.organization.findFirst({
      where: { id: organizationContext.id, organization_id: organizationContext.organizationId },
      select: { ai_enabled: true },
    });
  } catch {
    return NextResponse.json({ error: "Unable to verify AI Copilot access." }, { status: 500 });
  }
  if (!organization) {
    return NextResponse.json({ error: "Organization is unavailable." }, { status: 404 });
  }
  if (!organization.ai_enabled) {
    return NextResponse.json({ error: "AI Copilot is disabled for this organization." }, { status: 403 });
  }

  return NextResponse.json(
    { error: "AI Copilot is enabled, but its response service is not configured yet." },
    { status: 503 },
  );
}
