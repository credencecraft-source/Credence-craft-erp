import { prisma } from "@/lib/database/prisma-client";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";

import { createOrdersAtomically, type CreateOrderInput } from "./order-service";

type SelectedColor = {
  variantId: string;
  quantities: Array<{ size: string; quantity: number }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function parseSelectedColors(value: unknown): SelectedColor[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error("Select at least one color to create an order.");
  }
  const seenVariants = new Set<string>();
  return value.map((entry, colorIndex) => {
    if (!isRecord(entry)) throw new Error(`Color ${colorIndex + 1} has invalid data.`);
    const variantId = requiredString(entry.variantId, `Color ${colorIndex + 1}`);
    if (seenVariants.has(variantId)) throw new Error("A color can only be selected once.");
    seenVariants.add(variantId);
    if (!Array.isArray(entry.quantities)) throw new Error(`Quantities for color ${colorIndex + 1} are invalid.`);
    const seenSizes = new Set<string>();
    const quantities = entry.quantities.map((row, sizeIndex) => {
      if (!isRecord(row)) throw new Error(`Size ${sizeIndex + 1} for color ${colorIndex + 1} is invalid.`);
      const size = requiredString(row.size, `Size ${sizeIndex + 1}`);
      if (seenSizes.has(size.toLocaleLowerCase())) {
        throw new Error(`Size ${size} is repeated for a selected color.`);
      }
      seenSizes.add(size.toLocaleLowerCase());
      const quantity = Number(row.quantity);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new Error(`Enter a positive whole-number quantity for ${size}.`);
      }
      return { size, quantity };
    });
    if (quantities.length === 0) throw new Error("Enter a quantity for each selected color.");
    return { variantId, quantities };
  });
}

async function requireActiveMasterLabel(organizationId: string, moduleKey: string, reference: string, label: string) {
  const [value] = await getMasterValuesForOrganization(organizationId, moduleKey, false, {
    search: reference,
    exactSearch: true,
    limit: 1,
  });
  if (!value || value.id !== reference && value.value_id !== reference && value.label !== reference) {
    throw new Error(`Select an active ${label} belonging to this organization.`);
  }
  return value.label;
}

export async function createArticleBasedOrders(
  organizationId: string,
  request: unknown,
  userId: string,
) {
  if (!isRecord(request)) throw new Error("Order details are invalid.");
  const articleId = requiredString(request.articleId, "Article");
  const entityId = requiredString(request.entityId, "Entity");
  const buyerId = requiredString(request.buyerId, "Buyer");
  const seasonId = requiredString(request.seasonId, "Season");
  const deliveryDate = requiredString(request.deliveryDate, "Delivery Date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
    || Number.isNaN(new Date(`${deliveryDate}T00:00:00.000Z`).getTime())
    || new Date(`${deliveryDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== deliveryDate) {
    throw new Error("Enter a valid delivery date.");
  }

  const [article] = await getMasterValuesForOrganization(organizationId, "article", false, {
    search: articleId,
    exactSearch: true,
    limit: 1,
  });
  if (!article || article.id !== articleId && article.value_id !== articleId) {
    throw new Error("Select an active Article belonging to this organization.");
  }

  const variants = Array.isArray(article.fields.variants)
    ? article.fields.variants.filter(isRecord).flatMap((variant) => (
      typeof variant.id === "string" && typeof variant.color === "string"
        ? [{
            id: variant.id,
            color: variant.color,
            priceOverride: typeof variant.price_override === "string" && variant.price_override.trim()
              ? variant.price_override.trim()
              : null,
          }]
        : []
    ))
    : [];
  const selectedColors = parseSelectedColors(request.colors);
  const selectedVariantIds = selectedColors.map((color) => color.variantId);
  const activeVariants = await prisma.masterArticleVariant.findMany({
    where: {
      organization_id: organizationId,
      article_id: article.id,
      id: { in: selectedVariantIds },
      is_active: true,
      color: { organization_id: organizationId, is_active: true },
    },
    select: { id: true, color: { select: { colors: true } } },
  });
  const variantDetails = new Map(activeVariants.map((variant) => {
    const articleVariant = variants.find(({ id }) => id === variant.id);
    return [variant.id, {
      color: variant.color.colors,
      price: articleVariant?.priceOverride ?? null,
    }] as const;
  }));
  if (variantDetails.size !== selectedVariantIds.length
    || selectedVariantIds.some((id) => !variants.some((variant) => variant.id === id))) {
    throw new Error("Every selected color must be an active variant of this Article.");
  }

  const sizeGroup = requiredString(article.fields.Size_Group, "Article Size Group");
  const allowedSizes = Array.isArray(article.fields.Sizes)
    ? article.fields.Sizes.filter((size): size is string => typeof size === "string" && size.trim() !== "")
    : [];
  if (allowedSizes.length === 0) throw new Error("Add sizes to this Article before creating an order.");
  const requestedSizes = [...new Set(selectedColors.flatMap((color) => color.quantities.map(({ size }) => size)))];
  const linkedSizes = await prisma.masterArticleSize.findMany({
    where: {
      organization_id: organizationId,
      article_id: article.id,
      size: { organization_id: organizationId, is_active: true, size: { in: requestedSizes } },
    },
    select: { size: { select: { size: true } } },
  });
  const activeArticleSizes = new Set(linkedSizes.map((link) => link.size.size));
  if (requestedSizes.some((size) => !activeArticleSizes.has(size) || !allowedSizes.includes(size))) {
    throw new Error("Every order size must be active and selected on this Article.");
  }

  const [entityName, buyer, season, sizeGroups] = await Promise.all([
    requireActiveMasterLabel(organizationId, "entity", entityId, "Entity"),
    requireActiveMasterLabel(organizationId, "buyer", buyerId, "Buyer"),
    requireActiveMasterLabel(organizationId, "season", seasonId, "Season"),
    getMasterValuesForOrganization(organizationId, "size-group", false, {
      search: sizeGroup,
      exactSearch: true,
      limit: 1,
    }),
  ]);
  const selectedSizeGroup = sizeGroups.find((group) => group.label === sizeGroup);
  const brand = String(selectedSizeGroup?.fields.Brand1 ?? "").trim();
  if (!brand) throw new Error("The Article Size Group must have an active Brand.");

  const category = requiredString(article.fields.Category, "Article Category");
  const subCategory = requiredString(article.fields.Subcategory, "Article Subcategory");
  const defaultPrice = typeof article.fields.default_price === "string" && article.fields.default_price.trim()
    ? article.fields.default_price.trim()
    : null;
  const orderInputs: CreateOrderInput[] = selectedColors.map((color) => {
    const variant = variantDetails.get(color.variantId);
    if (!variant) throw new Error("A selected Article color is no longer active.");
    const buyerPoPrice = variant.price ?? defaultPrice;
    return {
      entityName,
      category,
      subCategory,
      season,
      article: article.label,
      styleName: article.label,
      colors: variant.color,
      buyer,
      brand,
      sizeGroup,
      deliveryDate,
      rows: color.quantities.map(({ size, quantity }) => ({
        size,
        buyerSize: size,
        beforeExcessQty: quantity,
        ...(buyerPoPrice ? { buyerPoPrice } : {}),
      })),
    };
  });

  return createOrdersAtomically(organizationId, orderInputs, userId);
}
