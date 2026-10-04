import { prisma } from "@/lib/database/prisma-client";

export async function getArticleOrderSummaryIndex(organizationId: string) {
  const orders = await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId },
    select: {
      id: true,
      orderNo: true,
      entityName: true,
      category: true,
      subCategory: true,
      season: true,
      article: true,
      styleName: true,
      colors: true,
      buyer: true,
      brand: true,
      sizeGroup: true,
      orderQty: true,
      deliveryDate: true,
      finalStatus: true,
      processStatus: true,
    },
    orderBy: [{ season: "asc" }, { article: "asc" }, { orderNo: "asc" }, { id: "asc" }],
  });

  const summaries = new Map<string, {
    season: string | null;
    article: string | null;
    orderCount: number;
    totalOrderQty: number;
    buyers: Set<string>;
    orderNumbers: string[];
    orders: Array<Record<string, unknown>>;
  }>();

  for (const order of orders) {
    const season = order.season?.trim() || null;
    const article = order.article?.trim() || null;
    const key = JSON.stringify([season, article]);
    let summary = summaries.get(key);

    if (!summary) {
      summary = {
        season,
        article,
        orderCount: 0,
        totalOrderQty: 0,
        buyers: new Set<string>(),
        orderNumbers: [],
        orders: [],
      };
      summaries.set(key, summary);
    }

    summary.orderCount += 1;
    summary.totalOrderQty += Number(order.orderQty ?? 0);
    if (order.buyer?.trim()) summary.buyers.add(order.buyer.trim());
    summary.orderNumbers.push(order.orderNo);
    summary.orders.push({
      ...order,
      season,
      article,
      deliveryDate: order.deliveryDate?.toISOString().slice(0, 10) ?? null,
    });
  }

  return [...summaries.values()].map((summary) => ({
    ...summary,
    buyers: [...summary.buyers].sort(),
  }));
}
