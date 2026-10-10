import { NextResponse } from "next/server";

import { setPlatformWhatsAppTemplateActive } from "@/lib/services/platform/platform-whatsapp-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    if (typeof body.isActive !== "boolean") throw new Error("Select whether this template is active.");
    const template = await setPlatformWhatsAppTemplateActive(templateId, body.isActive);
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update template status." },
      { status: 400 },
    );
  }
}
