import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import {
  buildPersistedOrderVariantCode,
} from "../lib/utilities/finished-goods-variant-code";
import {
  resolveOrderMasterSnapshots,
  type OrderMasterSnapshot,
} from "../lib/services/orders/order-master-snapshot-service";

const BATCH_SIZE = 200;
const SAMPLE_LIMIT = 10;
const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const confirmNonProduction = args.has("--confirm-non-production");

type OrderCandidate = {
  id: string;
  organization_id: string;
  orderNo: string;
  article: string | null;
  articleCode: string | null;
  master_article_id: string | null;
  master_variant_id: string | null;
  styleName: string | null;
  colors: string | null;
  variantCode: string | null;
};

const prisma = new PrismaClient();

function addSkip(skips: Array<{ orderNo: string; reason: string }>, orderNo: string, reason: string) {
  if (skips.length < SAMPLE_LIMIT) skips.push({ orderNo, reason });
}

async function getSnapshots(
  organizationId: string,
  orders: OrderCandidate[],
  sampleSkips: Array<{ orderNo: string; reason: string }>,
): Promise<OrderMasterSnapshot[]> {
  const sources = orders.map((order) => ({
    article: order.article,
    colors: order.colors,
    existingMasterArticleId: order.master_article_id,
    existingArticleCode: order.articleCode,
    preserveExistingArticle: Boolean(order.master_article_id),
  }));
  try {
    return await resolveOrderMasterSnapshots(prisma, organizationId, sources);
  } catch (error) {
    if (!(error instanceof Error)
      || !/matches more than one (master record|variant)/i.test(error.message)) {
      throw error;
    }

    return Promise.all(sources.map(async (source, index) => {
      try {
        return (await resolveOrderMasterSnapshots(prisma, organizationId, [source]))[0];
      } catch (recordError) {
        if (!(recordError instanceof Error)
          || !/matches more than one (master record|variant)/i.test(recordError.message)) {
          throw recordError;
        }
        addSkip(sampleSkips, orders[index].orderNo, recordError.message);
        return {
          articleCode: null,
          master_article_id: null,
          master_variant_id: null,
        };
      }
    }));
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured; load the approved non-production environment first.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("This backfill refuses to run when NODE_ENV is production.");
  }
  if (applyChanges && !confirmNonProduction) {
    throw new Error("Applying this backfill requires both --apply and --confirm-non-production.");
  }
  if (!applyChanges && !args.has("--dry-run")) {
    throw new Error("Choose --dry-run or explicitly provide --apply --confirm-non-production.");
  }

  let cursor: string | undefined;
  let eligibleCount = 0;
  let processedCount = 0;
  let skippedCount = 0;
  const sampleChanges: Array<{ orderNo: string; fields: string[] }> = [];
  const sampleSkips: Array<{ orderNo: string; reason: string }> = [];

  while (true) {
    const orders = await prisma.merchandisingOrder.findMany({
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        OR: [
          { variantCode: null },
          { articleCode: null },
          { master_article_id: null },
        ],
      },
      select: {
        id: true,
        organization_id: true,
        orderNo: true,
        article: true,
        articleCode: true,
        master_article_id: true,
        master_variant_id: true,
        styleName: true,
        colors: true,
        variantCode: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });
    if (orders.length === 0) break;
    cursor = orders[orders.length - 1].id;

    const byOrganization = new Map<string, OrderCandidate[]>();
    for (const order of orders) {
      byOrganization.set(order.organization_id, [
        ...(byOrganization.get(order.organization_id) ?? []),
        order,
      ]);
    }

    for (const [organizationId, organizationOrders] of byOrganization) {
      const snapshots = await getSnapshots(organizationId, organizationOrders, sampleSkips);
      for (const [index, order] of organizationOrders.entries()) {
        const snapshot = snapshots[index];
        const data: {
          articleCode?: string | null;
          master_article_id?: string | null;
          master_variant_id?: string | null;
          variantCode?: string | null;
        } = {};
        const unresolved: string[] = [];

        if (order.variantCode === null) {
          try {
            const code = buildPersistedOrderVariantCode(order.styleName, order.colors);
            if (code) data.variantCode = code;
            else unresolved.push("style or colour is missing");
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("Variant Code")) throw error;
            unresolved.push(error.message);
          }
        }
        if (order.articleCode === null && snapshot.articleCode !== null) {
          data.articleCode = snapshot.articleCode;
        } else if (order.articleCode === null) {
          unresolved.push("no unique matching Article master with an article code");
        }
        if (order.master_article_id === null && snapshot.master_article_id !== null) {
          data.master_article_id = snapshot.master_article_id;
        }
        if (order.master_variant_id === null && snapshot.master_variant_id !== null) {
          data.master_variant_id = snapshot.master_variant_id;
        }

        const fields = Object.keys(data);
        if (fields.length === 0) {
          skippedCount += 1;
          addSkip(sampleSkips, order.orderNo, unresolved.join("; ") || "No missing snapshot could be resolved.");
          continue;
        }

        eligibleCount += 1;
        if (sampleChanges.length < SAMPLE_LIMIT) {
          sampleChanges.push({ orderNo: order.orderNo, fields });
        }
        if (!applyChanges) continue;

        const updated = await prisma.merchandisingOrder.updateMany({
          where: {
            id: order.id,
            organization_id: organizationId,
            article: order.article,
            styleName: order.styleName,
            colors: order.colors,
            articleCode: order.articleCode,
            master_article_id: order.master_article_id,
            master_variant_id: order.master_variant_id,
            variantCode: order.variantCode,
          },
          data,
        });
        if (updated.count === 1) {
          processedCount += 1;
          if (unresolved.length > 0) {
            skippedCount += 1;
            addSkip(sampleSkips, order.orderNo, unresolved.join("; "));
          }
        } else {
          skippedCount += 1;
          addSkip(sampleSkips, order.orderNo, "The order changed during backfill; no fields were overwritten.");
        }
      }
    }
    if (orders.length < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    eligibleCount,
    processedCount,
    skippedCount,
    sampleChanges,
    sampleSkips,
  }, null, 2));

  if (applyChanges) {
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      article: string | null;
      article_code: string | null;
      style: string | null;
      color: string | null;
      variant_code: string | null;
    }>>`
      SELECT id, article, article_code, "styleName" AS style, colors AS color, variant_code
      FROM merchandising_orders
      WHERE article_code IS NOT NULL AND variant_code IS NOT NULL
      ORDER BY updated_at DESC, id ASC
      LIMIT 5
    `;
    console.log("Raw PostgreSQL verification rows:");
    console.log(JSON.stringify(rows, null, 2));
  }
}

main()
  .catch((error) => {
    console.error("Merchandising order snapshot backfill failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
