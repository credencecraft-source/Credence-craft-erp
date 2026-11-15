import { NextResponse } from "next/server";

import { savePlatformWhatsAppTemplate } from "@/lib/services/platform/platform-whatsapp-service";
import type { PlatformWhatsAppTemplateInput } from "@/lib/services/platform/platform-whatsapp-service";

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
    const template: PlatformWhatsAppTemplateInput = {
      templateName: typeof body.templateName === "string" ? body.templateName : "",
      sampleTemplateText: typeof body.sampleTemplateText === "string" ? body.sampleTemplateText : "",
      integratedNumber: typeof body.integratedNumber === "string" ? body.integratedNumber : "",
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : "",
      languageCode: typeof body.languageCode === "string" ? body.languageCode : "",
      isActive: body.isActive === true,
    };
    return NextResponse.json({
      template: await savePlatformWhatsAppTemplate(template, templateId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update WhatsApp template." },
      { status: 400 },
    );
  }
}
