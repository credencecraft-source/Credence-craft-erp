import { NextResponse } from "next/server";

import {
  listPlatformWhatsAppTemplates,
  savePlatformWhatsAppTemplate,
} from "@/lib/services/platform/platform-whatsapp-service";

function readTemplate(payload: unknown) {
  const body = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : {};
  return {
    templateName: typeof body.templateName === "string" ? body.templateName : "",
    sampleTemplateText: typeof body.sampleTemplateText === "string" ? body.sampleTemplateText : "",
    integratedNumber: typeof body.integratedNumber === "string" ? body.integratedNumber : "",
    imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : "",
    languageCode: typeof body.languageCode === "string" ? body.languageCode : "",
    isActive: body.isActive === true,
  };
}

export async function GET(request: Request) {
  try {
    const activeOnly = new URL(request.url).searchParams.get("activeOnly") === "true";
    const templates = await listPlatformWhatsAppTemplates(activeOnly);
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load WhatsApp templates." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const template = await savePlatformWhatsAppTemplate(readTemplate(await request.json()));
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create WhatsApp template." },
      { status: 400 },
    );
  }
}
