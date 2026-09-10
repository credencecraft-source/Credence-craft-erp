import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getArticleOrderSummaries } from "@/lib/services/orders/order-service";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    const articleParam = url.searchParams.get("article");

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }

    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Access denied or organization not found." }, { status: 403 });
    }

    const summaries = await getArticleOrderSummaries(organization.id);

    // If an article parameter is requested, return single detail shape
    if (articleParam) {
      const decodedArticle = decodeURIComponent(articleParam);
      const found = (summaries ?? []).find((item: any) => item.article === decodedArticle);

      if (!found) {
        return NextResponse.json({ error: "Article summary not found." }, { status: 404 });
      }

      const enrichedSummary = {
        ...found,
        colors: found.colors ?? [],
        processes: found.processes ?? [],
        bomItems: (found.bomItems ?? []).map((item: any) => {
          const affectedOrderNumbers = item.affectedOrderNumbers || found.orderNumbers || [];
          const isCommon = affectedOrderNumbers.length >= (found.orderNumbers?.length || 1);
          return {
            ...item,
            usageScope: isCommon ? "common" : "special",
            affectedOrderNumbers,
          };
        }),
      };

      return NextResponse.json({ summary: enrichedSummary });
    }

    // Otherwise return all summaries
    return NextResponse.json({ summaries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build the article order summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}