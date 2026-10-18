import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

type ArticleOrderSummaryPage = {
  season: string | null;
  article: string | null;
  articleCount: number;
  orderCount: number;
  totalOrderQty: number;
  buyers: string[];
  styles: string[];
  statuses: string[];
};

export async function getArticleOrderSummaryIndex(
  organizationId: string,
  input: {
    view?: "seasons" | "articles";
    season?: string | null;
    search?: string;
    status?: string;
    offset?: number;
    limit?: number;
  } = {},
) {
  const view = input.view ?? "seasons";
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const search = String(input.search ?? "").trim().slice(0, 100);
  const conditions = [Prisma.sql`orders.organization_id = ${organizationId}`];

  if (input.status) {
    conditions.push(Prisma.sql`orders."finalStatus" = ${input.status}`);
  }
  if (view === "articles") {
    const selectedSeason = input.season?.trim() || null;
    conditions.push(Prisma.sql`NULLIF(BTRIM(orders.season), '') IS NOT DISTINCT FROM ${selectedSeason}`);
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(Prisma.sql`(
      COALESCE(orders.season, '') ILIKE ${pattern}
      OR COALESCE(orders.article, '') ILIKE ${pattern}
      OR COALESCE(orders."orderNo", '') ILIKE ${pattern}
      OR COALESCE(orders.buyer, '') ILIKE ${pattern}
      OR COALESCE(orders."styleName", '') ILIKE ${pattern}
      OR COALESCE(orders.brand, '') ILIKE ${pattern}
      OR COALESCE(orders.colors, '') ILIKE ${pattern}
      OR COALESCE(orders."processStatus", '') ILIKE ${pattern}
      OR COALESCE(orders."finalStatus", '') ILIKE ${pattern}
    )`);
  }

  const rows = await prisma.$queryRaw<Array<{
    season: string | null;
    article: string | null;
    article_count: bigint;
    order_count: bigint;
    total_order_qty: bigint | number | null;
    buyers: string[];
    styles: string[];
    statuses: string[];
  }>>(Prisma.sql`
    WITH filtered_orders AS (
      SELECT
        NULLIF(BTRIM(orders.season), '') AS season,
        NULLIF(BTRIM(orders.article), '') AS article,
        orders."orderNo" AS order_no,
        orders.buyer,
        orders."styleName" AS style_name,
        orders."orderQty" AS order_qty,
        orders."finalStatus" AS final_status
      FROM merchandising_orders AS orders
      WHERE ${Prisma.join(conditions, " AND ")}
    )
    SELECT
      season,
      ${view === "articles" ? Prisma.sql`article` : Prisma.sql`NULL::text`} AS article,
      (COUNT(DISTINCT article) + CASE WHEN COUNT(*) FILTER (WHERE article IS NULL) > 0 THEN 1 ELSE 0 END)::bigint AS article_count,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(order_qty), 0)::bigint AS total_order_qty,
      COALESCE(ARRAY_AGG(DISTINCT NULLIF(BTRIM(buyer), '') ORDER BY NULLIF(BTRIM(buyer), '')) FILTER (WHERE NULLIF(BTRIM(buyer), '') IS NOT NULL), ARRAY[]::text[]) AS buyers,
      COALESCE(ARRAY_AGG(DISTINCT NULLIF(BTRIM(style_name), '') ORDER BY NULLIF(BTRIM(style_name), '')) FILTER (WHERE NULLIF(BTRIM(style_name), '') IS NOT NULL), ARRAY[]::text[]) AS styles,
      COALESCE(ARRAY_AGG(DISTINCT final_status ORDER BY final_status) FILTER (WHERE final_status IS NOT NULL), ARRAY[]::text[]) AS statuses
    FROM filtered_orders
    GROUP BY season${view === "articles" ? Prisma.sql`, article` : Prisma.empty}
    ORDER BY season ASC NULLS LAST${view === "articles" ? Prisma.sql`, article ASC NULLS LAST` : Prisma.empty}
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const summaries: ArticleOrderSummaryPage[] = pageRows.map((row) => ({
    season: row.season,
    article: row.article,
    articleCount: Number(row.article_count),
    orderCount: Number(row.order_count),
    totalOrderQty: Number(row.total_order_qty ?? 0),
    buyers: row.buyers,
    styles: row.styles,
    statuses: row.statuses,
  }));

  return {
    summaries,
    nextOffset: hasMore ? offset + limit : null,
  };
}
