import { NextResponse } from "next/server";

import { createPlatformLead, listPlatformLeads } from "@/lib/services/platform/platform-lead-service";

function readLeadInput(payload: unknown) {
  const body = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : {};
  return {
    name: typeof body.name === "string" ? body.name : "",
    email: typeof body.email === "string" ? body.email : "",
    mobile: typeof body.mobile === "string" ? body.mobile : "",
    companyName: typeof body.companyName === "string" ? body.companyName : "",
    city: typeof body.city === "string" ? body.city : "",
    source: typeof body.source === "string" ? body.source : "",
    stage: typeof body.stage === "string" ? body.stage : "",
    natureOfBusiness: typeof body.natureOfBusiness === "string" ? body.natureOfBusiness : "",
  };
}

export async function GET() {
  try {
    const leads = await listPlatformLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load leads." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const lead = await createPlatformLead(readLeadInput(await request.json()));
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create lead." },
      { status: 400 },
    );
  }
}
