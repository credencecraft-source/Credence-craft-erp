import type { Prisma } from "@prisma/client";

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
) {
  const selected = [...new Set(selectedValues.map((value) => value.trim()).filter(Boolean))];
  if (selected.length > 0 && !sizeGroupId) {
    throw new Error("Select a Size Group before choosing sizes.");
  }

  let selectedSizeIds: string[] = [];
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
    selectedSizeIds = matchedSizes.map((link) => link.size_id);
  }

  return selectedSizeIds;
}

async function saveFinishedGoodsSizeIds(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  articleId: string,
  selectedSizeIds: string[],
) {
  await transaction.masterArticleSize.deleteMany({
    where: { organization_id: organizationId, article_id: articleId },
  });
  if (selectedSizeIds.length > 0) {
    await transaction.masterArticleSize.createMany({
      data: selectedSizeIds.map((sizeId) => ({
        organization_id: organizationId,
        article_id: articleId,
        size_id: sizeId,
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
) {
  const selectedSizeIds = await resolveFinishedGoodsSizeIds(
    transaction,
    organizationId,
    sizeGroupId,
    selectedValues,
  );
  await saveFinishedGoodsSizeIds(transaction, organizationId, articleId, selectedSizeIds);
}
