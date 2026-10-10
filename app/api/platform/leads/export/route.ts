import { NextResponse } from "next/server";

import { listPlatformLeads } from "@/lib/services/platform/platform-lead-service";
import { createPlatformLeadsWorkbook } from "@/lib/services/platform/platform-lead-workbook-service";

export async function GET() {
  try {
    const leads = await listPlatformLeads();
    const workbook = await createPlatformLeadsWorkbook(leads);
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="platform-leads.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to export leads." },
      { status: 400 },
    );
  }
}
