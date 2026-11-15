import { NextResponse } from "next/server";

import { listOtherAssignedPlatformLeads } from "@/lib/services/platform/platform-lead-service";

export async function GET() {
  try {
    const leads = await listOtherAssignedPlatformLeads();
    return NextResponse.json({
      leads: leads.map(({ campaignEntries, ...lead }) => ({
        ...lead,
        campaign_date: campaignEntries[0]?.campaign.campaign_date.toISOString() ?? null,
        last_campaign_date: campaignEntries[0]?.added_at.toISOString() ?? null,
        created_at: lead.created_at.toISOString(),
        updated_at: lead.updated_at.toISOString(),
        recordType: "THIRD_PARTY" as const,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load other-assigned leads.";
    const status = message.includes("sign-in") ? 401 : message.includes("Only Sales Managers") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
