import { Prisma } from "@prisma/client";

export type FinishedGoodsVariantInput = {
  id?: string;
  fields: Record<string, unknown>;
};

export function parseFinishedGoodsPrice(value: unknown, fieldLabel: string) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(text)) {
    throw new Error(`${fieldLabel} must be a non-negative amount with up to four decimal places.`);
  }
  return new Prisma.Decimal(text);
}

export async function syncFinishedGoodsVariants(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  articleId: string,
  variants: FinishedGoodsVariantInput[],
) {
  const [existingOrganizationVariants, article] = await Promise.all([
    transaction.masterArticleVariant.findMany({
      where: { organization_id: organizationId },
      select: { id: true, article_id: true, color_id: true, variant_code: true },
    }),
    transaction.masterArticle.findFirst({
      where: { organization_id: organizationId, id: articleId },
      select: { article_code: true },
    }),
  ]);
  if (!article) {
    throw new Error("Article does not belong to this organization.");
  }
  const existingVariants = existingOrganizationVariants.filter((variant) => variant.article_id === articleId);
  const existingById = new Map(existingVariants.map((variant) => [variant.id, variant]));
  const colors = new Set<string>();
  const skus = new Set<string>();
  const variantCodes = new Set(
    existingOrganizationVariants
      .filter((variant) => variant.variant_code)
      .map((variant) => String(variant.variant_code).toLocaleLowerCase()),
  );
  const retainedIds: string[] = [];
  const activeDummyBatch = await transaction.organizationDummyDataBatch.findFirst({
    where: { organization_id: organizationId, status: "ACTIVE" },
    select: { id: true },
  });

  for (const [index, input] of variants.entries()) {
    const colorValue = String(input.fields.color ?? "").trim();
    if (!colorValue) {
      throw new Error(`Color variant ${index + 1} requires a color.`);
    }
    const color = await transaction.masterColor.findFirst({
      where: {
        organization_id: organizationId,
        OR: [{ id: colorValue }, { value_id: colorValue }, { colors: colorValue }],
      },
      select: { id: true, colors: true, legacy_metadata: true },
    });
    if (!color) {
      throw new Error("Every variant color must belong to this organization.");
    }
    const colorMetadata = color.legacy_metadata;
    if (
      activeDummyBatch
      && typeof colorMetadata === "object"
      && colorMetadata !== null
      && !Array.isArray(colorMetadata)
      && colorMetadata.dummyDataBatchId === activeDummyBatch.id
    ) {
      throw new Error("Dummy master values cannot be used by regular organization records.");
    }
    if (colors.has(color.id)) {
      throw new Error("Each color can only be added once to a finished goods style.");
    }
    colors.add(color.id);

    const existing = input.id ? existingById.get(input.id) : existingVariants.find((variant) => variant.color_id === color.id);
    if (input.id && !existing) {
      throw new Error("A submitted variant does not belong to this finished goods style.");
    }
    if (existing?.variant_code) {
      variantCodes.delete(String(existing.variant_code).toLocaleLowerCase());
    }
    const sku = String(input.fields.sku ?? "").trim() || null;
    const providedVariantCode = String(input.fields.variant_code ?? "").trim();
    let variantCode = providedVariantCode || String(existing?.variant_code ?? "").trim();
    if (!variantCode) {
      const baseCode = String(article.article_code ?? articleId).trim();
      let sequence = index + 1;
      variantCode = `${baseCode}-${String(sequence).padStart(2, "0")}`;
      while (variantCodes.has(variantCode.toLocaleLowerCase())) {
        sequence += 1;
        variantCode = `${baseCode}-${String(sequence).padStart(2, "0")}`;
      }
    }
    if (sku && skus.has(sku.toLocaleLowerCase())) {
      throw new Error("Variant SKUs must be unique.");
    }
    if (variantCode && variantCodes.has(variantCode.toLocaleLowerCase())) {
      throw new Error("Variant codes must be unique.");
    }
    if (sku) skus.add(sku.toLocaleLowerCase());
    if (variantCode) variantCodes.add(variantCode.toLocaleLowerCase());

    const data = {
      organization_id: organizationId,
      article_id: articleId,
      color_id: color.id,
      variant: color.colors,
      variant_code: variantCode,
      sku,
      price_override: parseFinishedGoodsPrice(input.fields.price_override, "Variant price"),
      is_active: true,
      sort_order: index,
    };
    const saved = existing
      ? await transaction.masterArticleVariant.update({ where: { id: existing.id }, data })
      : await transaction.masterArticleVariant.create({ data });
    retainedIds.push(saved.id);
  }

  await transaction.masterArticleVariant.deleteMany({
    where: {
      organization_id: organizationId,
      article_id: articleId,
      ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {}),
    },
  });
}
