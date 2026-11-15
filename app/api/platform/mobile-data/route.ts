import { NextResponse } from "next/server";

import { getPlatformNavigationAccess } from "@/lib/auth/platform-navigation-access";
import { getPlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { listOrganizationClients } from "@/lib/services/platform/client-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listPlatformTags } from "@/lib/services/platform/platform-tag-service";
import { listSegments } from "@/lib/services/platform/segment-service";
import { listSubscriptions } from "@/lib/services/platform/subscription-service";
import { listWorkspaceUsers } from "@/lib/services/platform/workspace-user-service";
import { listPlatformCampaigns } from "@/lib/services/platform/platform-campaign-service";
import {
  listPlatformLeadAppLogins,
  listPlatformLeads,
} from "@/lib/services/platform/platform-lead-service";
import { listSupportTickets } from "@/lib/services/organizations/support-ticket-service";

const CONFIGURATION_MODULES = new Set([
  "business-types",
  "segments",
  "tags",
  "plans",
  "email-otp",
  "mobile-otp",
  "databases",
  "whatsapp",
  "platform-access",
]);

export async function GET(request: Request) {
  try {
    const admin = await getPlatformSessionAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Platform sign-in is required." }, { status: 401 });
    }
    const moduleName = new URL(request.url).searchParams.get("module") ?? "";
    const access = getPlatformNavigationAccess(admin.team_role);
    const hasAccess = (permission: keyof typeof access) =>
      admin.actualRole === "SUPER_ADMIN" || access[permission];

    if (
      (CONFIGURATION_MODULES.has(moduleName) &&
        !hasAccess("canAccessConfiguration")) ||
      (moduleName === "subscriptions" &&
        !hasAccess("canAccessConfiguration") &&
        !hasAccess("canAccessLeadsAndSubscriptions")) ||
      (moduleName === "organisations" && !hasAccess("canAccessWorkspace")) ||
      (moduleName === "workspace-users" && !hasAccess("canAccessWorkspace")) ||
      (moduleName === "leads" && !hasAccess("canAccessLeads")) ||
      (moduleName === "campaigns" && !hasAccess("canAccessLeadsAndSubscriptions")) ||
      (moduleName === "support-tickets" && !hasAccess("canAccessSupport"))
    ) {
      return NextResponse.json({ error: "You do not have access to this platform module." }, { status: 403 });
    }

    switch (moduleName) {
      case "organisations":
        return NextResponse.json({ organisations: await listOrganizationClients() });
      case "subscriptions":
        return NextResponse.json({ subscriptions: await listSubscriptions() });
      case "workspace-users":
        return NextResponse.json({ users: await listWorkspaceUsers() });
      case "leads":
        {
          const [leadRows, appLogins] = await Promise.all([
            listPlatformLeads(),
            admin.actualRole === "SUPER_ADMIN" || admin.team_role !== "SALES_MANAGER"
              ? listPlatformLeadAppLogins()
              : Promise.resolve([]),
          ]);
          const leads = leadRows.map(({ campaignEntries, ...lead }) => ({
            ...lead,
            campaign_date: campaignEntries[0]?.campaign.campaign_date.toISOString() ?? null,
            last_campaign_date: campaignEntries[0]?.added_at.toISOString() ?? null,
            created_at: lead.created_at.toISOString(),
            updated_at: lead.updated_at.toISOString(),
            recordType: "THIRD_PARTY" as const,
          }));
          return NextResponse.json({
            leads,
            appLogins: appLogins.map((user) => ({
              ...user,
              created_at: user.created_at.toISOString(),
              last_login_at: user.last_login_at?.toISOString() ?? "",
            })),
          });
        }
      case "campaigns":
        return NextResponse.json({ campaigns: await listPlatformCampaigns() });
      case "support-tickets":
        return NextResponse.json({ tickets: await listSupportTickets() });
      case "business-types":
        return NextResponse.json({ businessTypes: await listBusinessTypes() });
      case "segments":
        return NextResponse.json({ segments: await listSegments() });
      case "tags":
        return NextResponse.json({ tags: await listPlatformTags() });
      case "plans":
        return NextResponse.json({ plans: await listPlans() });
      default:
        return NextResponse.json({ error: "This platform module does not provide a mobile data view yet." }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load platform module data." },
      { status: 400 },
    );
  }
}
