import { NextResponse } from "next/server";

import { updatePlatformLead } from "@/lib/services/platform/platform-lead-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const lead = await updatePlatformLead(leadId, {
      name: typeof body.name === "string" ? body.name : "",
      email: typeof body.email === "string" ? body.email : "",
      mobile: typeof body.mobile === "string" ? body.mobile : "",
      companyName: typeof body.companyName === "string" ? body.companyName : "",
      city: typeof body.city === "string" ? body.city : "",
      source: typeof body.source === "string" ? body.source : "",
      stage: typeof body.stage === "string" ? body.stage : "",
      natureOfBusiness: typeof body.natureOfBusiness === "string" ? body.natureOfBusiness : "",
    });
    return NextResponse.json({ lead });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update lead." },
      { status: 400 },
    );
  }
}
