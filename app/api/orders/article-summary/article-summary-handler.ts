import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session-manager";
import { getArticleOrderSummaries } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId")?.trim();
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  const hasArticle = url.searchParams.has("article");
  const hasSeason = url.searchParams.has("season");

  if (!organizationId) {
    return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
  }

  if (hasArticle !== hasSeason) {
    return NextResponse.json({ error: "Season and article must be provided together." }, { status: 400 });
  }

  const articleParam = url.searchParams.get("article");
  const seasonParam = url.searchParams.get("season");
  if ((articleParam?.length ?? 0) > 255 || (seasonParam?.length ?? 0) > 255) {
    return NextResponse.json({ error: "Season or article value is too long." }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (workspaceId && workspaceId !== user.workspace_id) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const organization = await requireOrganizationContext(user.id, organizationId);
    const summaries = await getArticleOrderSummaries(organization.id);

    if (hasArticle && hasSeason) {
      const normalizeLabel = (value: string | null) => value?.trim() || null;
      const requestedArticle = normalizeLabel(articleParam);
      const requestedSeason = normalizeLabel(seasonParam);
      const found = summaries.find((item) =>
        item.article === requestedArticle && item.season === requestedSeason,
      );

      if (!found) {
        return NextResponse.json({ error: "Article summary not found." }, { status: 404 });
      }

      const enrichedSummary = {
        ...found,
        bomItems: found.bomItems.map((item) => {
          const affectedOrderNumbers = item.affectedOrderNumbers;
          return {
            ...item,
            usageScope: affectedOrderNumbers.length >= (found.orderCount || 1) ? "common" : "special",
            affectedOrderNumbers,
          };
        }),
      };

      return NextResponse.json({ summary: enrichedSummary });
    }

    // Otherwise return all summaries
    return NextResponse.json({ summaries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("Access denied") ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Access denied." : "Unable to build the article order summary." }, { status });
  }
}