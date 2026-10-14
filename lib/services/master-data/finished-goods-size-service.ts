import type { Prisma } from "@prisma/client";
import { parseFinishedGoodsPrice } from "@/lib/services/master-data/finished-goods-variant-service";

export type FinishedGoodsSizePriceInput = {
  size: string;
  price: string | null;
};

export function parseFinishedGoodsSizePrices(value: unknown): FinishedGoodsSizePriceInput[] {
  if (!Array.isArray(value)) {
    throw new Error("Article size prices must be a list of size and price values.");
  }
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Article size price ${index + 1} is invalid.`);
    }
    const size = (entry as Record<string, unknown>).size;
    const price = (entry as Record<string, unknown>).price;
    if (typeof size !== "string" || (price !== null && typeof price !== "string")) {
      throw new Error(`Article size price ${index + 1} is invalid.`);
    }
    return { size: size.trim(), price: typeof price === "string" ? price.trim() || null : null };
  });
}

function belongsToDummyBatch(record: { legacy_metadata: unknown }, batchId: string) {
  const metadata = record.legacy_metadata;
  return typeof metadata === "object"
    && metadata !== null
    && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).dummyDataBatchId === batchId;
}

type FinishedGoodsSizeDatabase = Pick<
  Prisma.TransactionClient,
  "masterSizeGroup" | "organizationDummyDataBatch" | "masterSizeGroupSize"
>;

async function resolveFinishedGoodsSizeIds(
  database: FinishedGoodsSizeDatabase,
  organizationId: string,
  sizeGroupId: string | null,
  selectedValues: string[],
): Promise<Array<{ id: string; label: string }>> {
  const selected = [...new Set(selectedValues.map((value) => value.trim()).filter(Boolean))];
  if (selected.length > 0 && !sizeGroupId) {
    throw new Error("Select a Size Group before choosing sizes.");
  }

  let selectedSizes: Array<{ id: string; label: string }> = [];
  if (sizeGroupId) {
    const [group, activeDummyBatch, groupSizes] = await Promise.all([
      database.masterSizeGroup.findFirst({
        where: { organization_id: organizationId, id: sizeGroupId },
        select: { id: true, legacy_metadata: true },
      }),
      database.organizationDummyDataBatch.findFirst({
        where: { organization_id: organizationId, status: "ACTIVE" },
        select: { id: true },
      }),
      database.masterSizeGroupSize.findMany({
        where: { organization_id: organizationId, size_group_id: sizeGroupId },
        include: { size: true },
        orderBy: { created_at: "asc" },
      }),
    ]);
    if (!group) throw new Error("Size Group must belong to this organization.");
    if (activeDummyBatch && belongsToDummyBatch(group, activeDummyBatch.id)) {
      throw new Error("Dummy master values cannot be used by regular organization records.");
    }

    const selectedKeys = new Set(selected.map((value) => value.toLocaleLowerCase()));
    const matchedSizes = groupSizes.filter((link) => {
      if (link.size.organization_id !== organizationId) return false;
      if (activeDummyBatch && belongsToDummyBatch(link.size, activeDummyBatch.id)) return false;
      return [link.size.id, link.size.value_id, link.size.size]
        .some((value) => selectedKeys.has(value.toLocaleLowerCase()));
    });
    const matchedLabels = new Set(matchedSizes.map((link) => link.size.size.toLocaleLowerCase()));
    if (matchedSizes.length !== selected.length || matchedLabels.size !== selected.length) {
      throw new Error("Every selected size must belong to the chosen Size Group in this organization.");
    }
    selectedSizes = matchedSizes.map((link) => ({ id: link.size_id, label: link.size.size }));
  }

  return selectedSizes;
}

async function saveFinishedGoodsSizeIds(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  articleId: string,
  selectedSizes: Array<{ id: string; label: string }>,
  sizePrices: FinishedGoodsSizePriceInput[],
) {
  const selectedSizeKeys = new Set(selectedSizes.map(({ label }) => label.toLocaleLowerCase()));
  const priceBySize = new Map<string, ReturnType<typeof parseFinishedGoodsPrice>>();
  for (const entry of sizePrices) {
    const size = entry.size.trim();
    const key = size.toLocaleLowerCase();
    if (!size || !selectedSizeKeys.has(key) || priceBySize.has(key)) {
      throw new Error("Size prices must match each selected Article size exactly once.");
    }
    priceBySize.set(key, parseFinishedGoodsPrice(entry.price, `Price for size ${size}`));
  }
  const hasSizePrice = [...priceBySize.values()].some((price) => price !== null);
  if (hasSizePrice) {
    const pricesAreUniform = selectedSizes.length > 0
      && selectedSizes.every(({ label }) => priceBySize.get(label.toLocaleLowerCase()) !== null
        && priceBySize.has(label.toLocaleLowerCase()))
      && new Set(selectedSizes.map(({ label }) => priceBySize.get(label.toLocaleLowerCase())?.toString())).size === 1;
    const uniformPrice = pricesAreUniform
      ? priceBySize.get(selectedSizes[0].label.toLocaleLowerCase())
      : null;
    const updatedArticle = await transaction.masterArticle.updateMany({
      where: { organization_id: organizationId, id: articleId },
      data: { default_price: uniformPrice },
    });
    if (updatedArticle.count !== 1) {
      throw new Error("Article does not belong to this organization.");
    }
  }

  await transaction.masterArticleSize.deleteMany({
    where: { organization_id: organizationId, article_id: articleId },
  });
  if (selectedSizes.length > 0) {
    await transaction.masterArticleSize.createMany({
      data: selectedSizes.map(({ id, label }) => ({
        organization_id: organizationId,
        article_id: articleId,
        size_id: id,
        price: priceBySize.get(label.toLocaleLowerCase()) ?? null,
      })),
    });
  }
}

export async function syncFinishedGoodsSizes(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  articleId: string,
  sizeGroupId: string | null,
  selectedValues: string[],
  sizePrices: FinishedGoodsSizePriceInput[] = [],
) {
  const selectedSizes = await resolveFinishedGoodsSizeIds(
    transaction,
    organizationId,
    sizeGroupId,
    selectedValues,
  );
  await saveFinishedGoodsSizeIds(transaction, organizationId, articleId, selectedSizes, sizePrices);
}
